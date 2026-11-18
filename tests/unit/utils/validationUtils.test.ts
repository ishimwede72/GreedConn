/**
 * Unit tests for validation helpers (type guards + Validator collector).
 */
import { describe, it, expect } from 'vitest';
import {
  isPlainObject,
  isNonEmptyString,
  isString,
  isBoolean,
  isNumber,
  isStringArray,
  Validator,
  clamp,
} from '../../../src/utils/ValidationUtils';

describe('type guards', () => {
  it('isPlainObject accepts only objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('str')).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('isNonEmptyString enforces length bounds', () => {
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('x'.repeat(11), 10)).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
  });

  it('isString allows empty strings but enforces max length', () => {
    expect(isString('')).toBe(true);
    expect(isString('x'.repeat(11), 10)).toBe(false);
    expect(isString(null)).toBe(false);
  });

  it('isBoolean and isNumber behave as expected', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(0)).toBe(false);
    expect(isNumber(1.5)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isNumber(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('isStringArray checks every element', () => {
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray(['a', 2])).toBe(false);
    expect(isStringArray('a')).toBe(false);
    expect(isStringArray([], 0)).toBe(true);
    expect(isStringArray(['a', 'b'], 1)).toBe(false);
  });
});

describe('Validator', () => {
  it('starts ok with no issues', () => {
    const validator = new Validator();
    expect(validator.ok).toBe(true);
    expect(validator.issues).toHaveLength(0);
    expect(validator.firstError()).toBeNull();
  });

  it('collects issues instead of throwing on check', () => {
    const validator = new Validator();
    expect(validator.check(false, 'url', 'URL is required.')).toBe(false);
    expect(validator.check(true, 'method', 'ok')).toBe(true);
    expect(validator.ok).toBe(false);
    expect(validator.issues).toHaveLength(1);
    expect(validator.firstError()).toBe('url: URL is required.');
  });

  it('throwIfInvalid throws with a formatted message', () => {
    const validator = new Validator();
    validator.check(false, 'a', 'bad a');
    validator.check(false, 'b', 'bad b');
    expect(() => validator.throwIfInvalid('save')).toThrow('save failed — a: bad a; b: bad b');
  });

  it('throwIfInvalid is a no-op when valid', () => {
    const validator = new Validator();
    validator.check(true, 'a', 'fine');
    expect(() => validator.throwIfInvalid('save')).not.toThrow();
  });
});

describe('clamp', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(0, 0, 0)).toBe(0);
  });
});
