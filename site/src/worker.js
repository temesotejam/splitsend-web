import { restoreToFile, splitToDirectory } from './browser-operations.js';

const cancelledJobs = new Set();
const activeJobs = new Set();

function serializeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    code: error?.code ?? 'UNKNOWN',
    details: error?.details,
    cleanupWarning: error?.cleanupWarning,
    stack: error?.stack,
  };
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'cancel') {
    cancelledJobs.add(message.jobId);
    return;
  }

  if (!['split', 'restore'].includes(message.type) || !message.jobId) return;
  if (activeJobs.has(message.jobId)) return;

  activeJobs.add(message.jobId);
  const shouldCancel = () => cancelledJobs.has(message.jobId);
  const onProgress = (progress) => {
    self.postMessage({ type: 'progress', jobId: message.jobId, progress });
  };

  const operation = message.type === 'split'
    ? splitToDirectory({ ...message.payload, onProgress, shouldCancel })
    : restoreToFile({ ...message.payload, onProgress, shouldCancel });

  Promise.resolve(operation)
    .then((result) => {
      self.postMessage({ type: 'completed', jobId: message.jobId, result });
    })
    .catch((error) => {
      self.postMessage({ type: 'error', jobId: message.jobId, error: serializeError(error) });
    })
    .finally(() => {
      activeJobs.delete(message.jobId);
      cancelledJobs.delete(message.jobId);
    });
});
