/**
 * GREEDCON production build (`npm run compile`, `vscode:prepublish`).
 *
 * Delegates to the canonical esbuild pipeline in `esbuild.js` so behaviour is
 * kept identical:
 *   1. src/extension.ts -> dist/extension.js   (CJS, `vscode` external, minified)
 *   2. webview/app.ts   -> media/webview.js    (IIFE, minified)
 *      webview/app.css  -> media/webview.css   (CSS import from app.ts)
 *
 * Exits non-zero (with a clear message) if esbuild fails or an expected
 * output file is missing; otherwise prints the output files and their sizes.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const expectedOutputs: string[] = [
  path.join(rootDir, 'dist', 'extension.js'),
  path.join(rootDir, 'media', 'webview.js'),
  path.join(rootDir, 'media', 'webview.css'),
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fail(message: string): never {
  console.error(`[greedcon] build failed: ${message}`);
  process.exit(1);
}

// 1. Run the existing esbuild pipeline (identical entry points & options).
const result = spawnSync(process.execPath, [path.join(rootDir, 'esbuild.js')], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (result.error) {
  fail(`unable to start esbuild.js (${result.error.message})`);
}
if (result.status !== 0) {
  fail(`esbuild.js exited with code ${result.status ?? 'unknown'}`);
}

// 2. Verify every expected bundle exists and summarize sizes.
const missing = expectedOutputs.filter((file) => !existsSync(file));
if (missing.length > 0) {
  for (const file of missing) {
    console.error(
      `[greedcon] build failed: expected output missing: ${path.relative(rootDir, file)}`,
    );
  }
  process.exit(1);
}

console.log('[greedcon] build outputs:');
for (const file of expectedOutputs) {
  const stats = statSync(file);
  console.log(`  - ${path.relative(rootDir, file)} (${formatBytes(stats.size)})`);
}
