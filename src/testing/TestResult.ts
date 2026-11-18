/**
 * TestResult helpers: summarizing and aggregating results.
 */
import type {
  AssertionResult,
  TestResult,
  TestRunResult,
  AssertionStatus,
} from '../types/Testing';
import { generateRunId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';

export function summarizeAssertions(results: AssertionResult[]): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errored = 0;
  for (const result of results) {
    switch (result.status) {
      case 'passed':
        passed += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'error':
        errored += 1;
        break;
      default:
        break;
    }
  }
  return { total: results.length, passed, failed, skipped, errored };
}

/** Overall status for a single test: failed > error > skipped > passed. */
export function testStatus(assertions: AssertionResult[], extractions: Array<{ status: AssertionStatus }>): AssertionStatus {
  const statuses = [...assertions.map((a) => a.status), ...extractions.map((e) => e.status)];
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('error')) return 'error';
  if (statuses.length === 0 || statuses.every((s) => s === 'skipped')) return 'skipped';
  if (statuses.includes('passed')) return 'passed';
  return 'skipped';
}

export function buildRunResult(input: {
  requestId: string;
  requestName: string;
  responseTime: number;
  results: TestResult[];
}): TestRunResult {
  const allAssertions = input.results.flatMap((r) => r.assertions);
  const summary = summarizeAssertions(allAssertions);
  return {
    runId: generateRunId(),
    requestId: input.requestId,
    requestName: input.requestName,
    timestamp: nowIso(),
    responseTime: input.responseTime,
    results: input.results,
    summary: {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed + summary.errored,
      skipped: summary.skipped,
    },
  };
}

export function formatSummary(run: TestRunResult): string {
  const { total, passed, failed, skipped } = run.summary;
  const icon = failed === 0 && passed > 0 ? '✓' : '✗';
  return `${icon} ${passed}/${total} assertions passed${skipped > 0 ? ` (${skipped} skipped)` : ''} in ${run.responseTime} ms`;
}
