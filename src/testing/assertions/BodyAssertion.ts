/**
 * Response body assertion: contains / equals / matches / exists.
 */
import type { BodyAssertion, AssertionResult } from '../../types/Testing';
import { operatorLabel, failed, safeRegex, withType } from './shared';

export function evaluateBody(assertion: BodyAssertion, body: string): AssertionResult {
  const description = `Body ${operatorLabel(assertion.operator)} "${truncate(assertion.value)}"`;
  const haystack = assertion.caseInsensitive ? body.toLowerCase() : body;
  const needle = assertion.caseInsensitive ? assertion.value.toLowerCase() : assertion.value;

  switch (assertion.operator) {
    case 'contains': {
      const ok = haystack.includes(needle);
      return withType(
        ok
          ? { type: 'body', description, status: 'passed' }
          : failed(description, `Response body does not contain "${truncate(assertion.value)}".`, truncate(body), truncate(assertion.value)),
        'body',
      );
    }
    case 'notContains': {
      const ok = !haystack.includes(needle);
      return withType(
        ok
          ? { type: 'body', description, status: 'passed' }
          : failed(description, `Response body unexpectedly contains "${truncate(assertion.value)}".`, truncate(body), truncate(assertion.value)),
        'body',
      );
    }
    case 'equals': {
      const ok = body === assertion.value;
      return withType(
        ok
          ? { type: 'body', description, status: 'passed' }
          : failed(description, 'Response body does not exactly match the expected value.', truncate(body), truncate(assertion.value)),
        'body',
      );
    }
    case 'matches': {
      const regex = safeRegex(assertion.value, assertion.caseInsensitive ? 'i' : '');
      if (!regex) {
        return withType(
          { type: 'body', description, status: 'error', message: 'Invalid or too complex regular expression.' },
          'body',
        );
      }
      const ok = regex.test(body);
      return withType(
        ok
          ? { type: 'body', description, status: 'passed' }
          : failed(description, `Response body does not match /${truncate(assertion.value)}/.`, truncate(body)),
        'body',
      );
    }
    case 'exists': {
      const ok = body.length > 0;
      return withType(
        ok ? { type: 'body', description, status: 'passed' } : failed(description, 'Response body is empty.'),
        'body',
      );
    }
    case 'notExists': {
      const ok = body.length === 0;
      return withType(
        ok ? { type: 'body', description, status: 'passed' } : failed(description, 'Response body is not empty.', truncate(body)),
        'body',
      );
    }
    default:
      return withType(
        { type: 'body', description, status: 'error', message: `Unsupported operator.` },
        'body',
      );
  }
}

function truncate(value: string, max = 200): string {
  if (typeof value !== 'string') return String(value);
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
