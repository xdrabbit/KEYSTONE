const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const BRIGHTON_DIR = path.join(__dirname, 'brighton');
const SUMMARIZER_PY = path.join(BRIGHTON_DIR, 'summarizer.py');
const ARCHITECT_PY = path.join(BRIGHTON_DIR, 'architect.py');
const DRAFTER_PY = path.join(BRIGHTON_DIR, 'drafter.py');
const RENDERER_PY = path.join(BRIGHTON_DIR, 'renderer.py');
const VENV_PYTHON = path.join(__dirname, '..', '..', 'venv', 'bin', 'python3');
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'ghost-scribe.db');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

async function runPythonScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const pythonBin = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
    console.log(`[Brighton] Running: ${pythonBin} ${scriptPath} ${args.join(' ')}`);
    
    const proc = spawn(pythonBin, [scriptPath, ...args], {
      cwd: BRIGHTON_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.stderr.on('data', (data) => stderr += data.toString());

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        console.error(`[Brighton] Error in ${scriptPath}:`, stderr);
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

/**
 * Summarize a transcript from ghost-scribe database.
 */
async function generateHearingFacts(recordingId) {
  try {
    const facts = await runPythonScript(SUMMARIZER_PY, [recordingId, DB_PATH]);
    return facts;
  } catch (err) {
    console.error('[Brighton] Failed to generate facts:', err.message);
    throw err;
  }
}

/**
 * Full document generation pipeline.
 */
async function draftCourtOrder(recordingId, voiceKey = 'blaine_edwards') {
  const facts = await generateHearingFacts(recordingId);
  
  // Temporary filenames
  const factsPath = path.join(UPLOADS_DIR, `${recordingId}_facts.txt`);
  const lmdPath = path.join(UPLOADS_DIR, `${recordingId}.lmd`);
  const draftedLmdPath = path.join(UPLOADS_DIR, `${recordingId}_drafted.lmd`);
  const finalDocxPath = path.join(UPLOADS_DIR, `${recordingId}_order.docx`);

  fs.writeFileSync(factsPath, facts);

  try {
    // Step 1: Architect
    console.log('[Brighton] Scaffolding...');
    const metaStr = JSON.stringify({ voice: voiceKey });
    await runPythonScript(ARCHITECT_PY, ['--input', factsPath, '--output', lmdPath, '--meta', metaStr]);

    // Step 2: Drafter
    console.log('[Brighton] Drafting...');
    await runPythonScript(DRAFTER_PY, ['--input', lmdPath, '--output', draftedLmdPath]);

    // Step 3: Renderer
    console.log('[Brighton] Rendering...');
    await runPythonScript(RENDERER_PY, ['--input', draftedLmdPath, '--output', finalDocxPath]);

    console.log('[Brighton] Complete!');
    return finalDocxPath;
  } catch (err) {
    console.error('[Brighton] Doc generation failed:', err.message);
    throw err;
  }
}

/**
 * Get available voices by reading voice.py (simplistic extraction)
 */
function getAvailableVoices() {
  const voiceFile = path.join(BRIGHTON_DIR, 'voice.py');
  if (!fs.existsSync(voiceFile)) return {};
  
  const voicePy = fs.readFileSync(voiceFile, 'utf8');
  const voices = {};
  
  // More robust regex to catch "key": { "name": "Value" } across multiple lines
  const regex = /"(\w+)":\s+\{[^{}]*"name":\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(voicePy)) !== null) {
    voices[match[1]] = match[2];
  }
  
  return voices;
}

module.exports = {
  generateHearingFacts,
  draftCourtOrder,
  getAvailableVoices
};
