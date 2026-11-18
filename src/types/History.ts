/**
 * Request history model types.
 */

import type { HttpMethod } from './Request';

export interface HistoryEntry {
  id: string;
  /** Name of the request at the time of execution. */
  name: string;
  method: HttpMethod;
  url: string;
  /** Final URL after redirects, when different from `url`. */
  finalUrl?: string;
  status?: number;
  statusText?: string;
  responseTime?: number;
  responseSize?: number;
  contentType?: string;
  /** Protocol error summary (never contains credentials). */
  error?: { code: string; message: string };
  /** Response body snapshot (size-capped, sensitive headers never stored). */
  body?: string;
  bodyKind?: string;
  headers?: Record<string, string>;
  timestamp: string;
  /** Test summary produced by the run, when tests were defined. */
  testSummary?: { total: number; passed: number; failed: number };
  /** Where the request came from, if it was saved. */
  source?: { collectionId?: string; itemId?: string };
  environmentId?: string;
  environmentName?: string;
  /** True when the user aborted the request. */
  cancelled?: boolean;
}

export interface HistoryFilter {
  search?: string;
  method?: HttpMethod | 'ALL';
  statusGroup?: 'success' | 'redirect' | 'clientError' | 'serverError' | 'error' | 'ALL';
  collectionId?: string;
  from?: string;
  to?: string;
  limit?: number;
}
