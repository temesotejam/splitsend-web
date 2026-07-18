import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { restoreParts } from '../site/src/restore-core.js';

const directory = path.resolve('examples/demo-package/SplitSend_demo-source_D3E02026');

test('committed demo package restores to the committed source', async () => {
  const manifest = JSON.parse(await readFile(path.join(directory, 'demo-source_D3E02026.splitsend.json'), 'utf8'));
  const parts = new Map();
  for (const part of manifest.parts) {
    const bytes = await readFile(path.join(directory, part.name));
    parts.set(part.name, new Blob([bytes]));
  }

  const outputChunks = [];
  await restoreParts({
    manifest,
    partFiles: parts,
    outputWriter: {
      async write(bytes) { outputChunks.push(new Uint8Array(bytes)); },
      async close() {},
      async abort() { outputChunks.length = 0; },
    },
  });

  const actual = new Uint8Array(await new Blob(outputChunks).arrayBuffer());
  const expected = new Uint8Array(await readFile('examples/demo-package/demo-source.txt'));
  assert.deepEqual(actual, expected);
});
