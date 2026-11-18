/**
 * JSON path assertion: evaluates `$.a.b[0].c` style paths against a parsed
 * response body and compares the extracted value.
 */
import type { JsonPathAssertion, AssertionResult } from '../../types/Testing';
import { getJsonPath, parseJson } from '../../utils/JsonUtils';
import { operatorLabel, failed, safeRegex, withType } from './shared';

export function evaluateJsonPath(
  assertion: JsonPathAssertion,
  body: string,
): AssertionResult {
  const description = `JSON path ${assertion.path} ${operatorLabel(assertion.operator)} ${
    assertion.value !== undefined ? formatValue(assertion.value) : ''
  }`.trim();

  const parsed = parseJson(body);
  if (!parsed.ok || parsed.value === undefined) {
    return withType(
      { type: 'jsonPath', description, status: 'error', message: `Response body is not valid JSON: ${parsed.error ?? 'parse error'}` },
      'jsonPath',
    );
  }

  const located = getJsonPath(parsed.value, assertion.path);
  const actual = located.found ? formatValue(located.value) : '(not found)';

  switch (assertion.operator) {
    case 'exists':
      return withType(
        located.found
          ? { type: 'jsonPath', description, status: 'passed', actual }
          : failed(description, `Path "${assertion.path}" was not found.`, actual, 'present'),
        'jsonPath',
      );
    case 'notExists':
      return withType(
        !located.found
          ? { type: 'jsonPath', description, status: 'passed' }
          : failed(description, `Path "${assertion.path}" exists but should not.`, actual, 'absent'),
        'jsonPath',
      );
    case 'equals':
      return withType(
        located.found && looseEquals(located.value, assertion.value)
          ? { type: 'jsonPath', description, status: 'passed', actual, expected: formatValue(assertion.value) }
          : failed(
              description,
              `Value at "${assertion.path}" does not equal the expected value.`,
              actual,
              formatValue(assertion.value),
            ),
        'jsonPath',
      );
    case 'notEquals':
      return withType(
        located.found && !looseEquals(located.value, assertion.value)
          ? { type: 'jsonPath', description, status: 'passed', actual }
          : failed(description, `Value at "${assertion.path}" equals the excluded value.`, actual, formatValue(assertion.value)),
        'jsonPath',
      );
    case 'contains': {
      const ok =
        located.found &&
        (typeof located.value === 'string'
          ? located.value.includes(String(assertion.value))
          : Array.isArray(located.value)
            ? located.value.some((item) => looseEquals(item, assertion.value))
            : String(located.value).includes(String(assertion.value)));
      return withType(
        ok
          ? { type: 'jsonPath', description, status: 'passed', actual }
          : failed(description, `Value at "${assertion.path}" does not contain the expected content.`, actual, formatValue(assertion.value)),
        'jsonPath',
      );
    }
    case 'matches': {
      const regex = safeRegex(String(assertion.value ?? ''), 'i');
      if (!regex) {
        return withType(
          { type: 'jsonPath', description, status: 'error', message: 'Invalid regular expression.' },
          'jsonPath',
        );
      }
      return withType(
        located.found && regex.test(String(located.value))
          ? { type: 'jsonPath', description, status: 'passed', actual }
          : failed(description, `Value at "${assertion.path}" does not match the pattern.`, actual, String(assertion.value ?? '')),
        'jsonPath',
      );
    }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const actualNumber = Number(located.value);
      const expectedNumber = Number(assertion.value);
      if (!located.found || !Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
        return withType(
          { type: 'jsonPath', description, status: 'error', message: 'Numeric comparison requires numeric values.' },
          'jsonPath',
        );
      }
      const ok =
        assertion.operator === 'lt'
          ? actualNumber < expectedNumber
          : assertion.operator === 'lte'
            ? actualNumber <= expectedNumber
            : assertion.operator === 'gt'
              ? actualNumber > expectedNumber
              : actualNumber >= expectedNumber;
      return withType(
        ok
          ? { type: 'jsonPath', description, status: 'passed', actual, expected: String(expectedNumber) }
          : failed(description, `Numeric comparison failed at "${assertion.path}".`, actual, String(expectedNumber)),
        'jsonPath',
      );
    }
    default:
      return withType(
        { type: 'jsonPath', description, status: 'error', message: 'Unsupported operator.' },
        'jsonPath',
      );
  }
}

/** Extract a value (used by the `extract` feature). */
export function extractJsonPath(body: string, path: string): { found: boolean; value?: string } {
  const parsed = parseJson(body);
  if (!parsed.ok || parsed.value === undefined) return { found: false };
  const located = getJsonPath(parsed.value, path);
  if (!located.found) return { found: false };
  if (located.value === null || located.value === undefined) return { found: true, value: '' };
  if (typeof located.value === 'object') return { found: true, value: JSON.stringify(located.value) };
  return { found: true, value: String(located.value) };
}

function looseEquals(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (expected === undefined || expected === null) return actual === expected;
  if (typeof actual === 'number' || typeof expected === 'number') {
    return Number(actual) === Number(expected);
  }
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    return String(actual) === String(expected);
  }
  return String(actual) === String(expected);
}

function formatValue(value: unknown): string {
  if (value === undefined) return '(undefined)';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
