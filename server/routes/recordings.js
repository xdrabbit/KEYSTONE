const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { startTranscription } = require('../services/transcription');
const { exportMarkdown, exportPDF, exportDocx } = require('../services/exporter');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    req.recordingId = id;
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.wma', '.aac', '.webm', '.mp4'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

// List all recordings
router.get('/', (req, res) => {
  const recordings = db.prepare(
    'SELECT * FROM recordings ORDER BY created_at DESC'
  ).all();
  res.json(recordings);
});

// Search across all transcripts (must be before /:id to avoid "search" matching as an id)
router.get('/search/query', (req, res) => {
  const { q, recordingId } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  let query;
  let params;

  if (recordingId) {
    query = `
      SELECT s.*, sf.rank,
             r.original_name as recording_name
      FROM segments_fts sf
      JOIN segments s ON s.id = sf.rowid
      JOIN recordings r ON r.id = s.recording_id
      WHERE segments_fts MATCH ? AND sf.recording_id = ?
      ORDER BY sf.rank
      LIMIT 100
    `;
    params = [q, recordingId];
  } else {
    query = `
      SELECT s.*, sf.rank,
             r.original_name as recording_name
      FROM segments_fts sf
      JOIN segments s ON s.id = sf.rowid
      JOIN recordings r ON r.id = s.recording_id
      WHERE segments_fts MATCH ?
      ORDER BY sf.rank
      LIMIT 100
    `;
    params = [q];
  }

  try {
    const results = db.prepare(query).all(...params);
    res.json(results);
  } catch (err) {
    res.status(400).json({ error: 'Invalid search query', details: err.message });
  }
});

// Get single recording
router.get('/:id', (req, res) => {
  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!recording) return res.status(404).json({ error: 'Not found' });
  res.json(recording);
});

// Upload and optionally start transcription
router.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const id = req.recordingId;
  const autoTranscribe = req.body.autoTranscribe !== 'false';
  const model = req.body.model || 'large-v3';
  const language = req.body.language || null;

  db.prepare(`
    INSERT INTO recordings (id, filename, original_name, status, model)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.file.filename, req.file.originalname, 'pending', model);

  if (autoTranscribe) {
    startTranscription(id, req.file.path, { model, language });
  }

  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id);
  res.status(201).json(recording);
});

// Start or restart transcription
router.post('/:id/transcribe', (req, res) => {
  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!recording) return res.status(404).json({ error: 'Not found' });

  const audioPath = path.join(UPLOADS_DIR, recording.filename);
  if (!fs.existsSync(audioPath)) return res.status(404).json({ error: 'Audio file missing' });

  // Clear existing transcript data
  db.prepare('DELETE FROM words WHERE recording_id = ?').run(req.params.id);
  db.prepare('DELETE FROM segments WHERE recording_id = ?').run(req.params.id);
  db.prepare('DELETE FROM speaker_labels WHERE recording_id = ?').run(req.params.id);

  const model = req.body.model || recording.model || 'large-v3';
  const language = req.body.language || null;

  startTranscription(req.params.id, audioPath, { model, language });

  res.json({ message: 'Transcription started', status: 'processing' });
});

// Get transcript segments
router.get('/:id/segments', (req, res) => {
  const segments = db.prepare(
    'SELECT * FROM segments WHERE recording_id = ? ORDER BY start_time'
  ).all(req.params.id);

  const speakerLabels = db.prepare(
    'SELECT * FROM speaker_labels WHERE recording_id = ?'
  ).all(req.params.id);

  const speakerMap = {};
  for (const sl of speakerLabels) {
    speakerMap[sl.original_label] = sl.display_name;
  }

  res.json({ segments, speakerMap });
});

// Get word-level data for a recording
router.get('/:id/words', (req, res) => {
  const words = db.prepare(
    'SELECT * FROM words WHERE recording_id = ? ORDER BY start_time'
  ).all(req.params.id);
  res.json(words);
});

// Get speakers for a recording
router.get('/:id/speakers', (req, res) => {
  const speakers = db.prepare(
    'SELECT * FROM speaker_labels WHERE recording_id = ?'
  ).all(req.params.id);
  res.json(speakers);
});

// Rename a speaker
router.put('/:id/speakers/:originalLabel', (req, res) => {
  const { displayName } = req.body;
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'displayName is required' });
  }

  const result = db.prepare(`
    UPDATE speaker_labels SET display_name = ?
    WHERE recording_id = ? AND original_label = ?
  `).run(displayName.trim(), req.params.id, req.params.originalLabel);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Speaker not found' });
  }

  res.json({ success: true, originalLabel: req.params.originalLabel, displayName: displayName.trim() });
});

// Export transcript
router.get('/:id/export/:format', async (req, res) => {
  const { id, format } = req.params;

  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id);
  if (!recording) return res.status(404).json({ error: 'Not found' });

  const baseName = path.parse(recording.original_name).name;

  try {
    if (format === 'md' || format === 'markdown') {
      const md = exportMarkdown(id);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.md"`);
      res.send(md);
    } else if (format === 'pdf') {
      const pdfDoc = exportPDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } else if (format === 'docx' || format === 'word') {
      const buffer = await exportDocx(id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.docx"`);
      res.send(buffer);
    } else {
      res.status(400).json({ error: 'Unsupported format. Use: md, pdf, docx' });
    }
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// Serve audio file
router.get('/:id/audio', (req, res) => {
  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!recording) return res.status(404).json({ error: 'Not found' });

  const audioPath = path.join(UPLOADS_DIR, recording.filename);
  if (!fs.existsSync(audioPath)) return res.status(404).json({ error: 'Audio file missing' });

  res.sendFile(audioPath);
});

// Delete recording
router.delete('/:id', (req, res) => {
  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!recording) return res.status(404).json({ error: 'Not found' });

  // Delete audio file
  const audioPath = path.join(UPLOADS_DIR, recording.filename);
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

  // Delete JSON output if exists
  const jsonPath = path.join(UPLOADS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);

  // Database cascading delete handles segments, words, speaker_labels
  db.prepare('DELETE FROM recordings WHERE id = ?').run(req.params.id);

  res.json({ success: true });
});

module.exports = router;
