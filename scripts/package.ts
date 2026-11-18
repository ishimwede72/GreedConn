/**
 * GREEDCON packaging (`npm run package`).
 *
 *   1. Runs the production build (`scripts/build.ts`).
 *   2. Verifies prerequisites: a valid 128x128 PNG icon, `README.md`, and
 *      `LICENSE`.
 *   3. Invokes @vscode/vsce non-interactively -> dist/greedcon.vsix.
 *   4. Verifies the .vsix exists and prints its size.
 *
 * vsce flags:
 *   - `--no-dependencies`: esbuild bundles everything and there are no runtime
 *     dependencies, so vsce's npm dependency scan is unnecessary.
 * stdin is ignored so an unexpected prompt aborts instead of hanging CI.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vsixPath = path.join(rootDir, 'dist', 'greedcon.vsix');
const stagingPath = path.join(rootDir, 'dist', `.greedcon-package-${process.pid}.vsix`);
const vsceEntry = path.join(rootDir, 'node_modules', '@vscode', 'vsce', 'vsce');
const iconPath = path.join(rootDir, 'resources', 'icons', 'greedcon.png');

function fail(message: string): never {
  console.error(`[greedcon] package failed: ${message}`);
  process.exit(1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function run(cmd: string, args: string[], label: string): void {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.error) {
    fail(`unable to start ${label} (${result.error.message})`);
  }
  if (result.status !== 0) {
    fail(`${label} exited with code ${result.status ?? 'unknown'}`);
  }
}

function hasValidExtensionIcon(file: string): boolean {
  if (!existsSync(file)) return false;
  const png = readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return (
    png.length >= 24 &&
    png.subarray(0, 8).equals(signature) &&
    png.readUInt32BE(16) >= 128 &&
    png.readUInt32BE(20) >= 128
  );
}

// (a) Build first — packaging must always ship fresh bundles.
console.log('[greedcon] package: building...');
run(process.execPath, [path.join(rootDir, 'scripts', 'build.ts')], 'build');

// (b) Prerequisites.
const prerequisites: Array<{ file: string; reason: string }> = [
  {
    file: 'resources/icons/greedcon.png',
    reason: 'must be a valid PNG of at least 128x128 pixels (required by the `icon` field)',
  },
  { file: 'README.md', reason: 'required by vsce packaging' },
  { file: 'LICENSE', reason: 'required because package.json declares the MIT license' },
];
const missing = prerequisites.filter((p) => !existsSync(path.join(rootDir, p.file)));
if (existsSync(iconPath) && !hasValidExtensionIcon(iconPath)) {
  missing.push(prerequisites[0]);
}
if (missing.length > 0) {
  console.error('[greedcon] package failed: missing prerequisites:');
  for (const p of missing) {
    console.error(`  - ${p.file} — ${p.reason}`);
  }
  console.error(
    'Create or repair the missing file(s) and re-run `npm run package`.',
  );
  process.exit(1);
}

if (!existsSync(vsceEntry)) {
  fail(
    `@vscode/vsce is not installed (${path.relative(rootDir, vsceEntry)} missing) — run npm install.`,
  );
}

// (c) Package non-interactively.
console.log('[greedcon] package: running vsce...');
rmSync(vsixPath, { force: true });
rmSync(stagingPath, { force: true });
run(
  process.execPath,
  [vsceEntry, 'package', '--out', stagingPath, '--no-dependencies'],
  'vsce package',
);

// (d) Verify the artifact.
if (!existsSync(stagingPath)) {
  fail('vsce exited successfully but did not produce the staged VSIX.');
}
renameSync(stagingPath, vsixPath);
const size = statSync(vsixPath);
console.log(`[greedcon] package: created dist/greedcon.vsix (${formatBytes(size.size)})`);
