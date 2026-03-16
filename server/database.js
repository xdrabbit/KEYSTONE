const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ghost-scribe.db'));

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---

db.exec(`
  CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    duration REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    language TEXT,
    model TEXT DEFAULT 'large-v3',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id TEXT NOT NULL,
    speaker TEXT,
    text TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    confidence REAL,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segment_id INTEGER NOT NULL,
    recording_id TEXT NOT NULL,
    word TEXT NOT NULL,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    confidence REAL,
    speaker TEXT,
    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS speaker_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id TEXT NOT NULL,
    original_label TEXT NOT NULL,
    display_name TEXT NOT NULL,
    UNIQUE(recording_id, original_label),
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
  );
`);

// FTS5 virtual table for full-text search on segments
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
    recording_id UNINDEXED,
    text,
    speaker,
    content=segments,
    content_rowid=id,
    tokenize='porter unicode61'
  );

  -- Triggers to keep FTS in sync
  CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
    INSERT INTO segments_fts(rowid, recording_id, text, speaker)
    VALUES (new.id, new.recording_id, new.text, new.speaker);
  END;

  CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, recording_id, text, speaker)
    VALUES ('delete', old.id, old.recording_id, old.text, old.speaker);
  END;

  CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, recording_id, text, speaker)
    VALUES ('delete', old.id, old.recording_id, old.text, old.speaker);
    INSERT INTO segments_fts(rowid, recording_id, text, speaker)
    VALUES (new.id, new.recording_id, new.text, new.speaker);
  END;
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_segments_recording ON segments(recording_id);
  CREATE INDEX IF NOT EXISTS idx_segments_time ON segments(recording_id, start_time);
  CREATE INDEX IF NOT EXISTS idx_words_segment ON words(segment_id);
  CREATE INDEX IF NOT EXISTS idx_words_recording ON words(recording_id);
  CREATE INDEX IF NOT EXISTS idx_words_time ON words(recording_id, start_time);
  CREATE INDEX IF NOT EXISTS idx_speaker_labels ON speaker_labels(recording_id);
`);

module.exports = db;
