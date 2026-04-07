import React, { useState, useEffect } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { getVoices } from '../utils/api';

export default function VoiceSelectModal({ onDraft, onClose, isProcessing }) {
  const [voices, setVoices] = useState({});
  const [selectedVoice, setSelectedVoice] = useState('blaine_edwards');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVoices() {
      try {
        const v = await getVoices();
        setVoices(v);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch voices:', err);
        setLoading(false);
      }
    }
    fetchVoices();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isProcessing) return;
    onDraft(selectedVoice);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
        }}
      />
      <div 
        style={{ 
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 30,
          width: 440,
          maxWidth: '90%',
          zIndex: 1001,
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
            <FileText size={20} className="text-primary" />
            Draft Court Order (Brighton)
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
          This will summarize the hearing transcript and draft a formal court order using Brighton AI. 
          Pick a voice profile to set the tone and structure.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Select Attorney Voice
            </label>
            {loading ? (
              <div style={{ 
                padding: '12px 14px', 
                fontSize: 13, 
                color: 'var(--text-muted)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}>
                <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} />
                Loading attorney profiles...
              </div>
            ) : (
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '12px 14px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  backgroundSize: '16px'
                }}
                disabled={isProcessing}
              >
                {Object.entries(voices).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn" disabled={isProcessing}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isProcessing || loading}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {isProcessing && <Loader2 size={16} className="animate-spin" />}
              {isProcessing ? 'Summarizing & Drafting...' : 'Generate Docx'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
