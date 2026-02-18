/**
 * Copy manifest.json (with rewritten paths) and icons/ into dist/.
 *
 * Vite builds:
 *   src/background.ts  → dist/background.js
 *   src/content.ts     → dist/content.js
 *   src/popup/index.html → dist/src/popup/index.html
 *
 * So the manifest that ships inside dist/ must reference the built
 * filenames, not the source filenames.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
}

// Read and patch manifest.json
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'));

// Rewrite background service worker path
if (manifest.background?.service_worker) {
  manifest.background.service_worker = 'background.js';
}

// Rewrite content script paths
if (manifest.content_scripts) {
  for (const cs of manifest.content_scripts) {
    cs.js = cs.js.map((/** @type {string} */ f) => f.replace(/^src\/(.+)\.ts$/, '$1.js'));
  }
}

writeFileSync(resolve(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Copy icons directory
if (existsSync(resolve(root, 'icons'))) {
  cpSync(resolve(root, 'icons'), resolve(dist, 'icons'), { recursive: true });
}

/* eslint-disable no-console */
console.log('postbuild: patched manifest.json + icons/ written to dist/');
