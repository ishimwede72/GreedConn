/**
 * TestService — save tests, run tests and read run history.
 */
import { bridge } from './VsCodeBridge';
import type { HttpRequestModel } from '../../src/types/Request';
import type { TestDefinition, TestRunHistoryEntry, TestRunResult } from '../../src/types/Testing';

export interface RunTestsResult {
  response: unknown;
  warnings: string[];
  testRun?: TestRunResult;
  variableIssues: unknown[];
}

export const TestService = {
  save(requestId: string, tests: TestDefinition[]): Promise<{ tests: TestDefinition[]; warnings: string[] }> {
    return bridge.request('tests.save', { requestId, tests }, 15000);
  },

  run(
    requestId: string,
    request?: HttpRequestModel,
    environmentId?: string,
  ): Promise<RunTestsResult> {
    return bridge.request(
      'tests.run',
      { requestId, ...(request ? { request } : {}), ...(environmentId ? { environmentId } : {}) },
      120000,
    );
  },

  runCollection(
    collectionId: string,
    environmentId?: string,
  ): Promise<{
    runs: TestRunResult[];
    summary: { total: number; passed: number; failed: number };
  }> {
    return bridge.request(
      'tests.runCollection',
      { collectionId, ...(environmentId ? { environmentId } : {}) },
      300000,
    );
  },

  history(limit = 20): Promise<{ runs: TestRunHistoryEntry[] }> {
    return bridge.request('tests.history', { limit });
  },
};
