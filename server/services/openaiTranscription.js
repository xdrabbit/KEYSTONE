const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const OpenAI = require('openai');
const db = require('../database');
const { importTranscriptionResult } = require('./transcription');

const OPENAI_MODEL = 'gpt-4o-transcribe-diarize';

// OpenAI's Audio Transcriptions endpoint caps uploads at 25 MB. We transcode
// everything to 16 kHz mono Opus at 24 kbps before uploading, which fits
// ~2.5 hours of audio under the limit while staying well above the
// intelligibility floor for speech. Covers the realistic range of the app's
// source material (courtroom / dictation); anything longer should use the
// WhisperX lane or wait for server-side chunking.
const OPENAI_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
const TRANSCODE_SAMPLE_RATE = 16000;
const TRANSCODE_BITRATE = '24k';

// Normalize speaker labels from OpenAI (e.g. "A", "B") to the SPEAKER_X
// form the rest of the app uses, so the UI palette + speaker_labels table
// look consistent regardless of engine.
function normalizeSpeaker(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/:$/, '');
  if (!s) return null;
  if (/^SPEAKER_/i.test(s)) return s.toUpperCase();
  return `SPEAKER_${s.toUpperCase()}`;
}

// Transcode any input audio to a small Opus-in-OGG file suitable for upload.
// Resolves with the path to the transcoded file (caller is responsible for
// deleting it). Rejects if ffmpeg isn't on PATH or exits non-zero.
function transcodeForUpload(recordingId, sourcePath) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(
      path.dirname(sourcePath),
      `${recordingId}.openai-upload.ogg`
    );
    const args = [
      '-y',
      '-i', sourcePath,
      '-vn',
      '-ac', '1',
      '-ar', String(TRANSCODE_SAMPLE_RATE),
      '-c:a', 'libopus',
      '-b:a', TRANSCODE_BITRATE,
      '-application', 'voip',
      outPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg not available: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0) return resolve(outPath);
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Convert OpenAI's diarized_json response into the same JSON schema
// the WhisperX worker writes (so importTranscriptionResult can consume it).
function toWhisperxShape(resp) {
  const rawSegments = Array.isArray(resp?.segments) ? resp.segments : [];
  const segments = rawSegments.map((s) => ({
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: (s.text || '').trim(),
    speaker: normalizeSpeaker(s.speaker),
    confidence: null,
    // gpt-4o-transcribe-diarize does not return word-level timestamps;
    // leave `words` undefined so the importer skips word insertion.
  }));
  return {
    language: resp?.language || null,
    segments,
    engine: 'openai',
    model: OPENAI_MODEL,
  };
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

  // Run asynchronously: return immediately, then kick off the API call.
  // Matches the fire-and-forget semantics of the WhisperX lane.
  (async () => {
    let uploadPath = null;
    try {
      console.log(
        `[openai-transcribe:${recordingId}] Transcoding to 16kHz mono Opus @ ${TRANSCODE_BITRATE} for upload...`
      );
      uploadPath = await transcodeForUpload(recordingId, audioPath);
      const uploadSize = fs.statSync(uploadPath).size;
      console.log(
        `[openai-transcribe:${recordingId}] Transcoded to ${(uploadSize / 1024 / 1024).toFixed(1)} MB`
      );
      if (uploadSize > OPENAI_UPLOAD_LIMIT_BYTES) {
        throw new Error(
          `Transcoded file is ${(uploadSize / 1024 / 1024).toFixed(1)} MB, ` +
          `over OpenAI's ${OPENAI_UPLOAD_LIMIT_BYTES / 1024 / 1024} MB limit. ` +
          `Recording is too long for the OpenAI lane without server-side chunking — use the WhisperX engine.`
        );
      }

      console.log(`[openai-transcribe:${recordingId}] Uploading to ${OPENAI_MODEL}...`);
      const params = {
        file: fs.createReadStream(uploadPath),
        model: OPENAI_MODEL,
        response_format: 'diarized_json',
        chunking_strategy: 'auto',
      };
      if (language) params.language = language;

      const resp = await client.audio.transcriptions.create(params);

      const normalized = toWhisperxShape(resp);
      const jsonPath = path.join(path.dirname(audioPath), `${recordingId}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2));

      console.log(
        `[openai-transcribe:${recordingId}] Got ${normalized.segments.length} segments, importing...`
      );

      importTranscriptionResult(recordingId, jsonPath);
      db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
        .run('completed', new Date().toISOString(), recordingId);
      console.log(`[openai-transcribe:${recordingId}] Completed successfully`);
    } catch (err) {
      const detail = err?.response?.data || err?.error || err?.message || String(err);
      console.error(`[openai-transcribe:${recordingId}] Failed:`, detail);
      db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
        .run('error', new Date().toISOString(), recordingId);
    } finally {
      if (uploadPath) {
        try { fs.unlinkSync(uploadPath); } catch { /* best effort */ }
      }
    }
  })();

  return { recordingId, engine: 'openai', model: OPENAI_MODEL };
}

module.exports = { startOpenAITranscription, OPENAI_MODEL };
