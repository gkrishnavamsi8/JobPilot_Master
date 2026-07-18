import * as esbuild from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const extensionDir = join(root, 'extension');

/** Minimal 1x1 blue PNG */
const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writePlaceholderIcons() {
  await ensureDir(join(extensionDir, 'icons'));
  for (const size of [16, 48, 128]) {
    await writeFile(join(extensionDir, `icons/icon${size}.png`), MINI_PNG);
  }
}

async function buildContentScript() {
  await esbuild.build({
    entryPoints: [join(root, 'extension/src/content.ts')],
    outfile: join(extensionDir, 'content/content.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome109'],
    sourcemap: true,
    logLevel: 'info',
  });
}

async function main() {
  await writePlaceholderIcons();
  await buildContentScript();
  console.log('Extension build complete → extension/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
