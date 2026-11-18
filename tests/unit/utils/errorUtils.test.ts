/**
 * Unit tests for error normalization and network-error descriptions.
 * Focus: no secret leakage, stable codes, actionable messages.
 */
import { describe, it, expect } from 'vitest';
import {
  toError,
  normalizeError,
  GreedconError,
  isGreedconError,
  describeNetworkError,
} from '../../../src/utils/ErrorUtils';

describe('toError', () => {
  it('passes through Error instances', () => {
    const original = new Error('boom');
    expect(toError(original)).toBe(original);
  });

  it('wraps strings', () => {
    expect(toError('boom')).toBeInstanceOf(Error);
    expect(toError('boom').message).toBe('boom');
  });

  it('wraps arbitrary values', () => {
    expect(toError(42).message).toBe('42');
  });
});

describe('normalizeError', () => {
  it('keeps an explicit code when present', () => {
    const error = Object.assign(new Error('nope'), { code: 'E_FAIL' });
    expect(normalizeError(error)).toEqual({ code: 'E_FAIL', message: 'nope' });
  });

  it('uses the fallback code otherwise', () => {
    expect(normalizeError(new Error('x'), 'MY_CODE').code).toBe('MY_CODE');
    expect(normalizeError('plain').code).toBe('UNKNOWN');
  });

  it('redacts bearer tokens from the message', () => {
    const result = normalizeError(new Error('Authorization failed for Bearer abcdef123456'));
    expect(result.message).not.toContain('abcdef123456');
    expect(result.message).toContain('«redacted»');
  });
});

describe('GreedconError', () => {
  it('carries a code and optional details', () => {
    const error = new GreedconError('STORAGE', 'disk full', { file: 'x.json' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GreedconError');
    expect(error.code).toBe('STORAGE');
    expect(error.details).toEqual({ file: 'x.json' });
    expect(isGreedconError(error)).toBe(true);
    expect(isGreedconError(new Error('x'))).toBe(false);
  });
});

describe('describeNetworkError', () => {
  const cases: Array<[string, RegExp]> = [
    ['ENOTFOUND', /DNS lookup failed/],
    ['ECONNREFUSED', /Connection refused/],
    ['ECONNRESET', /Connection reset/],
    ['ETIMEDOUT', /timeout/i],
    ['EHOSTUNREACH', /Host unreachable/],
    ['CERT_HAS_EXPIRED', /certificate has expired/i],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', /self-signed/i],
    ['ERR_TLS_CERT_ALTNAME_INVALID', /hostname mismatch/],
    ['ABORT_ERR', /cancelled/i],
  ];

  for (const [code, pattern] of cases) {
    it(`describes ${code} actionably`, () => {
      const result = describeNetworkError(Object.assign(new Error('raw'), { code }));
      expect(result.code).toBe(code);
      expect(result.message).toMatch(pattern);
    });
  }

  it('falls back to the redacted raw message for unknown codes', () => {
    const result = describeNetworkError(
      Object.assign(new Error('Bearer supersecrettoken123 failed'), { code: 'WEIRD' }),
    );
    expect(result.code).toBe('WEIRD');
    expect(result.message).not.toContain('supersecrettoken123');
  });

  it('never throws for exotic input', () => {
    expect(describeNetworkError(null).code).toBe('NETWORK_ERROR');
    expect(describeNetworkError(undefined).code).toBe('NETWORK_ERROR');
    expect(describeNetworkError('oops').code).toBe('NETWORK_ERROR');
  });
});
