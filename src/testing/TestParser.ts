/**
 * TestParser — validation and normalization of declarative test definitions.
 *
 * Tests arrive from the webview (structured UI), from imported collections and
 * from persisted storage; all three paths pass through here so malformed
 * definitions are dropped with warnings instead of crashing a run.
 */
import type {
  AssertionDefinition,
  TestDefinition,
  ExtractDefinition,
  AssertionOperator,
} from '../types/Testing';
import { isPlainObject, isString, isBoolean, isNumber } from '../utils/ValidationUtils';
import { generateTestId } from '../utils/IdGenerator';

export interface ParseResult {
  tests: TestDefinition[];
  warnings: string[];
}

const ASSERTION_OPERATORS: AssertionOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'matches',
  'exists',
  'notExists',
  'lt',
  'lte',
  'gt',
  'gte',
];

export function parseTests(raw: unknown): ParseResult {
  const warnings: string[] = [];
  if (!Array.isArray(raw)) {
    if (raw === undefined || raw === null) return { tests: [], warnings };
    warnings.push('Tests payload must be an array.');
    return { tests: [], warnings };
  }

  const tests: TestDefinition[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isPlainObject(entry)) {
      warnings.push(`Test at index ${index} is not an object; skipped.`);
      continue;
    }
    const assertions: AssertionDefinition[] = [];
    const assertionList = Array.isArray(entry['assertions']) ? entry['assertions'] : [];
    for (const [aIndex, assertionRaw] of assertionList.entries()) {
      const parsed = parseAssertion(assertionRaw);
      if (parsed) assertions.push(parsed);
      else warnings.push(`Test "${String(entry['name'] ?? index)}": assertion ${aIndex} is invalid; skipped.`);
    }

    const extractions: ExtractDefinition[] = [];
    if (Array.isArray(entry['extractions'])) {
      for (const extractionRaw of entry['extractions']) {
        const parsed = parseExtraction(extractionRaw);
        if (parsed) extractions.push(parsed);
        else warnings.push(`Test "${String(entry['name'] ?? index)}": invalid extraction; skipped.`);
      }
    }

    if (assertions.length === 0 && extractions.length === 0) {
      warnings.push(`Test "${String(entry['name'] ?? index)}" has no valid assertions; skipped.`);
      continue;
    }

    tests.push({
      id: isString(entry['id'], 200) && entry['id'] ? entry['id'] : generateTestId(),
      name: isString(entry['name'], 300) ? entry['name'] : `Test ${index + 1}`,
      enabled: isBoolean(entry['enabled']) ? entry['enabled'] : true,
      assertions,
      ...(extractions.length > 0 ? { extractions } : {}),
    });
  }

  return { tests, warnings };
}

function parseAssertion(raw: unknown): AssertionDefinition | null {
  if (!isPlainObject(raw)) return null;
  const type = raw['type'];
  const operator = raw['operator'];

  switch (type) {
    case 'status':
      if (operator !== 'equals' && operator !== 'notEquals' && operator !== 'lt' && operator !== 'lte' && operator !== 'gt' && operator !== 'gte') {
        return null;
      }
      if (!isNumber(raw['value'])) return null;
      return { type: 'status', operator, value: raw['value'] };

    case 'responseTime':
      if (operator !== 'lt' && operator !== 'lte' && operator !== 'gt' && operator !== 'gte') return null;
      if (!isNumber(raw['value'])) return null;
      return { type: 'responseTime', operator, value: raw['value'] };

    case 'body': {
      if (!isOperator(operator, ['contains', 'notContains', 'equals', 'matches', 'exists', 'notExists'])) return null;
      const bodyOperator = operator as 'contains' | 'notContains' | 'equals' | 'matches' | 'exists' | 'notExists';
      const bodyValue = bodyOperator === 'exists' || bodyOperator === 'notExists' ? '' : raw['value'];
      if (!isString(bodyValue, 100_000)) return null;
      return {
        type: 'body',
        operator: bodyOperator,
        value: bodyValue,
        ...(isBoolean(raw['caseInsensitive']) ? { caseInsensitive: raw['caseInsensitive'] } : {}),
      };
    }

    case 'header': {
      if (!isString(raw['header'], 256) || !raw['header']) return null;
      if (!isOperator(operator, ['exists', 'notExists', 'equals', 'contains', 'matches'])) return null;
      const headerOperator = operator as 'exists' | 'notExists' | 'equals' | 'contains' | 'matches';
      if (headerOperator !== 'exists' && headerOperator !== 'notExists' && !isString(raw['value'], 10_000)) return null;
      return {
        type: 'header',
        header: raw['header'],
        operator: headerOperator,
        ...(isString(raw['value'], 10_000) ? { value: raw['value'] } : {}),
      };
    }

    case 'jsonPath':
      if (!isString(raw['path'], 500) || !raw['path']) return null;
      if (!isOperator(operator, ASSERTION_OPERATORS)) return null;
      if (operator !== 'exists' && operator !== 'notExists' && raw['value'] === undefined) return null;
      return {
        type: 'jsonPath',
        path: raw['path'],
        operator,
        ...(raw['value'] !== undefined &&
        (isString(raw['value'], 10_000) || isNumber(raw['value']) || isBoolean(raw['value']) || raw['value'] === null)
          ? { value: raw['value'] as string | number | boolean | null }
          : {}),
      };

    default:
      return null;
  }
}

function parseExtraction(raw: unknown): ExtractDefinition | null {
  if (!isPlainObject(raw)) return null;
  if (!isString(raw['name'], 256) || !raw['name']) return null;
  const source = raw['source'];
  if (source === 'status') {
    return { type: 'extract', name: raw['name'], source: 'status', scope: 'environment' };
  }
  if (source === 'jsonPath') {
    if (!isString(raw['path'], 500) || !raw['path']) return null;
    return { type: 'extract', name: raw['name'], source: 'jsonPath', path: raw['path'], scope: 'environment' };
  }
  if (source === 'header') {
    if (!isString(raw['header'], 256) || !raw['header']) return null;
    return { type: 'extract', name: raw['name'], source: 'header', header: raw['header'], scope: 'environment' };
  }
  return null;
}

function isOperator(value: unknown, allowed: readonly string[]): value is AssertionOperator {
  return typeof value === 'string' && allowed.includes(value);
}

/** Serialize tests for persistence/export. */
export function serializeTests(tests: TestDefinition[]): string {
  return JSON.stringify(tests, null, 2);
}
