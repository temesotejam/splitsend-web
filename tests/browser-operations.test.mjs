import test from 'node:test';
import assert from 'node:assert/strict';
import { splitToDirectory, restoreToFile } from '../site/src/browser-operations.js';
import { CancelledError } from '../site/src/errors.js';

function fsError(name, message) {
  return new DOMException(message, name);
}

class FakeFileHandle {
  constructor(name) {
    this.kind = 'file';
    this.name = name;
    this.bytes = new Uint8Array();
    this.createWritableCalls = 0;
  }

  async createWritable() {
    this.createWritableCalls += 1;
    const chunks = [];
    let aborted = false;
    return {
      write: async (data) => {
        if (aborted) throw new Error('writer aborted');
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        chunks.push(new Uint8Array(bytes));
      },
      close: async () => {
        if (aborted) throw new Error('writer aborted');
        const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.bytes = merged;
      },
      abort: async () => { aborted = true; },
    };
  }

  toFile(type = '') {
    return new File([this.bytes], this.name, { type });
  }
}

class FakeDirectoryHandle {
  constructor(name = 'root') {
    this.kind = 'directory';
    this.name = name;
    this.directories = new Map();
    this.files = new Map();
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    if (this.files.has(name)) throw fsError('TypeMismatchError', 'A file exists with this name.');
    if (this.directories.has(name)) return this.directories.get(name);
    if (!create) throw fsError('NotFoundError', 'Directory not found.');
    const directory = new FakeDirectoryHandle(name);
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(name, { create = false } = {}) {
    if (this.directories.has(name)) throw fsError('TypeMismatchError', 'A directory exists with this name.');
    if (this.files.has(name)) return this.files.get(name);
    if (!create) throw fsError('NotFoundError', 'File not found.');
    const file = new FakeFileHandle(name);
    this.files.set(name, file);
    return file;
  }

  async removeEntry(name, { recursive = false } = {}) {
    if (this.files.delete(name)) return;
    const directory = this.directories.get(name);
    if (!directory) throw fsError('NotFoundError', 'Entry not found.');
    if (!recursive && (directory.files.size || directory.directories.size)) {
      throw fsError('InvalidModificationError', 'Directory is not empty.');
    }
    this.directories.delete(name);
  }
}

function patternedFile(size, name = 'デモデータ.zip') {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = (i * 19 + 7) & 0xff;
  return { bytes, file: new File([bytes], name, { type: 'application/zip', lastModified: 1000 }) };
}

test('browser operations create one package folder and restore byte-identically', async () => {
  const root = new FakeDirectoryHandle();
  const source = patternedFile(2_345_678);
  const result = await splitToDirectory({
    file: source.file,
    partSize: 1_000_000,
    parentDirectoryHandle: root,
    restoreUrl: 'https://example.invalid/splitsend/#restore',
    chunkSize: 123_457,
  });

  assert.equal(root.directories.size, 1);
  const outputDirectory = root.directories.get(result.folderName);
  assert.ok(outputDirectory);
  assert.equal(result.manifest.parts.length, 3);
  assert.ok(outputDirectory.files.has(result.manifestName));
  assert.ok(outputDirectory.files.has(result.instructionsName));

  const manifestText = new TextDecoder().decode(outputDirectory.files.get(result.manifestName).bytes);
  const manifest = JSON.parse(manifestText);
  const partFiles = manifest.parts.map((part) => outputDirectory.files.get(part.name).toFile());

  const outputHandle = new FakeFileHandle('restored.zip');
  const restored = await restoreToFile({
    manifest,
    partFiles,
    outputFileHandle: outputHandle,
    chunkSize: 91_337,
  });

  assert.equal(restored.size, source.bytes.length);
  assert.deepEqual(outputHandle.bytes, source.bytes);
  assert.equal(outputHandle.createWritableCalls, 1);
});

test('cancelled split removes the incomplete package folder', async () => {
  const root = new FakeDirectoryHandle();
  const source = patternedFile(2_000_000, 'cancel.bin');
  let cancelled = false;

  await assert.rejects(
    splitToDirectory({
      file: source.file,
      partSize: 1_000_000,
      parentDirectoryHandle: root,
      restoreUrl: 'https://example.invalid/#restore',
      chunkSize: 100_000,
      shouldCancel: () => cancelled,
      onProgress: (progress) => {
        if (progress.processedBytes > 0) cancelled = true;
      },
    }),
    (error) => error instanceof CancelledError,
  );

  assert.equal(root.directories.size, 0);
});

test('missing parts do not open the output file writer', async () => {
  const root = new FakeDirectoryHandle();
  const source = patternedFile(1_500_000, 'missing.bin');
  const result = await splitToDirectory({
    file: source.file,
    partSize: 1_000_000,
    parentDirectoryHandle: root,
    restoreUrl: 'https://example.invalid/#restore',
  });
  const outputDirectory = root.directories.get(result.folderName);
  const onlyFirstPart = [outputDirectory.files.get(result.manifest.parts[0].name).toFile()];
  const outputHandle = new FakeFileHandle('restored.bin');

  await assert.rejects(
    restoreToFile({
      manifest: result.manifest,
      partFiles: onlyFirstPart,
      outputFileHandle: outputHandle,
    }),
    /不足/,
  );
  assert.equal(outputHandle.createWritableCalls, 0);
});
