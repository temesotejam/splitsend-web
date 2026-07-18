import { PACKAGE_ID_LENGTH } from './constants.js';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const PATH_SEPARATOR_OR_CONTROL = /[/\\\u0000-\u001f]/;

export function splitExtension(filename) {
  const name = String(filename ?? '');
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return { stem: name, extension: '' };
  }
  return { stem: name.slice(0, lastDot), extension: name.slice(lastDot) };
}

export function sanitizeFilename(filename, { fallback = 'file', maxLength = 180 } = {}) {
  let safe = String(filename ?? '').normalize('NFC').replace(UNSAFE_FILENAME_CHARS, '_');
  safe = safe.replace(/[. ]+$/g, '').trim();
  if (!safe || safe === '.' || safe === '..') safe = fallback;
  if (WINDOWS_RESERVED.test(safe)) safe = `_${safe}`;

  if (safe.length > maxLength) {
    const { stem, extension } = splitExtension(safe);
    const allowedStemLength = Math.max(1, maxLength - extension.length);
    safe = `${stem.slice(0, allowedStemLength)}${extension}`;
  }
  return safe;
}

export function sanitizeStem(filename, { fallback = 'file', maxLength = 90 } = {}) {
  const { stem } = splitExtension(sanitizeFilename(filename, { fallback, maxLength: maxLength + 20 }));
  return sanitizeFilename(stem, { fallback, maxLength });
}

export function isSafeBasename(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) return false;
  if (name === '.' || name === '..') return false;
  if (PATH_SEPARATOR_OR_CONTROL.test(name)) return false;
  if (/[. ]$/.test(name)) return false;
  return true;
}

export function createPackageId(length = PACKAGE_ID_LENGTH) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('安全な乱数生成機能を利用できません。');
  }
  const byteCount = Math.ceil(length / 2);
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
    .toUpperCase();
}

export function partNumberWidth(partCount) {
  return Math.max(3, String(partCount).length);
}

export function createPackageNames(originalName, packageId, partCount) {
  const stem = sanitizeStem(originalName);
  const prefix = sanitizeFilename(`${stem}_${packageId}`, { maxLength: 120 });
  const width = partNumberWidth(partCount);
  return {
    stem,
    prefix,
    folderName: sanitizeFilename(`SplitSend_${prefix}`, { maxLength: 150 }),
    manifestName: `${prefix}.splitsend.json`,
    instructionsName: '復元方法.txt',
    partName(index) {
      return `${prefix}.part${String(index).padStart(width, '0')}`;
    },
  };
}
