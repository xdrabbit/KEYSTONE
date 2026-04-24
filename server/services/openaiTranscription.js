const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const OpenAI = require('openai');
const db = require('../database');
const { importTranscriptionResult } = require('./transcription');
const jobTracker = require('./jobTracker');

function recordingExists(recordingId) {
  return !!db.prepare('SELECT 1 FROM recordings WHERE id = ?').get(recordingId);
}

const OPENAI_MODEL = 'gpt-4o-transcribe-diarize';

// gpt-4o-transcribe-diarize has TWO hard limits:
//   * 25 MB max upload (we transcode to keep size down).
//   * 1400 s max audio duration per request (independent of file size).
// chunking_strategy=auto only governs how the model processes audio it has
// already accepted — it does NOT waive the duration cap. So for long audio
// we must split into chunks ourselves, transcribe each, and stitch results.
const OPENAI_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const OPENAI_MAX_DURATION_SECONDS = 1400;
const CHUNK_DURATION_SECONDS = 1200; // 20 min — safety margin under the cap
const TRANSCODE_SAMPLE_RATE = 16000;
const TRANSCODE_BITRATE = '24k';
// How many chunks to transcode + upload concurrently. The model takes a few
// minutes per 20-min chunk, so even modest parallelism cuts wall-clock time
// dramatically. Cap is per-recording — the server still serves multiple
// recordings in parallel if they each get their own concurrency budget.
const CHUNK_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.OPENAI_CHUNK_CONCURRENCY || '3', 10)
);
// gpt-4o-transcribe-diarize is slow on long audio (the diarization pass
// appears to scale roughly with duration), and the openai-node SDK default
// 600s per-request timeout is too tight for 20-min chunks. Bump to 30 min.
const OPENAI_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Run `tasks` in parallel with `concurrency` workers. Records the result of
// each task at its original index. If any task throws (other than AbortError),
// triggers an internal AbortController so siblings stop ASAP — sparing API
// budget and time. Honors `externalSignal` for user-cancel; lets the caller
// distinguish "user cancelled" from "first failure" by throwing AbortError
// vs. the original error respectively.
async function runChunksConcurrent(tasks, concurrency, externalSignal, processOne) {
  const internalAbort = new AbortController();
  const combinedSignal = AbortSignal.any([externalSignal, internalAbort.signal]);
  const results = new Array(tasks.length);
  let firstError = null;
  let cursor = 0;

  const worker = async () => {
    while (true) {
      if (combinedSignal.aborted) return;
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        results[i] = await processOne(i, tasks[i], combinedSignal);
      } catch (err) {
        if (err?.name !== 'AbortError' && !firstError) {
          firstError = err;
          if (!externalSignal.aborted) internalAbort.abort();
        }
        // swallow — controller signal will stop other workers
      }
    }
  };

  await Promise.all(
    Array(Math.min(concurrency, tasks.length)).fill(0).map(worker)
  );

  if (externalSignal.aborted) {
    const e = new Error('aborted'); e.name = 'AbortError'; throw e;
  }
  if (firstError) throw firstError;
  return results;
}

// Probe an audio file's duration in seconds via ffprobe.
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e) => reject(new Error(`ffprobe not available: ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err.slice(-500)}`));
      const dur = parseFloat(out.trim());
      if (isNaN(dur)) return reject(new Error(`could not parse duration from ffprobe: ${out}`));
      resolve(dur);
    });
  });
}

// Transcode an audio segment (from `startSec` for `durationSec`) of `sourcePath`
// to a small Opus-in-OGG file at `outPath`. If `durationSec` is null, encodes
// to end-of-file. If `signal` fires, kills ffmpeg and rejects with AbortError.
function transcodeChunk(sourcePath, outPath, startSec, durationSec, signal) {
  return new Promise((resolve, reject) => {
    const args = ['-y'];
    if (startSec > 0) args.push('-ss', String(startSec));
    if (durationSec != null) args.push('-t', String(durationSec));
    args.push(
      '-i', sourcePath,
      '-vn',
      '-ac', '1',
      '-ar', String(TRANSCODE_SAMPLE_RATE),
      '-c:a', 'libopus',
      '-b:a', TRANSCODE_BITRATE,
      '-application', 'voip',
      outPath,
    );
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ok */ } }, 2000);
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error(`ffmpeg not available: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (aborted) {
        try { fs.unlinkSync(outPath); } catch { /* ok */ }
        const e = new Error('aborted');
        e.name = 'AbortError';
        return reject(e);
      }
      if (code === 0) return resolve(outPath);
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Plan the chunk boundaries for a recording of `totalDuration` seconds.
// Returns [{ start, duration }] covering [0, totalDuration].
function planChunks(totalDuration) {
  if (totalDuration <= CHUNK_DURATION_SECONDS) {
    return [{ start: 0, duration: totalDuration }];
  }
  const chunks = [];
  for (let s = 0; s < totalDuration; s += CHUNK_DURATION_SECONDS) {
    chunks.push({
      start: s,
      duration: Math.min(CHUNK_DURATION_SECONDS, totalDuration - s),
    });
  }
  return chunks;
}

// Map a 0-based index to a spreadsheet-style label: 0->A, 25->Z, 26->AA, ...
// Used to give each distinct (chunk, original-label) pair a unique global
// SPEAKER_X label across the whole recording. Same person showing up in
// multiple chunks ends up as multiple labels — the user can rename to merge
// in the existing speaker-rename UI.
function indexToLetters(idx) {
  let s = '';
  let n = idx;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function startOpenAITranscription(recordingId, audioPath, options = {}) {
  const { language = null } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fail the recording without throwing — throwing from an async function
    // produces an unhandled rejection that systemd would kill the server over.
    // Match the fire-and-forget semantics of the WhisperX lane: log + mark errored + return.
    console.error(`[openai-transcribe:${recordingId}] OPENAI_API_KEY is not set`);
    db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
      .run('error', new Date().toISOString(), recordingId);
    return { recordingId, engine: 'openai', model: OPENAI_MODEL, error: 'OPENAI_API_KEY is not set' };
  }

  db.prepare('UPDATE recordings SET status = ?, engine = ?, updated_at = datetime(?) WHERE id = ?')
    .run('processing', 'openai', new Date().toISOString(), recordingId);

  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  jobTracker.register(recordingId, {
    engine: 'openai',
    cancel: () => controller.abort(),
  });

  // Run asynchronously: return immediately, then kick off the chunked
  // transcribe pipeline. Matches the fire-and-forget semantics of the
  // WhisperX lane.
  (async () => {
    const chunkPaths = []; // tracked for finally cleanup if anything throws
    try {
      const totalDuration = await getAudioDuration(audioPath);
      const chunks = planChunks(totalDuration);
      const parallelism = Math.min(CHUNK_CONCURRENCY, chunks.length);
      console.log(
        `[openai-transcribe:${recordingId}] Duration ${totalDuration.toFixed(1)}s → ` +
        `${chunks.length} chunk${chunks.length === 1 ? '' : 's'} of up to ${CHUNK_DURATION_SECONDS}s ` +
        `(processing ${parallelism} at a time)`
      );

      // Process each chunk: transcode → upload → return raw response. Speaker
      // remapping is deferred until all chunks are done so labels stay stable
      // even when chunks complete out of order.
      const processOneChunk = async (i, chunk, signal) => {
        const chunkPath = path.join(
          path.dirname(audioPath),
          `${recordingId}.openai-chunk-${i}.ogg`
        );
        chunkPaths.push(chunkPath);

        console.log(
          `[openai-transcribe:${recordingId}] Chunk ${i + 1}/${chunks.length}: ` +
          `transcoding ${chunk.start.toFixed(0)}s–${(chunk.start + chunk.duration).toFixed(0)}s...`
        );
        await transcodeChunk(audioPath, chunkPath, chunk.start, chunk.duration, signal);

        const chunkSize = fs.statSync(chunkPath).size;
        if (chunkSize > OPENAI_UPLOAD_LIMIT_BYTES) {
          throw new Error(
            `Chunk ${i} is ${(chunkSize / 1024 / 1024).toFixed(1)} MB, over the ` +
            `${OPENAI_UPLOAD_LIMIT_BYTES / 1024 / 1024} MB upload cap. ` +
            `Lower TRANSCODE_BITRATE or shorten CHUNK_DURATION_SECONDS.`
          );
        }
        if (chunk.duration > OPENAI_MAX_DURATION_SECONDS) {
          throw new Error(
            `Chunk ${i} duration ${chunk.duration}s exceeds OpenAI's ` +
            `${OPENAI_MAX_DURATION_SECONDS}s cap; CHUNK_DURATION_SECONDS misconfigured.`
          );
        }

        console.log(
          `[openai-transcribe:${recordingId}] Chunk ${i + 1}/${chunks.length}: ` +
          `uploading ${(chunkSize / 1024 / 1024).toFixed(1)} MB to ${OPENAI_MODEL}...`
        );
        const params = {
          file: fs.createReadStream(chunkPath),
          model: OPENAI_MODEL,
          response_format: 'diarized_json',
          chunking_strategy: 'auto',
        };
        if (language) params.language = language;
        const uploadStart = Date.now();
        const resp = await client.audio.transcriptions.create(params, {
          signal,
          timeout: OPENAI_REQUEST_TIMEOUT_MS,
        });
        const uploadElapsed = ((Date.now() - uploadStart) / 1000).toFixed(0);

        const rawSegments = Array.isArray(resp?.segments) ? resp.segments : [];
        console.log(
          `[openai-transcribe:${recordingId}] Chunk ${i + 1}/${chunks.length}: ` +
          `got ${rawSegments.length} segments in ${uploadElapsed}s`
        );

        // Free the chunk file as we go so disk usage stays bounded.
        try { fs.unlinkSync(chunkPath); } catch { /* ok */ }

        return { language: resp?.language || null, segments: rawSegments };
      };

      const chunkResults = await runChunksConcurrent(
        chunks,
        parallelism,
        controller.signal,
        processOneChunk
      );

      // Late check: if the recording was deleted while we were grinding
      // through chunks, drop everything on the floor.
      if (controller.signal.aborted || !recordingExists(recordingId)) {
        console.log(`[openai-transcribe:${recordingId}] Recording deleted before import; discarding result`);
        return;
      }

      // Now merge in chunk order. Speaker remapping happens here so two
      // chunks that finished out-of-order still get stable global labels
      // ordered by chunk index.
      const allSegments = [];
      const speakerRemap = new Map(); // `${chunkIdx}::${origLabel}` -> SPEAKER_X
      let nextSpeakerIdx = 0;
      let detectedLanguage = null;
      for (let i = 0; i < chunkResults.length; i++) {
        const r = chunkResults[i];
        if (!detectedLanguage && r?.language) detectedLanguage = r.language;
        for (const s of r?.segments || []) {
          const origLabel = String(s.speaker || '').trim().replace(/:$/, '').toUpperCase() || '_';
          const key = `${i}::${origLabel}`;
          let globalLabel = speakerRemap.get(key);
          if (!globalLabel) {
            globalLabel = `SPEAKER_${indexToLetters(nextSpeakerIdx++)}`;
            speakerRemap.set(key, globalLabel);
          }
          allSegments.push({
            start: chunks[i].start + (Number(s.start) || 0),
            end: chunks[i].start + (Number(s.end) || 0),
            text: (s.text || '').trim(),
            speaker: globalLabel,
            confidence: null,
          });
        }
      }

      allSegments.sort((a, b) => a.start - b.start);
      const normalized = {
        language: detectedLanguage,
        segments: allSegments,
        engine: 'openai',
        model: OPENAI_MODEL,
      };

      const jsonPath = path.join(path.dirname(audioPath), `${recordingId}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2));

      console.log(
        `[openai-transcribe:${recordingId}] Total ${allSegments.length} segments across ` +
        `${chunks.length} chunk${chunks.length === 1 ? '' : 's'}; importing...`
      );

      importTranscriptionResult(recordingId, jsonPath);
      db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
        .run('completed', new Date().toISOString(), recordingId);
      console.log(`[openai-transcribe:${recordingId}] Completed successfully`);
    } catch (err) {
      const wasAborted =
        controller.signal.aborted ||
        err?.name === 'AbortError' ||
        /aborted/i.test(err?.message || '');
      if (wasAborted) {
        console.log(`[openai-transcribe:${recordingId}] Cancelled`);
        return;
      }
      const detail = err?.response?.data || err?.error || err?.message || String(err);
      console.error(`[openai-transcribe:${recordingId}] Failed:`, detail);
      if (recordingExists(recordingId)) {
        db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
          .run('error', new Date().toISOString(), recordingId);
      }
    } finally {
      jobTracker.unregister(recordingId);
      // Defensive cleanup — unlinking each chunk inside the loop covers
      // the success path; this catches anything left behind on error.
      for (const p of chunkPaths) {
        try { fs.unlinkSync(p); } catch { /* best effort */ }
      }
    }
  })();

  return { recordingId, engine: 'openai', model: OPENAI_MODEL };
}

module.exports = { startOpenAITranscription, OPENAI_MODEL };
