/**
 * TestContext — data available to a test run plus extraction targets.
 */
import type { HttpResponseModel } from '../types/Response';
import type { HttpRequestModel } from '../types/Request';
import type { ExtractDefinition } from '../types/Testing';

export interface TestContext {
  response: HttpResponseModel;
  request: HttpRequestModel;
  /** Values produced by `extract` definitions, keyed by variable name. */
  extracted: Map<string, string>;
}

export interface ExtractionOutcome {
  definition: ExtractDefinition;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  value?: string;
  message?: string;
}

export function createContext(response: HttpResponseModel, request: HttpRequestModel): TestContext {
  return { response, request, extracted: new Map() };
}
