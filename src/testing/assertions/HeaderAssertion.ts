/**
 * Response header assertion.
 */
import type { HeaderAssertion, AssertionResult } from '../../types/Testing';
import { operatorLabel, failed, safeRegex, withType } from './shared';

export function evaluateHeader(
  assertion: HeaderAssertion,
  headers: Record<string, string>,
): AssertionResult {
  const name = assertion.header.trim();
  const description = assertion.value
    ? `Header ${name} ${operatorLabel(assertion.operator)} "${assertion.value}"`
    : `Header ${name} ${assertion.operator}`;

  if (!name) {
    return withType({ type: 'header', description: 'Header assertion', status: 'error', message: 'Header name is required.' }, 'header');
  }

  const actual = getHeader(headers, name);

  switch (assertion.operator) {
    case 'exists':
      return withType(
        actual !== undefined
          ? { type: 'header', description, status: 'passed', actual: String(actual) }
          : failed(description, `Header "${name}" is missing.`, undefined, 'present'),
        'header',
      );
    case 'notExists':
      return withType(
        actual === undefined
          ? { type: 'header', description, status: 'passed' }
          : failed(description, `Header "${name}" is present but should be absent.`, String(actual), 'absent'),
        'header',
      );
    case 'equals':
      return withType(
        actual !== undefined && actual === assertion.value
          ? { type: 'header', description, status: 'passed', actual: String(actual), expected: assertion.value ?? '' }
          : failed(
              description,
              `Header "${name}" value does not match.`,
              actual !== undefined ? String(actual) : '(missing)',
              assertion.value ?? '',
            ),
        'header',
      );
    case 'contains':
      return withType(
        actual !== undefined && actual.includes(assertion.value ?? '')
          ? { type: 'header', description, status: 'passed', actual: String(actual) }
          : failed(
              description,
              `Header "${name}" does not contain the expected value.`,
              actual !== undefined ? String(actual) : '(missing)',
              assertion.value ?? '',
            ),
        'header',
      );
    case 'matches': {
      const regex = safeRegex(assertion.value ?? '', 'i');
      if (!regex) {
        return withType(
          { type: 'header', description, status: 'error', message: 'Invalid regular expression.' },
          'header',
        );
      }
      return withType(
        actual !== undefined && regex.test(actual)
          ? { type: 'header', description, status: 'passed', actual: String(actual) }
          : failed(description, `Header "${name}" does not match the pattern.`, actual !== undefined ? String(actual) : '(missing)'),
        'header',
      );
    }
    default:
      return withType(
        { type: 'header', description, status: 'error', message: 'Unsupported operator.' },
        'header',
      );
  }
}

export function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}
