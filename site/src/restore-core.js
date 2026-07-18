import { DEFAULT_CHUNK_SIZE } from './constants.js';
import { IntegrityError, SplitSendError } from './errors.js';
import { assertValidManifest } from './manifest.js';
import { readBlobRange } from './blob-stream.js';
import { Sha256 } from './sha256.js';
import { assertNotCancelled, createProgressReporter } from './utils.js';

function normalizePartMap(partFiles) {
  if (partFiles instanceof Map) return partFiles;
  const map = new Map();
  for (const file of partFiles ?? []) {
    if (map.has(file.name)) {
      throw new SplitSendError(`同名のパーツが複数あります: ${file.name}`, 'DUPLICATE_PART');
    }
    map.set(file.name, file);
  }
  return map;
}

export function inspectParts(manifest, partFiles) {
  assertValidManifest(manifest);
  const files = normalizePartMap(partFiles);
  const missing = [];
  const sizeMismatches = [];

  for (const part of manifest.parts) {
    const file = files.get(part.name);
    if (!file) {
      missing.push(part.name);
    } else if (file.size !== part.size) {
      sizeMismatches.push({ name: part.name, expected: part.size, actual: file.size });
    }
  }

  return {
    ready: missing.length === 0 && sizeMismatches.length === 0,
    missing,
    sizeMismatches,
    matchedCount: manifest.parts.length - missing.length,
    requiredCount: manifest.parts.length,
  };
}

export async function restoreParts({
  manifest,
  partFiles,
  outputWriter,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress,
  shouldCancel,
}) {
  assertValidManifest(manifest);
  if (!outputWriter || typeof outputWriter.write !== 'function') {
    throw new TypeError('outputWriter is required.');
  }

  const files = normalizePartMap(partFiles);
  const inspection = inspectParts(manifest, files);
  if (inspection.missing.length > 0) {
    throw new SplitSendError(
      `必要なパーツが不足しています。\n${inspection.missing.map((name) => `・${name}`).join('\n')}`,
      'MISSING_PARTS',
      inspection.missing,
    );
  }
  if (inspection.sizeMismatches.length > 0) {
    const lines = inspection.sizeMismatches.map(
      (item) => `・${item.name}: 期待 ${item.expected} bytes / 実際 ${item.actual} bytes`,
    );
    throw new IntegrityError(`パーツのサイズが一致しません。\n${lines.join('\n')}`, inspection.sizeMismatches);
  }

  const overallHash = new Sha256();
  let processedBytes = 0;
  let closed = false;
  const report = createProgressReporter(onProgress);

  report({
    phase: 'restore',
    processedBytes,
    totalBytes: manifest.original.size,
    partIndex: 0,
    partCount: manifest.parts.length,
    currentName: '',
  }, true);

  try {
    for (const part of manifest.parts) {
      assertNotCancelled(shouldCancel);
      const file = files.get(part.name);
      const partHash = new Sha256();

      for await (const bytes of readBlobRange(file, {
        start: 0,
        length: file.size,
        chunkSize,
        shouldCancel,
      })) {
        partHash.update(bytes);
        overallHash.update(bytes);
        await outputWriter.write(bytes);
        processedBytes += bytes.byteLength;
        report({
          phase: 'restore',
          processedBytes,
          totalBytes: manifest.original.size,
          partIndex: part.index,
          partCount: manifest.parts.length,
          currentName: part.name,
        });
      }

      const actualPartHash = partHash.hex();
      if (actualPartHash.toLowerCase() !== part.sha256.toLowerCase()) {
        throw new IntegrityError(
          `${part.name} のSHA-256が一致しません。破損または別ファイルの可能性があります。`,
          { name: part.name, expected: part.sha256, actual: actualPartHash },
        );
      }
    }

    assertNotCancelled(shouldCancel);
    if (processedBytes !== manifest.original.size) {
      throw new IntegrityError(
        `復元サイズが一致しません。期待 ${manifest.original.size} bytes / 実際 ${processedBytes} bytes`,
      );
    }

    const actualOriginalHash = overallHash.hex();
    if (actualOriginalHash.toLowerCase() !== manifest.original.sha256.toLowerCase()) {
      throw new IntegrityError(
        '復元ファイル全体のSHA-256が元ファイルと一致しません。',
        { expected: manifest.original.sha256, actual: actualOriginalHash },
      );
    }

    await outputWriter.close();
    closed = true;
    report({
      phase: 'restore',
      processedBytes: manifest.original.size,
      totalBytes: manifest.original.size,
      partIndex: manifest.parts.length,
      partCount: manifest.parts.length,
      currentName: manifest.parts.at(-1)?.name ?? '',
    }, true);

    return {
      size: processedBytes,
      sha256: actualOriginalHash,
      originalName: manifest.original.name,
    };
  } catch (error) {
    if (!closed) {
      try { await outputWriter.abort?.(error); } catch { /* Keep original error. */ }
    }
    throw error;
  }
}
