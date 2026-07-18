export const APP_NAME = 'SplitSend';
export const APP_VERSION = '1.0.0';
export const FORMAT_NAME = 'splitsend';
export const FORMAT_VERSION = 1;
export const HASH_ALGORITHM = 'SHA-256';
export const DEFAULT_PART_SIZE = 9_500_000;
export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
export const MAX_PART_COUNT = 10_000;
export const PACKAGE_ID_LENGTH = 8;

export const SIZE_PRESETS = Object.freeze([
  { value: 9_500_000, label: 'Discord向け 9.5 MB' },
  { value: 25_000_000, label: '25 MB' },
  { value: 49_000_000, label: '49 MB' },
  { value: 95_000_000, label: '95 MB' },
]);
