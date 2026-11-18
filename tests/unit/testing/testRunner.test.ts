/**
 * Unit tests for TestRunner — executing declarative tests against a response,
 * extraction hooks, run metadata and the TestResult helpers it composes.
 */
import { describe, it, expect } from 'vitest';
import { TestRunner } from '../../../src/testing/TestRunner';
import {
  buildRunResult,
  formatSummary,
  summarizeAssertions,
  testStatus,
} from '../../../src/testing/TestResult';
import { createEmptyRequest } from '../../../src/types/Request';
import type { HttpResponseModel } from '../../../src/types/Response';
import type {
  AssertionResult,
  ExtractDefinition,
  TestDefinition,
  TestResult,
  TestRunResult,
} from '../../../src/types/Testing';

const BODY = JSON.stringify({ user: { id: 7, name: 'Ada' }, ok: true });

function makeResponse(overrides: Partial<HttpResponseModel> = {}): HttpResponseModel {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-42' },
    cookies: [],
    body: BODY,
    bodyKind: 'json',
    responseTime: 150,
    responseSize: BODY.length,
    contentType: 'application/json',
    requestId: 'req-1',
    ...overrides,
  };
}

function makeRequest() {
  return createEmptyRequest('req-1', '2026-01-01T00:00:00.000Z');
}

function extraction(overrides: Partial<ExtractDefinition> = {}): ExtractDefinition {
  return { type: 'extract', name: 'value', source: 'status', scope: 'environment', ...overrides };
}

describe('TestRunner.run — assertion outcomes', () => {
  it('counts passing and failing assertions in the summary', async () => {
    const tests: TestDefinition[] = [
      {
        id: 't1',
        name: 'Status and body',
        enabled: true,
        assertions: [
          { type: 'status', operator: 'equals', value: 200 },
          { type: 'body', operator: 'contains', value: 'nope' },
        ],
      },
      {
        id: 't2',
        name: 'Timing',
        enabled: true,
        assertions: [{ type: 'responseTime', operator: 'lt', value: 1000 }],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest());

    expect(run.summary).toEqual({ total: 3, passed: 2, failed: 1, skipped: 0 });
    expect(run.results).toHaveLength(2);
    expect(run.results[0].status).toBe('failed');
    expect(run.results[1].status).toBe('passed');
  });

  it('captures actual and expected values per assertion', async () => {
    const tests: TestDefinition[] = [
      {
        id: 't1',
        name: 'Detail',
        enabled: true,
        assertions: [
          { type: 'status', operator: 'equals', value: 200 },
          { type: 'body', operator: 'contains', value: 'nope' },
          { type: 'header', header: 'content-type', operator: 'equals', value: 'application/json' },
        ],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest());
    const [statusResult, bodyResult, headerResult] = run.results[0].assertions;

    expect(statusResult).toMatchObject({ status: 'passed', actual: '200', expected: '200' });
    expect(bodyResult.status).toBe('failed');
    expect(bodyResult.actual).toBe(BODY);
    expect(bodyResult.expected).toBe('nope');
    expect(bodyResult.message).toBe('Response body does not contain "nope".');
    expect(headerResult).toMatchObject({
      status: 'passed',
      actual: 'application/json',
      expected: 'application/json',
    });
  });

  it('skips disabled tests with no assertions or extractions', async () => {
    const tests: TestDefinition[] = [
      {
        id: 't-off',
        name: 'Disabled',
        enabled: false,
        assertions: [{ type: 'status', operator: 'equals', value: 500 }],
        extractions: [extraction()],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest());

    expect(run.summary).toEqual({ total: 0, passed: 0, failed: 0, skipped: 0 });
    expect(run.results).toHaveLength(1);
    expect(run.results[0].status).toBe('skipped');
    expect(run.results[0].assertions).toEqual([]);
    expect(run.results[0].extractions).toEqual([]);
    expect(run.results[0].durationMs).toBe(0);
  });
});

describe('TestRunner.run — extractions', () => {
  it('extracts jsonPath/header/status values and notifies the hook', async () => {
    const captured: Array<[string, string]> = [];
    const tests: TestDefinition[] = [
      {
        id: 't1',
        name: 'Extract values',
        enabled: true,
        assertions: [{ type: 'status', operator: 'equals', value: 200 }],
        extractions: [
          extraction({ name: 'userName', source: 'jsonPath', path: '$.user.name' }),
          extraction({ name: 'contentType', source: 'header', header: 'content-type' }),
          extraction({ name: 'statusCode', source: 'status' }),
        ],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest(), {
      onExtract: (name, value) => {
        captured.push([name, value]);
      },
    });

    expect(run.results[0].status).toBe('passed');
    expect(run.results[0].extractions).toEqual([
      { name: 'userName', status: 'passed', value: 'Ada' },
      { name: 'contentType', status: 'passed', value: 'application/json' },
      { name: 'statusCode', status: 'passed', value: '200' },
    ]);
    expect(captured).toEqual([
      ['userName', 'Ada'],
      ['contentType', 'application/json'],
      ['statusCode', '200'],
    ]);
  });

  it('fails extractions for missing paths and headers with messages', async () => {
    const captured: Array<[string, string]> = [];
    const tests: TestDefinition[] = [
      {
        id: 't1',
        name: 'Missing sources',
        enabled: true,
        assertions: [{ type: 'status', operator: 'equals', value: 200 }],
        extractions: [
          extraction({ name: 'gone', source: 'jsonPath', path: '$.does.not.exist' }),
          extraction({ name: 'goneHeader', source: 'header', header: 'x-absent' }),
        ],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest(), {
      onExtract: (name, value) => {
        captured.push([name, value]);
      },
    });

    expect(run.results[0].extractions).toEqual([
      { name: 'gone', status: 'failed', message: 'Path "$.does.not.exist" not found in response.' },
      { name: 'goneHeader', status: 'failed', message: 'Header "x-absent" not present.' },
    ]);
    // The hook is not invoked for failed extractions.
    expect(captured).toEqual([]);
    // A failed extraction makes the whole test fail.
    expect(run.results[0].status).toBe('failed');
    // Extractions are not counted as assertions in the summary.
    expect(run.summary).toEqual({ total: 1, passed: 1, failed: 0, skipped: 0 });
  });

  it('marks an extraction failed when the hook throws', async () => {
    const tests: TestDefinition[] = [
      {
        id: 't1',
        name: 'Hook failure',
        enabled: true,
        assertions: [{ type: 'status', operator: 'equals', value: 200 }],
        extractions: [extraction({ name: 'statusCode', source: 'status' })],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest(), {
      onExtract: () => {
        throw new Error('storage unavailable');
      },
    });

    expect(run.results[0].extractions).toEqual([
      { name: 'statusCode', status: 'failed', message: 'storage unavailable' },
    ]);
    expect(run.results[0].status).toBe('failed');
  });

  it('supports an async hook that rejects', async () => {
    const tests: TestDefinition[] = [
      {
        id: 't1',
        name: 'Async hook failure',
        enabled: true,
        assertions: [{ type: 'status', operator: 'equals', value: 200 }],
        extractions: [extraction({ name: 'statusCode', source: 'status' })],
      },
    ];

    const run = await new TestRunner().run(tests, makeResponse(), makeRequest(), {
      onExtract: async () => {
        await Promise.reject(new Error('async failure'));
      },
    });

    expect(run.results[0].extractions[0]).toEqual({
      name: 'statusCode',
      status: 'failed',
      message: 'async failure',
    });
  });
});

describe('TestRunner.run — run metadata', () => {
  it('populates runId, requestId, requestName and timestamp', async () => {
    const tests: TestDefinition[] = [
      { id: 't1', name: 'One', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
    ];
    const request = { ...makeRequest(), name: 'Get User' };

    const run = await new TestRunner().run(tests, makeResponse(), request);

    expect(run.runId).toMatch(/^run_/);
    expect(run.requestId).toBe('req-1');
    expect(run.requestName).toBe('Get User');
    expect(Number.isNaN(Date.parse(run.timestamp))).toBe(false);
    expect(run.responseTime).toBeGreaterThanOrEqual(0);
    expect(typeof run.responseTime).toBe('number');
  });
});

describe('TestResult helpers', () => {
  const assertion = (status: AssertionResult['status']): AssertionResult => ({
    type: 'status',
    description: 'x',
    status,
  });

  it('summarizeAssertions counts every status separately', () => {
    const summary = summarizeAssertions([
      assertion('passed'),
      assertion('passed'),
      assertion('failed'),
      assertion('error'),
      assertion('skipped'),
    ]);
    expect(summary).toEqual({ total: 5, passed: 2, failed: 1, skipped: 1, errored: 1 });
  });

  it('testStatus prioritizes failed over error over skipped', () => {
    expect(testStatus([], [])).toBe('skipped');
    expect(testStatus([assertion('passed')], [])).toBe('passed');
    expect(testStatus([assertion('passed'), assertion('failed')], [])).toBe('failed');
    expect(testStatus([assertion('passed'), assertion('error')], [])).toBe('error');
    expect(testStatus([assertion('skipped')], [])).toBe('skipped');
    expect(testStatus([], [{ status: 'failed' }])).toBe('failed');
    expect(testStatus([], [{ status: 'passed' }])).toBe('passed');
  });

  it('buildRunResult aggregates counts and folds errors into failed', () => {
    const results: TestResult[] = [
      {
        testId: 't1',
        name: 'A',
        status: 'passed',
        assertions: [assertion('passed'), assertion('error')],
        extractions: [],
        durationMs: 1,
      },
      {
        testId: 't2',
        name: 'B',
        status: 'failed',
        assertions: [assertion('failed'), assertion('skipped')],
        extractions: [],
        durationMs: 1,
      },
    ];

    const run = buildRunResult({
      requestId: 'req-1',
      requestName: 'Req',
      responseTime: 42,
      results,
    });

    expect(run.summary).toEqual({ total: 4, passed: 1, failed: 2, skipped: 1 });
    expect(run.runId).toMatch(/^run_/);
    expect(run.requestId).toBe('req-1');
    expect(run.requestName).toBe('Req');
    expect(run.responseTime).toBe(42);
    expect(Number.isNaN(Date.parse(run.timestamp))).toBe(false);
    expect(run.results).toBe(results);
  });

  it('formatSummary renders pass/fail icons and skipped counts', () => {
    const makeRun = (summary: TestRunResult['summary'], responseTime: number): TestRunResult => ({
      runId: 'run_x',
      requestId: 'req-1',
      requestName: 'Req',
      timestamp: '2026-01-01T00:00:00.000Z',
      responseTime,
      results: [],
      summary,
    });

    expect(formatSummary(makeRun({ total: 2, passed: 2, failed: 0, skipped: 0 }, 5))).toBe(
      '✓ 2/2 assertions passed in 5 ms',
    );
    expect(formatSummary(makeRun({ total: 3, passed: 2, failed: 1, skipped: 0 }, 7))).toBe(
      '✗ 2/3 assertions passed in 7 ms',
    );
    expect(formatSummary(makeRun({ total: 4, passed: 3, failed: 0, skipped: 1 }, 9))).toBe(
      '✓ 3/4 assertions passed (1 skipped) in 9 ms',
    );
    expect(formatSummary(makeRun({ total: 0, passed: 0, failed: 0, skipped: 0 }, 0))).toBe(
      '✗ 0/0 assertions passed in 0 ms',
    );
  });
});
