/**
 * RequestService — request execution and helper operations.
 */
import { bridge } from './VsCodeBridge';
import type { AuthConfig, HttpRequestModel } from '../../src/types/Request';
import type { HttpResponseModel } from '../../src/types/Response';
import type { TestRunResult } from '../../src/types/Testing';

export interface SendResult {
  response: HttpResponseModel | null;
  authentication: AuthConfig;
  warnings: string[];
  testRun?: TestRunResult;
  variableIssues: Array<{ variable: string; reason: string; location: string }>;
}

export const RequestService = {
  send(request: HttpRequestModel, environmentId?: string): Promise<SendResult> {
    return bridge.request<SendResult>(
      'request.send',
      { request, ...(environmentId ? { environmentId } : {}) },
      // Allow long-running requests (host enforces its own timeout too).
      Math.max(60000, request.timeout + 15000),
    );
  },

  cancel(): Promise<{ cancelled: number }> {
    return bridge.request('request.cancel', {}, 5000);
  },

  formatJson(text: string): Promise<{ text: string; ok: boolean; error?: string }> {
    return bridge.request('request.formatJson', { text }, 10000);
  },

  validateJson(text: string): Promise<{ ok: boolean; error?: string }> {
    return bridge.request('request.validateJson', { text }, 10000);
  },

  saveDraft(request: HttpRequestModel): Promise<{ saved: boolean }> {
    return bridge.request('app.saveDraft', { request }, 10000);
  },
};
