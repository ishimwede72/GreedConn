/**
 * GREEDCON clean (`npm run clean`).
 *
 * Removes build/test artifacts: dist/, media/, coverage/, dist/coverage/,
 * dist/test-results/ and any *.vsix leftovers (repo root + dist/).
 * Idempotent: missing paths are skipped without error, and the script prints
 * exactly what was removed (or that there was nothing to remove).
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directories to remove (sub-paths listed first so the report is accurate). */
const directoryTargets: string[] = [
  'dist/coverage',
  'dist/test-results',
  'dist',
  'media',
  'coverage',
];

/** Collect everything that exists first, then remove it. */
const existingDirs = directoryTargets.filter((rel) => existsSync(path.join(rootDir, rel)));

const vsixLeftovers: string[] = [];
for (const dir of [rootDir, path.join(rootDir, 'dist')]) {
  if (!existsSync(dir)) {
    continue;
  }
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith('.vsix')) {
      vsixLeftovers.push(path.join(dir, entry));
    }
  }
}

if (existingDirs.length === 0 && vsixLeftovers.length === 0) {
  console.log('[greedcon] clean: nothing to remove (already clean).');
  process.exit(0);
}

for (const rel of existingDirs) {
  rmSync(path.join(rootDir, rel), { recursive: true, force: true });
  console.log(`[greedcon] clean: removed ${rel}/`);
}
for (const file of vsixLeftovers) {
  rmSync(file, { force: true });
  console.log(`[greedcon] clean: removed ${path.relative(rootDir, file)}`);
}
console.log('[greedcon] clean: done.');
