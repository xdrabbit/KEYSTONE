import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Search, Users } from 'lucide-react';
import {
  getRecording, getSegments, renameSpeaker,
  searchTranscripts, getAudioUrl
} from '../utils/api';
import { formatDuration } from '../utils/format';
import AudioPlayer from './AudioPlayer';
import TranscriptPanel from './TranscriptPanel';
import SpeakerRenameModal from './SpeakerRenameModal';
import ExportMenu from './ExportMenu';

export default function TranscriptView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [recording, setRecording] = useState(null);
  const [segments, setSegments] = useState([]);
  const [speakerMap, setSpeakerMap] = useState({});
  const [currentTime, setCurrentTime] = useState(0);
  const [localSearch, setLocalSearch] = useState('');
  const [localResults, setLocalResults] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [highlightQuery, setHighlightQuery] = useState('');
  const [highlightSegmentId, setHighlightSegmentId] = useState(null);

  const seekToRef = useRef(null);

  // Load recording and segments
  useEffect(() => {
    async function load() {
      const [rec, segData] = await Promise.all([
        getRecording(id),
        getSegments(id),
      ]);
      setRecording(rec);
      setSegments(segData.segments);
      setSpeakerMap(segData.speakerMap);
    }
    load();
  }, [id]);

  // Handle URL params for jump-to
  useEffect(() => {
    const t = parseFloat(searchParams.get('t'));
    const q = searchParams.get('highlight');
    if (!isNaN(t) && seekToRef.current) {
      setTimeout(() => seekToRef.current(t), 500);
    }
    if (q) setHighlightQuery(q);
  }, [searchParams]);

  const handleSegmentClick = useCallback((seg) => {
    if (seekToRef.current) {
      seekToRef.current(seg.start_time);
    }
  }, []);

  const handleSpeakerClick = useCallback((originalLabel, displayName) => {
    setRenameModal({ speaker: originalLabel, currentName: displayName });
  }, []);

  const handleRename = useCallback(async (originalLabel, newName) => {
    try {
      await renameSpeaker(id, originalLabel, newName);
      setSpeakerMap((prev) => ({ ...prev, [originalLabel]: newName }));
      setRenameModal(null);
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }, [id]);

  const handleLocalSearch = async (e) => {
    e.preventDefault();
    if (!localSearch.trim()) {
      setLocalResults(null);
      setHighlightQuery('');
      setHighlightSegmentId(null);
      return;
    }
    try {
      const results = await searchTranscripts(localSearch.trim(), id);
      setLocalResults(results);
      setHighlightQuery(localSearch.trim());
      if (results.length > 0) {
        setHighlightSegmentId(results[0].id);
        if (seekToRef.current) {
          seekToRef.current(results[0].start_time);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const jumpToResult = (result) => {
    setHighlightSegmentId(result.id);
    if (seekToRef.current) {
      seekToRef.current(result.start_time);
    }
  };

  // Get unique speakers list
  const speakers = Object.entries(speakerMap);

  if (!recording) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <Link to="/" className="btn-icon" style={{ flexShrink: 0 }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: 18,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {recording.original_name}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
            {recording.duration && <span>{formatDuration(recording.duration)}</span>}
            {recording.language && <span>{recording.language.toUpperCase()}</span>}
            <span>{segments.length} segments</span>
          </div>
        </div>
        <ExportMenu recordingId={id} />
      </div>

      {/* Audio Player */}
      <AudioPlayer
        audioUrl={getAudioUrl(id)}
        onTimeUpdate={setCurrentTime}
        seekToRef={seekToRef}
      />

      {/* Transcript area */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: 16,
        marginTop: 16,
        minHeight: 0,
      }}>
        {/* Main transcript */}
        <div data-ghost="Click anywhere to start the audio or jump to a location" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          {/* Transcript search bar */}
          <div data-ghost="Search for a word or phrase with quotes. Use operators AND/OR for advanced search" style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}>
            <form onSubmit={handleLocalSearch} style={{ display: 'flex', flex: 1, gap: 8 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                padding: '0 10px',
                flex: 1,
              }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search in transcript..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
                {localSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalSearch('');
                      setLocalResults(null);
                      setHighlightQuery('');
                      setHighlightSegmentId(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: 14,
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>
              <button type="submit" className="btn btn-sm btn-primary">Search</button>
            </form>

            {localResults !== null && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {localResults.length} result{localResults.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Search results navigation */}
          {localResults && localResults.length > 0 && (
            <div data-ghost="Click on a RESULT TO JUMP LOCATIONS" style={{
              padding: '6px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              background: 'var(--bg-tertiary)',
            }}>
              {localResults.map((r, i) => (
                <button
                  key={`${r.id}-${i}`}
                  onClick={() => jumpToResult(r)}
                  className="btn btn-sm"
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    background: highlightSegmentId === r.id ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: highlightSegmentId === r.id ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  #{i + 1}
                </button>
              ))}
            </div>
          )}

          <TranscriptPanel
            segments={segments}
            speakerMap={speakerMap}
            currentTime={currentTime}
            onSegmentClick={handleSegmentClick}
            onSpeakerClick={handleSpeakerClick}
            highlightQuery={highlightQuery}
            highlightSegmentId={highlightSegmentId}
          />
        </div>

        {/* Speakers sidebar */}
        {speakers.length > 0 && (
          <div style={{
            width: 220,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
            flexShrink: 0,
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
            }}>
              <Users size={16} />
              Speakers
            </div>

            {speakers.map(([original, display]) => {
              const allOriginals = speakers.map(([o]) => o);
              const colorIdx = allOriginals.indexOf(original);
              const colors = [
                '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
                '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
              ];
              const color = colors[Math.max(0, colorIdx) % colors.length];

              return (
                <button
                  key={original}
                  onClick={() => handleSpeakerClick(original, display)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--text-primary)',
                    transition: 'background 0.1s',
                    marginBottom: 2,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {display}
                    </div>
                    {original !== display && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {original}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Speaker rename modal */}
      {renameModal && (
        <SpeakerRenameModal
          speaker={renameModal.speaker}
          currentName={renameModal.currentName}
          onRename={handleRename}
          onClose={() => setRenameModal(null)}
        />
      )}
    </div>
  );
}
