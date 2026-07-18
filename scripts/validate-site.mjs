import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

for (const required of ['index.html', 'styles.css', 'src/app.js', 'src/worker.js', '.nojekyll']) {
  try { await stat(path.join(site, required)); }
  catch { errors.push(`Missing required file: ${required}`); }
}

const files = await walk(site);
for (const file of files) {
  const relative = path.relative(site, file);
  if (!/\.(html|css|js|svg)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  const external = text.match(/(?:src|href)=["']https?:\/\//i);
  if (external) errors.push(`${relative}: external asset reference is not allowed`);
  if (/\bfetch\s*\(/.test(text) || /XMLHttpRequest/.test(text) || /WebSocket\s*\(/.test(text)) {
    errors.push(`${relative}: network API usage is not allowed`);
  }
}

for (const file of files.filter((item) => item.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${path.relative(site, file)}: JavaScript syntax error\n${result.stderr}`);
}

const html = await readFile(path.join(site, 'index.html'), 'utf8');
for (const reference of ['./styles.css', './src/app.js', './icon.svg']) {
  if (!html.includes(reference)) errors.push(`index.html does not reference ${reference}`);
}
if (!html.includes("connect-src 'none'")) errors.push('Content Security Policy must disable network connections.');

const appSource = await readFile(path.join(site, 'src/app.js'), 'utf8');
const referencedIds = new Set(Array.from(appSource.matchAll(/\$\('#([^']+)'\)/g), (match) => match[1]));
const htmlIds = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), (match) => match[1]));
for (const id of referencedIds) {
  if (!htmlIds.has(id)) errors.push(`app.js references missing HTML id: ${id}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Static validation passed (${files.length} files).`);
