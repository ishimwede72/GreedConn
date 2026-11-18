/**
 * TestReporter — renders run results for the output channel and UI toasts.
 */
import type { TestRunResult, TestResult, AssertionResult } from '../types/Testing';
import { formatSummary } from './TestResult';

export interface RenderedReport {
  text: string;
  passed: number;
  failed: number;
}

export function renderRun(run: TestRunResult): RenderedReport {
  const lines: string[] = [];
  lines.push(`Greedcon test run — ${run.requestName}`);
  lines.push(`Timestamp: ${run.timestamp}`);
  lines.push('');

  for (const test of run.results) {
    lines.push(`${statusIcon(test.status)} ${test.name}`);
    for (const assertion of test.assertions) {
      lines.push(`   ${statusIcon(assertion.status)} ${assertion.description}`);
      if (assertion.message) lines.push(`        ${assertion.message}`);
      if (assertion.status === 'failed' && assertion.actual !== undefined) {
        lines.push(`        actual: ${assertion.actual}`);
      }
    }
    for (const extraction of test.extractions) {
      lines.push(
        `${statusIcon(extraction.status)} ↳ extract ${extraction.name}${extraction.message ? ` (${extraction.message})` : ''}`,
      );
    }
    lines.push('');
  }

  lines.push(formatSummary(run));
  return {
    text: lines.join('\n'),
    passed: run.summary.passed,
    failed: run.summary.failed,
  };
}

export function renderTable(runs: TestRunResult[]): string {
  const lines = ['Run ID       | Time                 | Request            | Passed | Failed | Total'];
  lines.push('-------------|----------------------|--------------------|--------|--------|------');
  for (const run of runs) {
    lines.push(
      [
        run.runId.padEnd(12),
        run.timestamp.padEnd(20),
        run.requestName.slice(0, 18).padEnd(20),
        String(run.summary.passed).padStart(6),
        String(run.summary.failed).padStart(6),
        String(run.summary.total).padStart(6),
      ].join(' | '),
    );
  }
  return lines.join('\n');
}

function statusIcon(status: TestResult['status'] | AssertionResult['status']): string {
  switch (status) {
    case 'passed':
      return '✓';
    case 'failed':
      return '✗';
    case 'error':
      return '⚠';
    default:
      return '○';
  }
}
