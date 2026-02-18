import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { formatTimestamp } from '../utils/format';

export default function AudioPlayer({ audioUrl, onTimeUpdate, seekToRef }) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4a4d5e',
      progressColor: '#6366f1',
      cursorColor: '#818cf8',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 72,
      normalize: true,
      backend: 'WebAudio',
    });

    ws.load(audioUrl);

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      ws.setVolume(volume);
    });

    ws.on('audioprocess', () => {
      const t = ws.getCurrentTime();
      setCurrentTime(t);
      if (onTimeUpdate) onTimeUpdate(t);
    });

    ws.on('seeking', () => {
      const t = ws.getCurrentTime();
      setCurrentTime(t);
      if (onTimeUpdate) onTimeUpdate(t);
    });

    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [audioUrl]);

  // Expose seekTo via ref callback
  const seekTo = useCallback((time) => {
    const ws = wavesurferRef.current;
    if (!ws || !duration) return;
    const ratio = Math.max(0, Math.min(1, time / duration));
    ws.seekTo(ratio);
    setCurrentTime(time);
    if (!playing) {
      ws.play();
    }
  }, [duration, playing]);

  useEffect(() => {
    if (seekToRef) seekToRef.current = seekTo;
  }, [seekTo, seekToRef]);

  const togglePlay = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.playPause();
  };

  const skip = (seconds) => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.skip(seconds);
  };

  const toggleMute = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    const newMuted = !muted;
    setMuted(newMuted);
    ws.setVolume(newMuted ? 0 : volume);
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(v);
    }
  };

  const handleRateChange = (rate) => {
    setPlaybackRate(rate);
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(rate);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 16,
    }}>
      {/* Waveform */}
      <div ref={containerRef} style={{ marginBottom: 12, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }} />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Time */}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'center' }}>
          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
        </span>

        {/* Transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="btn-icon" onClick={() => skip(-10)} title="Back 10s">
            <SkipBack size={18} />
          </button>
          <button
            onClick={togglePlay}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--accent)',
              border: 'none',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
          >
            {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>
          <button className="btn-icon" onClick={() => skip(10)} title="Forward 10s">
            <SkipForward size={18} />
          </button>
        </div>

        {/* Speed */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <button
              key={rate}
              onClick={() => handleRateChange(rate)}
              style={{
                padding: '3px 7px',
                fontSize: 11,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: playbackRate === rate ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: playbackRate === rate ? 'white' : 'var(--text-muted)',
                fontWeight: playbackRate === rate ? 600 : 400,
                transition: 'all 0.1s',
              }}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button className="btn-icon" onClick={toggleMute}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            style={{ width: 80, accentColor: 'var(--accent)' }}
          />
        </div>
      </div>
    </div>
  );
}
