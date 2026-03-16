import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { GhostLens } from './ghost-lens-react.js';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import TranscriptView from './components/TranscriptView';

export default function App() {
  return (
    <GhostLens idleDelay={3000}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/recording/:id" element={<TranscriptView />} />
        </Routes>
      </Layout>
    </GhostLens>
  );
}
