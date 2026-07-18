import { CancelledError } from './errors.js';

export function formatBytes(bytes, decimals = 2) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1000)), units.length - 1);
  const value = bytes / (1000 ** index);
  return `${value.toFixed(index === 0 ? 0 : decimals)} ${units[index]}`;
}

export function formatPercent(processed, total) {
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, (processed / total) * 100));
}

export function calculatePartCount(fileSize, partSize) {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new RangeError('ファイルサイズが不正です。');
  }
  if (!Number.isSafeInteger(partSize) || partSize <= 0) {
    throw new RangeError('分割サイズは1バイト以上の整数にしてください。');
  }
  return Math.max(1, Math.ceil(fileSize / partSize));
}

export function assertNotCancelled(shouldCancel) {
  if (shouldCancel?.()) throw new CancelledError();
}

export function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function createProgressReporter(callback, minIntervalMs = 80) {
  let lastTime = 0;
  let lastProcessed = -1;
  return (progress, force = false) => {
    if (!callback) return;
    const now = Date.now();
    if (force || progress.processedBytes === progress.totalBytes || now - lastTime >= minIntervalMs) {
      if (progress.processedBytes !== lastProcessed || force) {
        callback(progress);
        lastProcessed = progress.processedBytes;
        lastTime = now;
      }
    }
  };
}

export function safeJsonParse(text) {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error };
  }
}
