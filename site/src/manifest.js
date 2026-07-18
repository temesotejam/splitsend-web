import {
  APP_NAME,
  APP_VERSION,
  FORMAT_NAME,
  FORMAT_VERSION,
  HASH_ALGORITHM,
  MAX_PART_COUNT,
} from './constants.js';
import { SplitSendError } from './errors.js';
import { isSafeBasename } from './naming.js';
import { calculatePartCount } from './utils.js';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const PACKAGE_ID = /^[A-F0-9]{8}$/;

export function createManifest({
  packageId,
  originalName,
  originalSize,
  mimeType = '',
  lastModified = 0,
  originalSha256,
  partSize,
  parts,
}) {
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    packageId,
    createdAt: new Date().toISOString(),
    createdBy: {
      application: APP_NAME,
      version: APP_VERSION,
    },
    integrity: {
      algorithm: HASH_ALGORITHM,
    },
    original: {
      name: originalName,
      size: originalSize,
      mimeType: typeof mimeType === 'string' ? mimeType : '',
      lastModified: Number.isFinite(lastModified) ? lastModified : 0,
      sha256: originalSha256,
    },
    split: {
      method: 'contiguous-bytes',
      partSize,
      partCount: parts.length,
    },
    parts,
  };
}

function integerInRange(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export function validateManifest(manifest) {
  const errors = [];
  const add = (message) => errors.push(message);

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['マニフェストの最上位はオブジェクトである必要があります。'] };
  }

  if (manifest.format !== FORMAT_NAME) add(`format は "${FORMAT_NAME}" である必要があります。`);
  if (manifest.version !== FORMAT_VERSION) add(`対応していない形式バージョンです: ${String(manifest.version)}`);
  if (!PACKAGE_ID.test(manifest.packageId ?? '')) add('packageId は8桁の16進数である必要があります。');
  if (manifest.integrity?.algorithm !== HASH_ALGORITHM) add(`integrity.algorithm は ${HASH_ALGORITHM} である必要があります。`);

  const original = manifest.original;
  if (!original || typeof original !== 'object') {
    add('original 情報がありません。');
  } else {
    if (!isSafeBasename(original.name)) add('original.name が不正です。');
    if (!integerInRange(original.size, 0)) add('original.size が不正です。');
    if (!SHA256_HEX.test(original.sha256 ?? '')) add('original.sha256 が不正です。');
    if (typeof original.mimeType !== 'string') add('original.mimeType が不正です。');
    if (!Number.isFinite(original.lastModified) || original.lastModified < 0) add('original.lastModified が不正です。');
  }

  const split = manifest.split;
  if (!split || typeof split !== 'object') {
    add('split 情報がありません。');
  } else {
    if (split.method !== 'contiguous-bytes') add('対応していない分割方式です。');
    if (!integerInRange(split.partSize, 1)) add('split.partSize が不正です。');
    if (!integerInRange(split.partCount, 1, MAX_PART_COUNT)) add(`split.partCount は1〜${MAX_PART_COUNT}の範囲である必要があります。`);
  }

  if (!Array.isArray(manifest.parts)) {
    add('parts は配列である必要があります。');
  } else if (manifest.parts.length > MAX_PART_COUNT) {
    add(`parts が多すぎます。上限は${MAX_PART_COUNT}個です。`);
  }

  if (errors.length > 0 || !original || !split || !Array.isArray(manifest.parts)) {
    return { valid: false, errors };
  }

  if (manifest.parts.length !== split.partCount) {
    add('split.partCount と parts の個数が一致しません。');
  }

  const expectedCount = calculatePartCount(original.size, split.partSize);
  if (split.partCount !== expectedCount) {
    add(`partCount が元ファイルサイズと一致しません。期待値: ${expectedCount}`);
  }

  const names = new Set();
  let expectedOffset = 0;
  let totalSize = 0;

  for (let i = 0; i < manifest.parts.length; i += 1) {
    const part = manifest.parts[i];
    const expectedIndex = i + 1;
    if (!part || typeof part !== 'object') {
      add(`parts[${i}] が不正です。`);
      continue;
    }
    if (part.index !== expectedIndex) add(`parts[${i}].index は ${expectedIndex} である必要があります。`);
    if (!isSafeBasename(part.name)) add(`parts[${i}].name が不正です。`);
    if (names.has(part.name)) add(`パーツ名が重複しています: ${part.name}`);
    names.add(part.name);
    if (!integerInRange(part.offset, 0)) add(`parts[${i}].offset が不正です。`);
    if (part.offset !== expectedOffset) add(`parts[${i}].offset が連続していません。`);
    if (!integerInRange(part.size, 0)) add(`parts[${i}].size が不正です。`);
    if (!SHA256_HEX.test(part.sha256 ?? '')) add(`parts[${i}].sha256 が不正です。`);

    const isLast = i === manifest.parts.length - 1;
    if (!isLast && part.size !== split.partSize) {
      add(`parts[${i}].size は最後のパーツ以外 ${split.partSize} bytes である必要があります。`);
    }
    if (isLast && original.size > 0 && (part.size <= 0 || part.size > split.partSize)) {
      add(`最後のパーツサイズが不正です: ${part.size}`);
    }
    if (original.size === 0 && (manifest.parts.length !== 1 || part.size !== 0)) {
      add('0バイトファイルは0バイトのパーツ1個で表現する必要があります。');
    }

    expectedOffset += part.size;
    totalSize += part.size;
  }

  if (totalSize !== original.size) {
    add(`パーツ合計サイズと元ファイルサイズが一致しません。合計: ${totalSize}, 元: ${original.size}`);
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidManifest(manifest) {
  const result = validateManifest(manifest);
  if (!result.valid) {
    throw new SplitSendError(
      `復元情報が不正です。\n${result.errors.map((error) => `・${error}`).join('\n')}`,
      'INVALID_MANIFEST',
      result.errors,
    );
  }
  return manifest;
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
