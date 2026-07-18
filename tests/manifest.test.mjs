import test from 'node:test';
import assert from 'node:assert/strict';
import { createManifest, validateManifest } from '../site/src/manifest.js';
import { sanitizeFilename, createPackageNames } from '../site/src/naming.js';

function validManifest() {
  return createManifest({
    packageId: '1234ABCD',
    originalName: 'sample.bin',
    originalSize: 12,
    originalSha256: 'a'.repeat(64),
    partSize: 5,
    parts: [
      { index: 1, name: 'sample_1234ABCD.part001', offset: 0, size: 5, sha256: 'b'.repeat(64) },
      { index: 2, name: 'sample_1234ABCD.part002', offset: 5, size: 5, sha256: 'c'.repeat(64) },
      { index: 3, name: 'sample_1234ABCD.part003', offset: 10, size: 2, sha256: 'd'.repeat(64) },
    ],
  });
}

test('valid manifest passes', () => {
  assert.deepEqual(validateManifest(validManifest()), { valid: true, errors: [] });
});

test('manifest detects gaps and unsafe names', () => {
  const manifest = validManifest();
  manifest.parts[1].offset = 6;
  manifest.parts[1].name = '../bad.part002';
  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('name')));
  assert.ok(result.errors.some((error) => error.includes('offset')));
});

test('Windows-unsafe names are sanitized', () => {
  assert.equal(sanitizeFilename('CON.txt'), '_CON.txt');
  assert.equal(sanitizeFilename('bad<name>?.zip'), 'bad_name__.zip');
  const names = createPackageNames('研究データ（最終）.zip', 'A1B2C3D4', 12);
  assert.equal(names.partName(1).endsWith('.part001'), true);
  assert.equal(names.folderName.startsWith('SplitSend_'), true);
});
