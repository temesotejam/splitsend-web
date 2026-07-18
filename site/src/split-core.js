import { DEFAULT_CHUNK_SIZE, MAX_PART_COUNT } from './constants.js';
import { SplitSendError } from './errors.js';
import { createManifest } from './manifest.js';
import { createPackageId, createPackageNames } from './naming.js';
import { readBlobRange } from './blob-stream.js';
import { Sha256 } from './sha256.js';
import {
  assertNotCancelled,
  calculatePartCount,
  createProgressReporter,
} from './utils.js';

export async function splitBlob({
  blob,
  originalName,
  mimeType = '',
  lastModified = 0,
  partSize,
  packageId = createPackageId(),
  chunkSize = DEFAULT_CHUNK_SIZE,
  createWriter,
  onProgress,
  shouldCancel,
}) {
  if (!(blob instanceof Blob)) throw new TypeError('blob must be a Blob.');
  if (typeof originalName !== 'string' || originalName.length === 0) {
    throw new SplitSendError('元ファイル名が不正です。', 'INVALID_FILENAME');
  }
  if (typeof createWriter !== 'function') throw new TypeError('createWriter is required.');

  const partCount = calculatePartCount(blob.size, partSize);
  if (partCount > MAX_PART_COUNT) {
    throw new SplitSendError(
      `分割数が多すぎます（${partCount}個）。分割サイズを大きくしてください。`,
      'TOO_MANY_PARTS',
    );
  }

  const names = createPackageNames(originalName, packageId, partCount);
  const overallHash = new Sha256();
  const parts = [];
  let processedBytes = 0;
  const report = createProgressReporter(onProgress);

  report({
    phase: 'split',
    processedBytes,
    totalBytes: blob.size,
    partIndex: 0,
    partCount,
    currentName: '',
  }, true);

  for (let index = 1; index <= partCount; index += 1) {
    assertNotCancelled(shouldCancel);
    const offset = (index - 1) * partSize;
    const size = Math.min(partSize, Math.max(0, blob.size - offset));
    const partName = names.partName(index);
    const partHash = new Sha256();
    const writer = await createWriter(partName);
    let closed = false;

    try {
      for await (const bytes of readBlobRange(blob, {
        start: offset,
        length: size,
        chunkSize,
        shouldCancel,
      })) {
        partHash.update(bytes);
        overallHash.update(bytes);
        await writer.write(bytes);
        processedBytes += bytes.byteLength;
        report({
          phase: 'split',
          processedBytes,
          totalBytes: blob.size,
          partIndex: index,
          partCount,
          currentName: partName,
        });
      }
      assertNotCancelled(shouldCancel);
      await writer.close();
      closed = true;
    } catch (error) {
      if (!closed) {
        try { await writer.abort?.(error); } catch { /* Keep original error. */ }
      }
      throw error;
    }

    parts.push({
      index,
      name: partName,
      offset,
      size,
      sha256: partHash.hex(),
    });
  }

  assertNotCancelled(shouldCancel);
  const manifest = createManifest({
    packageId,
    originalName,
    originalSize: blob.size,
    mimeType,
    lastModified,
    originalSha256: overallHash.hex(),
    partSize,
    parts,
  });

  report({
    phase: 'split',
    processedBytes: blob.size,
    totalBytes: blob.size,
    partIndex: partCount,
    partCount,
    currentName: parts.at(-1)?.name ?? '',
  }, true);

  return { manifest, names };
}
