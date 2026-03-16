import React, { useRef, useEffect, useState, useMemo } from 'react';
import { formatTimestamp, getSpeakerColorByLabel } from '../utils/format';

export default function TranscriptPanel({
  segments,
  speakerMap,
  currentTime,
  onSegmentClick,
  onSpeakerClick,
  highlightQuery,
  highlightSegmentId,
}) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const allSpeakers = useMemo(() => {
    const set = new Set();
    segments.forEach((s) => { if (s.speaker) set.add(s.speaker); });
    return [...set];
  }, [segments]);

  // Find active segment based on current time
  const activeSegmentIdx = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start_time) return i;
    }
    return -1;
  }, [segments, currentTime]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (autoScroll && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSegmentIdx, autoScroll]);

  // Scroll to highlighted segment
  useEffect(() => {
    if (highlightSegmentId) {
      const el = document.getElementById(`seg-${highlightSegmentId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightSegmentId]);

  // Detect manual scrolling to pause auto-scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timeout;
    const handleScroll = () => {
      setAutoScroll(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setAutoScroll(true), 5000);
    };
    el.addEventListener('wheel', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleScroll);
      clearTimeout(timeout);
    };
  }, []);

  let lastSpeaker = null;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
      }}
    >
      {segments.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          No transcript available yet.
        </div>
      ) : (
        segments.map((seg, idx) => {
          const isActive = idx === activeSegmentIdx;
          const displayName = speakerMap[seg.speaker] || seg.speaker;
          const showSpeaker = seg.speaker !== lastSpeaker;
          lastSpeaker = seg.speaker;
          const speakerColor = seg.speaker
            ? getSpeakerColorByLabel(seg.speaker, allSpeakers)
            : 'var(--text-muted)';

          return (
            <div
              key={seg.id}
              id={`seg-${seg.id}`}
              ref={isActive ? activeRef : null}
              onClick={() => onSegmentClick(seg)}
              style={{
                padding: '6px 14px',
                borderLeft: `3px solid ${isActive ? speakerColor : 'transparent'}`,
                background: isActive ? 'var(--accent-muted)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {showSpeaker && seg.speaker && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                  marginTop: idx > 0 ? 10 : 0,
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSpeakerClick(seg.speaker, displayName);
                    }}
                    style={{
                      background: speakerColor + '22',
                      border: `1px solid ${speakerColor}55`,
                      borderRadius: 12,
                      padding: '2px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: speakerColor,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = speakerColor + '44';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = speakerColor + '22';
                    }}
                    title="Click to rename speaker"
                  >
                    {displayName}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatTimestamp(seg.start_time)}
                  </span>
                </div>
              )}

              <p style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                {highlightQuery ? highlightText(seg.text, highlightQuery) : seg.text}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}

function highlightText(text, query) {
  if (!query) return text;
  try {
    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{
          background: 'rgba(245, 158, 11, 0.3)',
          color: 'var(--warning)',
          borderRadius: 2,
          padding: '0 2px',
        }}>{part}</mark>
      ) : part
    );
  } catch {
    return text;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
