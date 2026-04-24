import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, AudioLines } from 'lucide-react';
import { searchTranscripts } from '../utils/api';
import SearchResults from './SearchResults';

export default function Layout({ children }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchTranscripts(searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleResultClick = (result) => {
    setSearchResults(null);
    setSearchQuery('');
    navigate(`/recording/${result.recording_id}?t=${result.start_time}&highlight=${encodeURIComponent(searchQuery)}`);
  };

  const closeSearch = () => {
    setSearchResults(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontSize: 16,
          flexShrink: 0,
        }}>
          <AudioLines size={22} color="var(--accent)" />
          Ghost Scribe
        </Link>

        <form onSubmit={handleSearch} style={{
          flex: 1,
          maxWidth: 520,
          position: 'relative',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            padding: '0 12px',
          }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search all transcripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 16,
                  cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                &times;
              </button>
            )}
          </div>

          {searchResults !== null && (
            <SearchResults
              results={searchResults}
              query={searchQuery}
              loading={searching}
              onResultClick={handleResultClick}
              onClose={closeSearch}
            />
          )}
        </form>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, padding: '24px 0' }}>
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
}
