export function formatTimestamp(seconds) {
  if (seconds == null || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(seconds) {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SPEAKER_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
];

export function getSpeakerColor(speakerIndex) {
  return SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length];
}

export function getSpeakerColorByLabel(label, allLabels) {
  const idx = allLabels.indexOf(label);
  return SPEAKER_COLORS[Math.max(0, idx) % SPEAKER_COLORS.length];
}
