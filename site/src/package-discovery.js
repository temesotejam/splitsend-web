import { MAX_MANIFEST_BYTES } from './constants.js';
import { validateManifest } from './manifest.js';
import { inspectParts } from './restore-core.js';
import { safeJsonParse } from './utils.js';

function indexFilesByName(files) {
  const index = new Map();
  for (const file of files) {
    const list = index.get(file.name) ?? [];
    list.push(file);
    index.set(file.name, list);
  }
  return index;
}

export async function discoverPackages(fileList) {
  const files = Array.from(fileList ?? []);
  const index = indexFilesByName(files);
  const manifestFiles = files.filter((file) => file.name.toLowerCase().endsWith('.splitsend.json'));
  const packages = [];

  for (const manifestFile of manifestFiles) {
    if (manifestFile.size > MAX_MANIFEST_BYTES) {
      packages.push({
        key: manifestFile.name,
        manifestFile,
        error: `復元情報ファイルが大きすぎます（上限 ${MAX_MANIFEST_BYTES} bytes）。`,
      });
      continue;
    }

    const text = await manifestFile.text();
    const parsed = safeJsonParse(text);
    if (parsed.error) {
      packages.push({ key: manifestFile.name, manifestFile, error: 'JSONを解析できません。' });
      continue;
    }

    const validation = validateManifest(parsed.value);
    if (!validation.valid) {
      packages.push({
        key: manifestFile.name,
        manifestFile,
        manifest: parsed.value,
        error: validation.errors.join('\n'),
      });
      continue;
    }

    const duplicates = [];
    const partFiles = [];
    for (const part of parsed.value.parts) {
      const matches = index.get(part.name) ?? [];
      if (matches.length > 1) duplicates.push(part.name);
      if (matches.length >= 1) partFiles.push(matches[0]);
    }

    let inspection;
    try {
      inspection = inspectParts(parsed.value, partFiles);
    } catch (error) {
      packages.push({
        key: `${parsed.value.packageId}:${manifestFile.name}`,
        manifestFile,
        manifest: parsed.value,
        error: error.message,
      });
      continue;
    }

    packages.push({
      key: `${parsed.value.packageId}:${manifestFile.name}`,
      manifestFile,
      manifest: parsed.value,
      partFiles,
      duplicates,
      inspection: {
        ...inspection,
        ready: inspection.ready && duplicates.length === 0,
      },
    });
  }

  return {
    files,
    manifestCount: manifestFiles.length,
    packages,
  };
}
