/**
 * Assertion evaluation primitives shared by all assertion types.
 */
import type { AssertionResult, AssertionStatus } from '../../types/Testing';

export function passed(description: string, actual?: string, expected?: string): AssertionResult {
  return { type: 'status', description, status: 'passed', ...(actual !== undefined ? { actual } : {}), ...(expected !== undefined ? { expected } : {}) };
}

export function failed(description: string, message: string, actual?: string, expected?: string): AssertionResult {
  return {
    type: 'status',
    description,
    status: 'failed',
    message,
    ...(actual !== undefined ? { actual } : {}),
    ...(expected !== undefined ? { expected } : {}),
  };
}

export function errored(description: string, message: string): AssertionResult {
  return { type: 'status', description, status: 'error', message };
}

export function skipped(description: string): AssertionResult {
  return { type: 'status', description, status: 'skipped' };
}

export function withType(result: AssertionResult, type: AssertionResult['type']): AssertionResult {
  return { ...result, type };
}

/** Numeric comparison used by status/time assertions. */
export function compareNumber(
  actual: number,
  operator: 'equals' | 'notEquals' | 'lt' | 'lte' | 'gt' | 'gte',
  expected: number,
): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'notEquals':
      return actual !== expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    default:
      return false;
  }
}

export function operatorLabel(operator: string): string {
  switch (operator) {
    case 'equals':
      return '==';
    case 'notEquals':
      return '!=';
    case 'contains':
      return 'contains';
    case 'notContains':
      return 'does not contain';
    case 'matches':
      return 'matches';
    case 'exists':
      return 'exists';
    case 'notExists':
      return 'does not exist';
    case 'lt':
      return '<';
    case 'lte':
      return '<=';
    case 'gt':
      return '>';
    case 'gte':
      return '>=';
    default:
      return operator;
  }
}

/** Safely run a user-provided regular expression (bounded length, no flags injection). */
export function safeRegex(pattern: string, flags = ''): RegExp | null {
  if (pattern.length > 1000) return null;
  const safeFlags = flags.replace(/[^ims]/g, '');
  try {
    return new RegExp(pattern, safeFlags);
  } catch {
    return null;
  }
}

export function statusCategory(status: AssertionStatus): string {
  return status;
}
