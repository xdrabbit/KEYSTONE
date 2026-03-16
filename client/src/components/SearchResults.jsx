import React from 'react';
import { FileAudio, Clock } from 'lucide-react';
import { formatTimestamp } from '../utils/format';

export default function SearchResults({ results, query, loading, onResultClick, onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 49,
        }}
      />

      <div style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: 420,
        overflowY: 'auto',
        zIndex: 50,
      }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Searching...
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No results found for "{query}"
          </div>
        ) : (
          <>
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}>
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </div>
            {results.map((result, i) => (
              <button 
                key={`${result.id}-${i}`}
                onClick={() => onResultClick(result)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                }}>
                  <FileAudio size={13} color="var(--accent)" />
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                    {result.recording_name}
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    marginLeft: 'auto',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}>
                    <Clock size={11} />
                    {formatTimestamp(result.start_time)}
                  </span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {result.speaker && (
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: 6 }}>
                      {result.speaker}:
                    </span>
                  )}
                  {highlightText(result.text, query)}
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function highlightText(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} style={{
        background: 'var(--accent-muted)',
        color: 'var(--accent)',
        borderRadius: 2,
        padding: '0 1px',
      }}>{part}</mark>
    ) : part
  );
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
