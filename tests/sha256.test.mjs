import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Sha256, sha256Hex } from '../site/src/sha256.js';

function expected(input) {
  return createHash('sha256').update(input).digest('hex');
}

test('SHA-256 known vectors', () => {
  const vectors = [
    new Uint8Array(),
    new TextEncoder().encode('abc'),
    new TextEncoder().encode('hello world'),
    new TextEncoder().encode('a'.repeat(1_000_000)),
  ];
  for (const input of vectors) {
    assert.equal(sha256Hex(input), expected(input));
  }
});

test('SHA-256 incremental updates match Node crypto', () => {
  const input = new Uint8Array(2_000_123);
  for (let i = 0; i < input.length; i += 1) input[i] = (i * 31 + 17) & 0xff;
  const hash = new Sha256();
  for (let offset = 0; offset < input.length; offset += 7_919) {
    hash.update(input.subarray(offset, Math.min(input.length, offset + 7_919)));
  }
  assert.equal(hash.hex(), expected(input));
});
