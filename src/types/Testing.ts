/**
 * Automated testing model types.
 *
 * GREEDCON uses a *declarative* assertion model instead of arbitrary
 * JavaScript execution: assertions are structured data evaluated by the
 * extension host inside `src/testing`. This keeps untrusted test content
 * away from the privileged extension process (see docs/SECURITY.md).
 */

export type AssertionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'matches'
  | 'exists'
  | 'notExists'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte';

export interface StatusAssertion {
  type: 'status';
  operator: 'equals' | 'notEquals' | 'lt' | 'lte' | 'gt' | 'gte';
  value: number;
}

export interface ResponseTimeAssertion {
  type: 'responseTime';
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  /** milliseconds */
  value: number;
}

export interface BodyAssertion {
  type: 'body';
  operator: 'contains' | 'notContains' | 'equals' | 'matches' | 'exists' | 'notExists';
  value: string;
  /** When true the regex/value is matched case-insensitively. */
  caseInsensitive?: boolean;
}

export interface HeaderAssertion {
  type: 'header';
  header: string;
  operator: 'exists' | 'notExists' | 'equals' | 'contains' | 'matches';
  value?: string;
}

export interface JsonPathAssertion {
  type: 'jsonPath';
  path: string;
  operator: AssertionOperator;
  value?: string | number | boolean | null;
}

/** Extract a value from the response into a variable. */
export interface ExtractDefinition {
  type: 'extract';
  name: string;
  source: 'jsonPath' | 'header' | 'status';
  path?: string;
  header?: string;
  /** Where to store the value: environment (active) or collection-local run scope. */
  scope: 'environment';
}

export type AssertionDefinition =
  StatusAssertion | ResponseTimeAssertion | BodyAssertion | HeaderAssertion | JsonPathAssertion;

export interface TestDefinition {
  id: string;
  name: string;
  enabled: boolean;
  assertions: AssertionDefinition[];
  extractions?: ExtractDefinition[];
}

export type AssertionStatus = 'passed' | 'failed' | 'skipped' | 'error';

export interface AssertionResult {
  type: AssertionDefinition['type'];
  description: string;
  status: AssertionStatus;
  message?: string;
  actual?: string;
  expected?: string;
  durationMs?: number;
}

export interface TestResult {
  testId: string;
  name: string;
  status: AssertionStatus;
  assertions: AssertionResult[];
  extractions: Array<{ name: string; status: AssertionStatus; value?: string; message?: string }>;
  durationMs: number;
}

export interface TestRunResult {
  runId: string;
  requestId: string;
  requestName: string;
  timestamp: string;
  responseTime: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface TestRunHistoryEntry extends TestRunResult {
  /** Where the run was triggered from. */
  source: 'manual' | 'request' | 'collection';
}

/** The four example tests from the product spec, expressed declaratively. */
export function exampleTests(): TestDefinition[] {
  return [
    {
      id: 'example-status-200',
      name: 'Status Code is 200',
      enabled: true,
      assertions: [{ type: 'status', operator: 'equals', value: 200 }],
    },
    {
      id: 'example-response-time',
      name: 'Response time < 1000ms',
      enabled: true,
      assertions: [{ type: 'responseTime', operator: 'lt', value: 1000 }],
    },
    {
      id: 'example-body-contains',
      name: 'Response contains "success"',
      enabled: true,
      assertions: [{ type: 'body', operator: 'contains', value: 'success' }],
    },
  ];
}
