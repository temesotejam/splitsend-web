import { DEFAULT_CHUNK_SIZE } from './constants.js';
import { assertNotCancelled, nextTask } from './utils.js';

export async function* readBlobRange(blob, {
  start = 0,
  length = blob.size - start,
  chunkSize = DEFAULT_CHUNK_SIZE,
  shouldCancel,
  yieldEvery = 4,
} = {}) {
  if (!(blob instanceof Blob)) throw new TypeError('blob must be a Blob.');
  if (!Number.isSafeInteger(start) || start < 0 || start > blob.size) throw new RangeError('start is invalid.');
  if (!Number.isSafeInteger(length) || length < 0 || start + length > blob.size) throw new RangeError('length is invalid.');
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError('chunkSize is invalid.');

  const end = start + length;
  let position = start;
  let chunkIndex = 0;

  while (position < end) {
    assertNotCancelled(shouldCancel);
    const nextPosition = Math.min(end, position + chunkSize);
    const buffer = await blob.slice(position, nextPosition).arrayBuffer();
    yield new Uint8Array(buffer);
    position = nextPosition;
    chunkIndex += 1;
    if (yieldEvery > 0 && chunkIndex % yieldEvery === 0) await nextTask();
  }
}
