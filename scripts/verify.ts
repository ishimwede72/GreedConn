/**
 * GREEDCON verification gate (`npm run verify`).
 *
 * Runs the full pipeline sequentially, stops at the first failure, prints a
 * PASS/FAIL checklist with per-step timings, and exits non-zero on failure:
 *
 *   1. typecheck (tsconfig.json)       4. tests (vitest run)
 *   2. typecheck (tsconfig.webview)    5. build (scripts/build.ts)
 *   3. lint (eslint .)                 6. package (scripts/package.ts -> vsix)
 *
 * Tools are resolved from node_modules via `npx` (no network). stdin is
 * ignored so no step can ever prompt and hang a CI run; stdout/stderr are
 * inherited so output streams live.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface VerifyStep {
  readonly name: string;
  readonly cmd: string;
  readonly args: readonly string[];
}

interface VerifyResult {
  readonly step: VerifyStep;
  readonly ok: boolean;
  readonly ms: number;
}

const steps: readonly VerifyStep[] = [
  {
    name: 'typecheck (src/tests/scripts)',
    cmd: 'npx',
    args: ['tsc', '-p', 'tsconfig.json', '--noEmit'],
  },
  {
    name: 'typecheck (webview)',
    cmd: 'npx',
    args: ['tsc', '-p', 'tsconfig.webview.json', '--noEmit'],
  },
  { name: 'lint', cmd: 'npx', args: ['eslint', '.'] },
  { name: 'tests', cmd: 'npx', args: ['vitest', 'run'] },
  { name: 'build', cmd: process.execPath, args: [path.join(rootDir, 'scripts', 'build.ts')] },
  { name: 'package', cmd: process.execPath, args: [path.join(rootDir, 'scripts', 'package.ts')] },
];

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

console.log(`[greedcon] verify: running ${steps.length} steps (stops at first failure)...`);

const results: VerifyResult[] = [];
let failed = false;

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  if (failed) {
    break;
  }
  console.log(`\n[greedcon] verify step ${i + 1}/${steps.length}: ${step.name}`);
  const start = Date.now();
  const result = spawnSync(step.cmd, [...step.args], {
    cwd: rootDir,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const ms = Date.now() - start;

  if (result.error) {
    console.error(`[greedcon] verify: failed to spawn "${step.cmd}" — ${result.error.message}`);
    results.push({ step, ok: false, ms });
    failed = true;
    break;
  }
  const ok = result.status === 0;
  results.push({ step, ok, ms });
  if (!ok) {
    console.error(
      `[greedcon] verify: step "${step.name}" failed with exit code ${result.status ?? 'unknown'}`,
    );
    failed = true;
  }
}

console.log('\n[greedcon] verify checklist:');
for (const result of results) {
  console.log(
    `  ${result.ok ? 'PASS' : 'FAIL'}  ${result.step.name} (${formatSeconds(result.ms)})`,
  );
}
for (const step of steps.slice(results.length)) {
  console.log(`  SKIP  ${step.name} (not run — earlier step failed)`);
}

if (failed) {
  console.error('[greedcon] verify: FAILED');
  process.exit(1);
}
console.log('[greedcon] verify: ALL PASSED');
