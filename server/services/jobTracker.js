// Tracks in-flight transcription jobs so DELETE can cancel them cleanly.
// Each job registers a `cancel` callback the route can invoke; the worker
// is responsible for unregistering itself on completion or error.
//
// In-process only — fine because the server is a single Node process and
// transcription jobs are kicked off from the same process.

const jobs = new Map();

function register(recordingId, info) {
  jobs.set(recordingId, info);
}

function unregister(recordingId) {
  jobs.delete(recordingId);
}

function cancel(recordingId) {
  const job = jobs.get(recordingId);
  if (!job) return false;
  try {
    job.cancel();
    console.log(`[jobTracker] Cancelled ${job.engine || 'unknown'} job for ${recordingId}`);
  } catch (err) {
    console.error(`[jobTracker] Error cancelling job ${recordingId}:`, err.message);
  }
  jobs.delete(recordingId);
  return true;
}

function has(recordingId) {
  return jobs.has(recordingId);
}

module.exports = { register, unregister, cancel, has };
