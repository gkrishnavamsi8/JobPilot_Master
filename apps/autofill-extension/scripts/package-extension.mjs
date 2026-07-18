/**
 * Package the built extension into a downloadable zip served by the web app
 * at /jobpilot-extension.zip (Dashboard → "Download extension").
 *
 * Only runtime files go in: manifest, background/, content/ (no source maps),
 * popup/, icons/. Run after build-extension.mjs.
 */

import AdmZip from 'adm-zip';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extensionDir = path.join(root, 'extension');
const outDir = path.join(root, '..', 'web', 'public');
const outFile = path.join(outDir, 'jobpilot-extension.zip');

const INCLUDE = ['manifest.json', 'background', 'content', 'popup', 'icons'];
const EXCLUDE_EXTENSIONS = new Set(['.map', '.ts']);

if (!existsSync(path.join(extensionDir, 'manifest.json'))) {
  console.error('extension/manifest.json not found — run build-extension.mjs first');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const zip = new AdmZip();
for (const entry of INCLUDE) {
  const full = path.join(extensionDir, entry);
  if (!existsSync(full)) continue;
  if (entry.includes('.')) {
    zip.addLocalFile(full);
  } else {
    zip.addLocalFolder(full, entry, (file) => !EXCLUDE_EXTENSIONS.has(path.extname(file)));
  }
}
zip.writeZip(outFile);

const kb = Math.round(zip.toBuffer().length / 1024);
console.log(`Packaged extension → ${path.relative(process.cwd(), outFile)} (${kb} KB)`);
