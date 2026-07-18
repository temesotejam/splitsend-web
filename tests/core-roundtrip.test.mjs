import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBlob } from '../site/src/split-core.js';
import { restoreParts } from '../site/src/restore-core.js';
import { validateManifest } from '../site/src/manifest.js';
import { IntegrityError } from '../site/src/errors.js';

function memoryPartWriter(parts, name) {
  const chunks = [];
  let aborted = false;
  return {
    async write(bytes) {
      assert.equal(aborted, false);
      chunks.push(new Uint8Array(bytes));
    },
    async close() {
      parts.set(name, new Blob(chunks));
    },
    async abort() {
      aborted = true;
      parts.delete(name);
    },
  };
}

function memoryOutputWriter() {
  const chunks = [];
  return {
    chunks,
    aborted: false,
    closed: false,
    async write(bytes) { chunks.push(new Uint8Array(bytes)); },
    async close() { this.closed = true; },
    async abort() { this.aborted = true; },
    blob() { return new Blob(chunks); },
  };
}

function patternedBytes(size) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = (i * 73 + (i >>> 5) + 11) & 0xff;
  return bytes;
}

test('split and restore produce byte-identical output', async () => {
  const source = patternedBytes(5_432_109);
  const parts = new Map();
  const splitResult = await splitBlob({
    blob: new Blob([source]),
    originalName: '実験データ.v1.bin',
    mimeType: 'application/octet-stream',
    lastModified: 123456789,
    partSize: 1_000_000,
    packageId: 'A1B2C3D4',
    chunkSize: 131_071,
    createWriter: (name) => memoryPartWriter(parts, name),
  });

  assert.equal(splitResult.manifest.parts.length, 6);
  assert.equal(validateManifest(splitResult.manifest).valid, true);
  assert.deepEqual(
    splitResult.manifest.parts.map((part) => part.size),
    [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 432_109],
  );

  const output = memoryOutputWriter();
  const restored = await restoreParts({
    manifest: splitResult.manifest,
    partFiles: parts,
    outputWriter: output,
    chunkSize: 97_531,
  });

  assert.equal(output.closed, true);
  assert.equal(output.aborted, false);
  assert.equal(restored.size, source.length);
  assert.deepEqual(new Uint8Array(await output.blob().arrayBuffer()), source);
});

test('zero-byte files use one empty part and restore correctly', async () => {
  const parts = new Map();
  const splitResult = await splitBlob({
    blob: new Blob([]),
    originalName: 'empty.bin',
    partSize: 10,
    packageId: '00000001',
    createWriter: (name) => memoryPartWriter(parts, name),
  });
  assert.equal(splitResult.manifest.parts.length, 1);
  assert.equal(splitResult.manifest.parts[0].size, 0);

  const output = memoryOutputWriter();
  await restoreParts({ manifest: splitResult.manifest, partFiles: parts, outputWriter: output });
  assert.equal((await output.blob().arrayBuffer()).byteLength, 0);
});

test('corrupted part is rejected and output is aborted', async () => {
  const source = patternedBytes(2_400_000);
  const parts = new Map();
  const splitResult = await splitBlob({
    blob: new Blob([source]),
    originalName: 'source.zip',
    partSize: 1_000_000,
    packageId: 'DEADBEEF',
    createWriter: (name) => memoryPartWriter(parts, name),
  });

  const corruptName = splitResult.manifest.parts[1].name;
  const corrupt = new Uint8Array(await parts.get(corruptName).arrayBuffer());
  corrupt[123] ^= 0xff;
  parts.set(corruptName, new Blob([corrupt]));

  const output = memoryOutputWriter();
  await assert.rejects(
    restoreParts({ manifest: splitResult.manifest, partFiles: parts, outputWriter: output }),
    (error) => error instanceof IntegrityError && error.message.includes(corruptName),
  );
  assert.equal(output.aborted, true);
  assert.equal(output.closed, false);
});
