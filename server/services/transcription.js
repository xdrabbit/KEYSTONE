const { spawn } = require('child_process');
const path = require('path');
const db = require('../database');
const jobTracker = require('./jobTracker');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'transcribe.py');
const VENV_PYTHON = path.join(__dirname, '..', '..', 'venv', 'bin', 'python3');

function recordingExists(recordingId) {
  return !!db.prepare('SELECT 1 FROM recordings WHERE id = ?').get(recordingId);
}

function startTranscription(recordingId, audioPath, options = {}) {
  const { model = 'large-v3', language = null } = options;

  // Update status to processing
  db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
    .run('processing', new Date().toISOString(), recordingId);

  const args = [
    SCRIPT_PATH,
    '--audio', audioPath,
    '--recording-id', recordingId,
    '--model', model,
    '--output-json', path.join(path.dirname(audioPath), `${recordingId}.json`),
  ];
  if (language) {
    args.push('--language', language);
  }

  // Use venv python if available, otherwise fallback to system python3
  const fs = require('fs');
  const pythonBin = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

  const proc = spawn(pythonBin, args, {
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  let cancelled = false;
  jobTracker.register(recordingId, {
    engine: 'whisperx',
    cancel: () => {
      cancelled = true;
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      // If SIGTERM doesn't take in 5s, escalate to SIGKILL.
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ok */ } }, 5000);
    },
  });

  let stderrBuf = '';

  proc.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (!text) return;
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'progress') {
        // Could emit via socket.io
        console.log(`[transcribe:${recordingId}] ${msg.message}`);
      }
    } catch {
      console.log(`[transcribe:${recordingId}] ${text}`);
    }
  });

  proc.stderr.on('data', (data) => {
    stderrBuf += data.toString();
  });

  proc.on('close', (code) => {
    jobTracker.unregister(recordingId);

    // If the recording row was deleted mid-job, skip import + status updates
    // and clean up the orphan JSON the worker may have written.
    if (cancelled || !recordingExists(recordingId)) {
      console.log(`[transcribe:${recordingId}] Cancelled or recording deleted; skipping import`);
      const fs = require('fs');
      const jsonPath = path.join(path.dirname(audioPath), `${recordingId}.json`);
      if (fs.existsSync(jsonPath)) { try { fs.unlinkSync(jsonPath); } catch { /* ok */ } }
      return;
    }

    if (code === 0) {
      try {
        importTranscriptionResult(recordingId, path.join(path.dirname(audioPath), `${recordingId}.json`));
        db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
          .run('completed', new Date().toISOString(), recordingId);
        console.log(`[transcribe:${recordingId}] Completed successfully`);
      } catch (err) {
        console.error(`[transcribe:${recordingId}] Import error:`, err.message);
        db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
          .run('error', new Date().toISOString(), recordingId);
      }
    } else {
      console.error(`[transcribe:${recordingId}] Failed (code ${code}):`, stderrBuf.slice(-500));
      db.prepare('UPDATE recordings SET status = ?, updated_at = datetime(?) WHERE id = ?')
        .run('error', new Date().toISOString(), recordingId);
    }
  });

  return proc;
}

function importTranscriptionResult(recordingId, jsonPath) {
  const fs = require('fs');
  const result = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const insertSegment = db.prepare(`
    INSERT INTO segments (recording_id, speaker, text, start_time, end_time, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertWord = db.prepare(`
    INSERT INTO words (segment_id, recording_id, word, start_time, end_time, confidence, speaker)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSpeaker = db.prepare(`
    INSERT OR IGNORE INTO speaker_labels (recording_id, original_label, display_name)
    VALUES (?, ?, ?)
  `);

  const updateDuration = db.prepare(`
    UPDATE recordings SET duration = ?, language = ?, updated_at = datetime(?) WHERE id = ?
  `);

  const transaction = db.transaction((data) => {
    const speakers = new Set();

    for (const seg of data.segments) {
      const info = insertSegment.run(
        recordingId,
        seg.speaker || null,
        seg.text.trim(),
        seg.start,
        seg.end,
        seg.confidence || null
      );

      if (seg.speaker) speakers.add(seg.speaker);

      if (seg.words) {
        for (const w of seg.words) {
          insertWord.run(
            info.lastInsertRowid,
            recordingId,
            w.word,
            w.start,
            w.end,
            w.score || null,
            w.speaker || seg.speaker || null
          );
        }
      }
    }

    // Create default speaker labels
    for (const spk of speakers) {
      insertSpeaker.run(recordingId, spk, spk);
    }

    // Update recording duration
    if (data.segments.length > 0) {
      const lastSeg = data.segments[data.segments.length - 1];
      updateDuration.run(
        lastSeg.end,
        data.language || null,
        new Date().toISOString(),
        recordingId
      );
    }
  });

  transaction(result);
}

// Import from a JSON file directly (for manual imports)
function importFromJSON(recordingId, jsonData) {
  const insertSegment = db.prepare(`
    INSERT INTO segments (recording_id, speaker, text, start_time, end_time, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertWord = db.prepare(`
    INSERT INTO words (segment_id, recording_id, word, start_time, end_time, confidence, speaker)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSpeaker = db.prepare(`
    INSERT OR IGNORE INTO speaker_labels (recording_id, original_label, display_name)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction((data) => {
    const speakers = new Set();

    for (const seg of data.segments) {
      const info = insertSegment.run(
        recordingId,
        seg.speaker || null,
        seg.text.trim(),
        seg.start,
        seg.end,
        seg.confidence || null
      );

      if (seg.speaker) speakers.add(seg.speaker);

      if (seg.words) {
        for (const w of seg.words) {
          insertWord.run(
            info.lastInsertRowid,
            recordingId,
            w.word,
            w.start,
            w.end,
            w.score || null,
            w.speaker || seg.speaker || null
          );
        }
      }
    }

    for (const spk of speakers) {
      insertSpeaker.run(recordingId, spk, spk);
    }
  });

  transaction(jsonData);
}

module.exports = { startTranscription, importTranscriptionResult, importFromJSON };
