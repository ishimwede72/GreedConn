/**
 * Response time assertion (milliseconds).
 */
import type { ResponseTimeAssertion, AssertionResult } from '../../types/Testing';
import { compareNumber, operatorLabel, failed, withType } from './shared';

export function evaluateResponseTime(
  assertion: ResponseTimeAssertion,
  responseTimeMs: number,
): AssertionResult {
  const description = `Response time ${operatorLabel(assertion.operator)} ${assertion.value} ms`;
  if (!Number.isFinite(responseTimeMs)) {
    return withType(failed(description, 'Response time is unavailable.', 'n/a', `${assertion.value} ms`), 'responseTime');
  }
  const ok = compareNumber(responseTimeMs, assertion.operator, assertion.value);
  return withType(
    ok
      ? {
          type: 'responseTime',
          description,
          status: 'passed',
          actual: `${Math.round(responseTimeMs)} ms`,
          expected: `${assertion.value} ms`,
        }
      : failed(
          description,
          `Expected ${operatorLabel(assertion.operator)} ${assertion.value} ms but measured ${Math.round(responseTimeMs)} ms.`,
          `${Math.round(responseTimeMs)} ms`,
          `${assertion.value} ms`,
        ),
    'responseTime',
  );
}
