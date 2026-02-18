const API_BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.details || 'Request failed');
  }
  return res;
}

export async function getRecordings() {
  const res = await request('/recordings');
  return res.json();
}

export async function getRecording(id) {
  const res = await request(`/recordings/${id}`);
  return res.json();
}

export async function uploadAudio(file, options = {}) {
  const formData = new FormData();
  formData.append('audio', file);
  if (options.model) formData.append('model', options.model);
  if (options.language) formData.append('language', options.language);
  if (options.autoTranscribe !== undefined) {
    formData.append('autoTranscribe', String(options.autoTranscribe));
  }

  const res = await fetch(`${API_BASE}/recordings/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function startTranscription(id, options = {}) {
  const res = await request(`/recordings/${id}/transcribe`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
  return res.json();
}

export async function getSegments(id) {
  const res = await request(`/recordings/${id}/segments`);
  return res.json();
}

export async function getWords(id) {
  const res = await request(`/recordings/${id}/words`);
  return res.json();
}

export async function getSpeakers(id) {
  const res = await request(`/recordings/${id}/speakers`);
  return res.json();
}

export async function renameSpeaker(recordingId, originalLabel, displayName) {
  const res = await request(`/recordings/${recordingId}/speakers/${encodeURIComponent(originalLabel)}`, {
    method: 'PUT',
    body: JSON.stringify({ displayName }),
  });
  return res.json();
}

export async function searchTranscripts(query, recordingId = null) {
  const params = new URLSearchParams({ q: query });
  if (recordingId) params.set('recordingId', recordingId);
  const res = await request(`/recordings/search/query?${params}`);
  return res.json();
}

export async function deleteRecording(id) {
  const res = await request(`/recordings/${id}`, { method: 'DELETE' });
  return res.json();
}

export function getAudioUrl(id) {
  return `${API_BASE}/recordings/${id}/audio`;
}

export function getExportUrl(id, format) {
  return `${API_BASE}/recordings/${id}/export/${format}`;
}
