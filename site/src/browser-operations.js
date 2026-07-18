import { DEFAULT_CHUNK_SIZE } from './constants.js';
import { CancelledError, SplitSendError } from './errors.js';
import { serializeManifest } from './manifest.js';
import { createPackageId, createPackageNames, sanitizeFilename } from './naming.js';
import { restoreParts } from './restore-core.js';
import { splitBlob } from './split-core.js';
import { calculatePartCount } from './utils.js';

function makeWriter(fileHandle) {
  let streamPromise;
  const getStream = () => {
    streamPromise ??= fileHandle.createWritable();
    return streamPromise;
  };
  return {
    async write(bytes) {
      const stream = await getStream();
      await stream.write(bytes);
    },
    async close() {
      const stream = await getStream();
      await stream.close();
    },
    async abort(reason) {
      if (!streamPromise) return;
      const stream = await streamPromise;
      await stream.abort(reason);
    },
  };
}

async function entryExists(directoryHandle, name) {
  try {
    await directoryHandle.getDirectoryHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') {
      try {
        await directoryHandle.getFileHandle(name, { create: false });
        return true;
      } catch (fileError) {
        if (fileError?.name === 'NotFoundError') return false;
        if (fileError?.name === 'TypeMismatchError') return true;
        throw fileError;
      }
    }
    if (error?.name === 'TypeMismatchError') return true;
    throw error;
  }
}

export async function createUniqueDirectory(parentHandle, preferredName) {
  for (let suffix = 1; suffix <= 9999; suffix += 1) {
    const candidate = suffix === 1 ? preferredName : `${preferredName}_${suffix}`;
    if (!(await entryExists(parentHandle, candidate))) {
      const handle = await parentHandle.getDirectoryHandle(candidate, { create: true });
      return { handle, name: candidate };
    }
  }
  throw new SplitSendError('出力フォルダー名を確保できませんでした。', 'DIRECTORY_NAME_EXHAUSTED');
}

async function writeTextFile(directoryHandle, name, content) {
  const handle = await directoryHandle.getFileHandle(name, { create: true });
  const writer = makeWriter(handle);
  try {
    await writer.write(new TextEncoder().encode(content));
    await writer.close();
  } catch (error) {
    try { await writer.abort(error); } catch { /* Keep original error. */ }
    throw error;
  }
}

export function buildRestoreInstructions(manifest, restoreUrl) {
  return `SplitSendで分割されたファイルです。\r\n\r\n`
    + `元ファイル: ${manifest.original.name}\r\n`
    + `元サイズ: ${manifest.original.size} bytes\r\n`
    + `パーツ数: ${manifest.split.partCount}\r\n`
    + `パッケージID: ${manifest.packageId}\r\n\r\n`
    + `復元方法\r\n`
    + `1. すべての .part ファイルと .splitsend.json を保存します。\r\n`
    + `2. 次のページをGoogle Chromeで開きます。\r\n`
    + `${restoreUrl}\r\n`
    + `3. 「復元」を選び、ファイル一式をまとめてドラッグ＆ドロップします。\r\n`
    + `4. 復元先を選び、「検証して復元」を実行します。\r\n\r\n`
    + `注意: 分割は暗号化ではありません。パーツを持つ人は元ファイルを復元できます。\r\n`;
}

export async function splitToDirectory({
  file,
  partSize,
  parentDirectoryHandle,
  restoreUrl,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress,
  shouldCancel,
}) {
  if (!parentDirectoryHandle) throw new TypeError('parentDirectoryHandle is required.');
  const packageId = createPackageId();
  const partCount = calculatePartCount(file.size, partSize);
  const plannedNames = createPackageNames(file.name, packageId, partCount);
  const packageDirectory = await createUniqueDirectory(parentDirectoryHandle, plannedNames.folderName);

  try {
    const result = await splitBlob({
      blob: file,
      originalName: file.name,
      mimeType: file.type,
      lastModified: file.lastModified,
      partSize,
      packageId,
      chunkSize,
      shouldCancel,
      onProgress,
      async createWriter(name) {
        const handle = await packageDirectory.handle.getFileHandle(name, { create: true });
        return makeWriter(handle);
      },
    });

    if (shouldCancel?.()) throw new CancelledError();
    await writeTextFile(
      packageDirectory.handle,
      result.names.manifestName,
      serializeManifest(result.manifest),
    );
    await writeTextFile(
      packageDirectory.handle,
      result.names.instructionsName,
      buildRestoreInstructions(result.manifest, restoreUrl),
    );

    return {
      manifest: result.manifest,
      folderName: packageDirectory.name,
      manifestName: result.names.manifestName,
      instructionsName: result.names.instructionsName,
    };
  } catch (error) {
    try {
      await parentDirectoryHandle.removeEntry(packageDirectory.name, { recursive: true });
    } catch (cleanupError) {
      error.cleanupWarning = `不完全なフォルダー「${packageDirectory.name}」を自動削除できませんでした。手動で削除してください。`;
      error.cleanupCause = cleanupError;
    }
    throw error;
  }
}

export async function restoreToFile({
  manifest,
  partFiles,
  outputFileHandle,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress,
  shouldCancel,
}) {
  if (!outputFileHandle) throw new TypeError('outputFileHandle is required.');
  const writer = makeWriter(outputFileHandle);
  return restoreParts({
    manifest,
    partFiles,
    outputWriter: writer,
    chunkSize,
    onProgress,
    shouldCancel,
  });
}

export function suggestedRestoredFilename(originalName) {
  return sanitizeFilename(originalName, { fallback: 'restored-file', maxLength: 180 });
}
