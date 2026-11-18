/**
 * Unit tests for header sanitization — the anti request-smuggling layer.
 * Every header must be validated before it reaches the socket.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeHeaderName,
  sanitizeHeaderValue,
  sanitizeHeaders,
  isSensitiveHeader,
  redactHeaderValue,
} from '../../../src/security/HeaderSanitizer';

describe('sanitizeHeaderName', () => {
  it('accepts valid token characters', () => {
    const result = sanitizeHeaderName('Content-Type');
    expect(result.ok).toBe(true);
    expect(result.name).toBe('Content-Type');
    expect(sanitizeHeaderName('X-Custom_Header.1').ok).toBe(true);
    expect(sanitizeHeaderName('x-api-key').ok).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeHeaderName('  Accept  ').name).toBe('Accept');
  });

  it('rejects empty and non-string names', () => {
    expect(sanitizeHeaderName('').ok).toBe(false);
    expect(sanitizeHeaderName('   ').ok).toBe(false);
    expect(sanitizeHeaderName(null).ok).toBe(false);
    expect(sanitizeHeaderName(42).ok).toBe(false);
  });

  it('rejects CR/LF/NUL (header injection)', () => {
    expect(sanitizeHeaderName('X-Test\r\nX-Evil: 1').ok).toBe(false);
    expect(sanitizeHeaderName('X-Test\rX-Other').ok).toBe(false);
    expect(sanitizeHeaderName('X-Test\nX-Other').ok).toBe(false);
    expect(sanitizeHeaderName('X-Test\0').ok).toBe(false);
    expect(sanitizeHeaderName('X-Test\r\nX-Evil: 1').reason).toMatch(/control characters/);
  });

  it('trims leading/trailing CR so only interior injection is rejected', () => {
    // `trim()` removes surrounding line terminators, leaving a safe name.
    expect(sanitizeHeaderName('X-Test\r')).toEqual({ ok: true, name: 'X-Test' });
    expect(sanitizeHeaderName('\nX-Test\n')).toEqual({ ok: true, name: 'X-Test' });
  });

  it('rejects invalid token characters', () => {
    expect(sanitizeHeaderName('X Test').ok).toBe(false);
    expect(sanitizeHeaderName('X:Test').ok).toBe(false);
    expect(sanitizeHeaderName('X/Test').ok).toBe(false);
    expect(sanitizeHeaderName('Ünïcode').ok).toBe(false);
  });

  it('rejects over-long names', () => {
    expect(sanitizeHeaderName('X'.repeat(257)).ok).toBe(false);
    expect(sanitizeHeaderName('X'.repeat(256)).ok).toBe(true);
  });

  it('blocks hop-by-hop and client-managed headers', () => {
    for (const name of ['Host', 'Content-Length', 'Transfer-Encoding', 'Connection', 'Upgrade']) {
      const result = sanitizeHeaderName(name);
      expect(result.ok, name).toBe(false);
      expect(result.reason, name).toMatch(/managed by the HTTP client/);
    }
  });
});

describe('sanitizeHeaderValue', () => {
  it('accepts normal values including unicode', () => {
    const result = sanitizeHeaderValue('Bearer abc.def-123');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('Bearer abc.def-123');
    expect(sanitizeHeaderValue('héllo wörld').ok).toBe(true);
  });

  it('allows empty values (valid for some headers)', () => {
    expect(sanitizeHeaderValue('')).toEqual({ ok: true, value: '' });
  });

  it('rejects CR/LF/NUL (response splitting / injection)', () => {
    expect(sanitizeHeaderValue('value\r\nX-Injected: true').ok).toBe(false);
    expect(sanitizeHeaderValue('value\r').ok).toBe(false);
    expect(sanitizeHeaderValue('value\n').ok).toBe(false);
    expect(sanitizeHeaderValue('value\0').ok).toBe(false);
    expect(sanitizeHeaderValue('value\r\nX-Injected: true').reason).toMatch(/CR\/LF/);
  });

  it('rejects non-strings and over-long values', () => {
    expect(sanitizeHeaderValue(null).ok).toBe(false);
    expect(sanitizeHeaderValue(123).ok).toBe(false);
    expect(sanitizeHeaderValue('x'.repeat(16_385)).ok).toBe(false);
    expect(sanitizeHeaderValue('x'.repeat(16_384)).ok).toBe(true);
  });
});

describe('sanitizeHeaders', () => {
  it('separates valid headers from rejections', () => {
    const result = sanitizeHeaders({
      Accept: 'application/json',
      'X-Bad': 'ok\r\nInjected: 1',
      'Bad Name': 'value',
      'Content-Length': '10',
    });

    expect(result.headers).toHaveLength(1);
    expect(result.headers[0]).toEqual({ name: 'Accept', value: 'application/json' });

    expect(result.rejected).toHaveLength(3);
    const reasons = result.rejected.map((r) => r.reason).join(' | ');
    expect(reasons).toMatch(/control characters/);
    expect(reasons).toMatch(/not a valid HTTP header name/);
    expect(reasons).toMatch(/managed by the HTTP client/);
  });

  it('returns an empty result for no headers', () => {
    expect(sanitizeHeaders({})).toEqual({ headers: [], rejected: [] });
  });

  it('keeps all valid headers when everything is fine', () => {
    const result = sanitizeHeaders({ 'X-A': '1', 'X-B': 'two' });
    expect(result.headers).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });
});

describe('header redaction', () => {
  it('recognizes sensitive header names case-insensitively', () => {
    expect(isSensitiveHeader('Authorization')).toBe(true);
    expect(isSensitiveHeader('authorization')).toBe(true);
    expect(isSensitiveHeader('X-Api-Key')).toBe(true);
    expect(isSensitiveHeader('Cookie')).toBe(true);
    expect(isSensitiveHeader('Set-Cookie')).toBe(true);
    expect(isSensitiveHeader('Content-Type')).toBe(false);
    expect(isSensitiveHeader('X-Request-Id')).toBe(false);
  });

  it('masks sensitive values and keeps others', () => {
    expect(redactHeaderValue('Authorization', 'Bearer secret')).toBe('••••••••');
    expect(redactHeaderValue('content-type', 'application/json')).toBe('application/json');
  });
});
