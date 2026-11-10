const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const BRIGHTON_DIR = path.join(__dirname, 'services', 'brighton');

// Same extraction brightonService.getAvailableVoices() uses, applied directly to
// voice.py so this test needs no database.
function voiceIds() {
  const voicePy = fs.readFileSync(path.join(BRIGHTON_DIR, 'voice.py'), 'utf8');
  const regex = /"(\w+)":\s+\{[^{}]*"name":\s*"([^"]+)"/g;
  const ids = [];
  let match;
  while ((match = regex.exec(voicePy)) !== null) ids.push(match[1]);
  return ids;
}

test('Brighton: voice registry', () => {
  const ids = voiceIds();
  for (const id of ['blaine_edwards', 'generic_utah_family', 'brody', 'jack_smith', 'judicial_officer']) {
    assert.ok(ids.includes(id), `Missing voice: ${id}`);
  }
});

test('Brighton: judicial profile mirrors the oral ruling', () => {
  const content = fs.readFileSync(path.join(BRIGHTON_DIR, 'voice.py'), 'utf8');
  assert.ok(content.includes('exactly as ruled from the bench'), 'missing deadline rule');
  assert.ok(content.includes('must correspond to an oral ruling'), 'missing oral-ruling rule');
});

test('Brighton: models are env-overridable, no retired IDs', () => {
  for (const [file, envVar] of [['drafter.py', 'BRIGHTON_DRAFTER_MODEL'], ['summarizer.py', 'BRIGHTON_SUMMARIZER_MODEL']]) {
    const content = fs.readFileSync(path.join(BRIGHTON_DIR, file), 'utf8');
    assert.ok(content.includes(envVar), `${file} missing ${envVar}`);
    assert.ok(!content.includes('claude-sonnet-4-20250514'), `${file} still uses a retired model`);
  }
});

test('Brighton: synthetic fixtures exist', () => {
  for (const f of ['synthetic_hearing_transcript.txt', 'synthetic_hearing_facts.txt']) {
    assert.ok(fs.existsSync(path.join(BRIGHTON_DIR, 'examples', f)), `missing ${f}`);
  }
});
