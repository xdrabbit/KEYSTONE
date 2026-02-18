import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Upload, FileAudio, Trash2, Clock, CheckCircle2,
  AlertCircle, Loader2, Play, RotateCcw
} from 'lucide-react';
import { getRecordings, uploadAudio, deleteRecording, startTranscription } from '../utils/api';
import { formatDuration, formatDate } from '../utils/format';

export default function Dashboard() {
  const [recordings, setRecordings] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [model, setModel] = useState('large-v3');
  const navigate = useNavigate();

  const loadRecordings = useCallback(async () => {
    try {
      const data = await getRecordings();
      setRecordings(data);
    } catch (err) {
      console.error('Failed to load recordings:', err);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
    // Poll for status updates
    const interval = setInterval(loadRecordings, 5000);
    return () => clearInterval(interval);
  }, [loadRecordings]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);
    for (const file of acceptedFiles) {
      setUploadProgress(`Uploading ${file.name}...`);
      try {
        await uploadAudio(file, { model, autoTranscribe: true });
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }
    setUploading(false);
    setUploadProgress('');
    loadRecordings();
  }, [model, loadRecordings]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.wma', '.aac', '.webm'],
      'video/mp4': ['.mp4'],
    },
    disabled: uploading,
  });

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this recording and its transcript?')) return;
    try {
      await deleteRecording(id);
      loadRecordings();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleRetranscribe = async (e, id) => {
    e.stopPropagation();
    try {
      await startTranscription(id, { model });
      loadRecordings();
    } catch (err) {
      console.error('Retranscribe failed:', err);
    }
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 size={14} color="var(--success)" />;
      case 'processing': return <Loader2 size={14} color="var(--accent)" className="spin" />;
      case 'error': return <AlertCircle size={14} color="var(--error)" />;
      default: return <Clock size={14} color="var(--warning)" />;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Recordings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Upload audio files to transcribe with speaker diarization
        </p>
      </div>

      {/* Model selector */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Whisper Model:</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            padding: '6px 10px',
            fontSize: 13,
          }}
        >
          <option value="large-v3">large-v3 (best quality)</option>
          <option value="large-v2">large-v2</option>
          <option value="medium">medium</option>
          <option value="small">small</option>
          <option value="base">base (fastest)</option>
        </select>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 0.2s ease',
          background: isDragActive ? 'var(--accent-muted)' : 'var(--bg-secondary)',
          marginBottom: 32,
        }}
      >
        <input {...getInputProps()} />
        <Upload
          size={36}
          color={isDragActive ? 'var(--accent)' : 'var(--text-muted)'}
          style={{ marginBottom: 12 }}
        />
        {uploading ? (
          <div>
            <p style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 14 }}>
              {uploadProgress}
            </p>
          </div>
        ) : isDragActive ? (
          <p style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 14 }}>
            Drop audio files here...
          </p>
        ) : (
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
              Drag & drop audio files here
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              or click to browse &mdash; MP3, WAV, FLAC, M4A, OGG, MP4
            </p>
          </div>
        )}
      </div>

      {/* Recordings list */}
      {recordings.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-muted)',
        }}>
          <FileAudio size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>No recordings yet. Upload an audio file to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recordings.map((rec) => (
            <div
              key={rec.id}
              onClick={() => rec.status === 'completed' ? navigate(`/recording/${rec.id}`) : null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: rec.status === 'completed' ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (rec.status === 'completed') {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <FileAudio size={20} color="var(--accent)" style={{ flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {rec.original_name}
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  display: 'flex',
                  gap: 12,
                  marginTop: 2,
                }}>
                  <span>{formatDate(rec.created_at)}</span>
                  {rec.duration && <span>{formatDuration(rec.duration)}</span>}
                  {rec.language && <span>{rec.language.toUpperCase()}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {statusIcon(rec.status)}
                <span className={`badge badge-${rec.status}`}>
                  {rec.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                {rec.status === 'completed' && (
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); navigate(`/recording/${rec.id}`); }}>
                    <Play size={16} />
                  </button>
                )}
                {(rec.status === 'error' || rec.status === 'completed') && (
                  <button className="btn-icon" onClick={(e) => handleRetranscribe(e, rec.id)} title="Re-transcribe">
                    <RotateCcw size={16} />
                  </button>
                )}
                <button className="btn-icon" onClick={(e) => handleDelete(e, rec.id)} title="Delete">
                  <Trash2 size={16} color="var(--error)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
