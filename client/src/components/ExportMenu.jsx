import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, File, FileCode } from 'lucide-react';
import { getExportUrl } from '../utils/api';

export default function ExportMenu({ recordingId }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formats = [
    { key: 'pdf', label: 'PDF Document', icon: FileText, ext: '.pdf' },
    { key: 'docx', label: 'Word Document', icon: File, ext: '.docx' },
    { key: 'md', label: 'Markdown', icon: FileCode, ext: '.md' },
  ];

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button data-ghost="Export the transcript in the chosen format" className="btn" onClick={() => setOpen(!open)}>
        <Download size={15} />
        Export
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 6,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          minWidth: 180,
          zIndex: 50,
          overflow: 'hidden',
        }}>
          {formats.map(({ key, label, icon: Icon }) => (
            <a
              key={key}
              href={getExportUrl(recordingId, key)}
              download
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: 13,
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Icon size={16} color="var(--text-muted)" />
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
