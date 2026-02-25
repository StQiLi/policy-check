import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Manual multi-entry build for Chrome MV3.
 *
 * Produces: dist/background.js, dist/popup/...
 * content.js is built separately (vite.content.config.ts) as IIFE so it
 * can be injected via chrome.scripting.executeScript.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    // In dev (watch), don't empty so we keep content.js from the separate IIFE build
    emptyOutDir: process.env.KEEP_DIST !== '1',
    sourcemap: process.env.NODE_ENV !== 'production',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        hub: resolve(__dirname, 'src/hub/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
