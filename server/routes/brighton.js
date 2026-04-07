const express = require('express');
const { getAvailableVoices, generateHearingFacts, draftCourtOrder } = require('../services/brightonService');
const fs = require('fs');
const path = require('path');
const db = require('../database');

const router = express.Router();

/**
 * Get available lawyer voices.
 */
router.get('/voices', (req, res) => {
  try {
    const voices = getAvailableVoices();
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get voices', details: err.message });
  }
});

/**
 * Summarize and draft the court order.
 */
router.post('/:id/draft', async (req, res) => {
  const { id } = req.params;
  const { voice } = req.body;

  try {
    const docxPath = await draftCourtOrder(id, voice || 'blaine_edwards');
    
    // Check if file exists
    if (!fs.existsSync(docxPath)) {
      throw new Error(`Generated document ${docxPath} not found.`);
    }

    // Set headers for download
    const recording = db.prepare('SELECT original_name FROM recordings WHERE id = ?').get(id);
    const baseName = recording ? path.parse(recording.original_name).name : 'court_order';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_order.docx"`);
    
    // Stream file and then delete temporary files (maybe? or keep them)
    res.sendFile(docxPath);
  } catch (err) {
    console.error('[BrightonRoute] Error:', err);
    res.status(500).json({ error: 'Failed to generate document', details: err.message });
  }
});

module.exports = router;
