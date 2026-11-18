/**
 * Status code assertion.
 */
import type { StatusAssertion, AssertionResult } from '../../types/Testing';
import { compareNumber, operatorLabel, failed, withType } from './shared';

export function evaluateStatus(assertion: StatusAssertion, statusCode: number): AssertionResult {
  const description = `Status code ${operatorLabel(assertion.operator)} ${assertion.value}`;
  if (!Number.isFinite(statusCode) || statusCode === 0) {
    return withType(
      failed(description, 'No HTTP status was received (transport error).', String(statusCode), String(assertion.value)),
      'status',
    );
  }
  const ok = compareNumber(statusCode, assertion.operator, assertion.value);
  return withType(
    ok
      ? { type: 'status', description, status: 'passed', actual: String(statusCode), expected: String(assertion.value) }
      : failed(
          description,
          `Expected status ${operatorLabel(assertion.operator)} ${assertion.value} but received ${statusCode}.`,
          String(statusCode),
          String(assertion.value),
        ),
    'status',
  );
}
