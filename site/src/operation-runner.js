import { restoreToFile, splitToDirectory } from './browser-operations.js';

export class OperationRunner {
  constructor() {
    this.pending = new Map();
    this.worker = null;
    this.#createWorker();
  }

  #createWorker() {
    try {
      this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', (event) => this.#handleMessage(event.data));
      this.worker.addEventListener('error', (event) => {
        event.preventDefault?.();
        this.#handleWorkerFailure(event.error ?? new Error(event.message));
      });
    } catch {
      this.worker = null;
    }
  }

  start(type, payload, { onProgress } = {}) {
    const jobId = globalThis.crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    let directCancelled = false;
    let settled = false;

    const cancel = () => {
      if (settled) return;
      directCancelled = true;
      if (this.worker && this.pending.has(jobId)) {
        this.worker.postMessage({ type: 'cancel', jobId });
      }
    };

    if (this.worker) {
      let resolveWorker;
      let rejectWorker;
      const workerPromise = new Promise((resolve, reject) => {
        resolveWorker = resolve;
        rejectWorker = reject;
      });
      this.pending.set(jobId, {
        resolve: (value) => { settled = true; resolveWorker(value); },
        reject: (error) => { settled = true; rejectWorker(error); },
        onProgress,
      });

      try {
        this.worker.postMessage({ type, jobId, payload });
        return { jobId, promise: workerPromise, cancel, mode: 'worker' };
      } catch {
        this.pending.delete(jobId);
        this.worker.terminate();
        this.worker = null;
      }
    }

    const operation = type === 'split' ? splitToDirectory : restoreToFile;
    const promise = operation({
      ...payload,
      onProgress,
      shouldCancel: () => directCancelled,
    }).finally(() => { settled = true; });
    return { jobId, promise, cancel, mode: 'main-thread' };
  }

  #handleMessage(message) {
    const pending = this.pending.get(message?.jobId);
    if (!pending) return;
    if (message.type === 'progress') {
      pending.onProgress?.(message.progress);
      return;
    }

    this.pending.delete(message.jobId);
    if (message.type === 'completed') {
      pending.resolve(message.result);
    } else if (message.type === 'error') {
      const error = new Error(message.error?.message ?? '処理に失敗しました。');
      Object.assign(error, message.error ?? {});
      pending.reject(error);
    }
  }

  #handleWorkerFailure(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
