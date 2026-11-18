/**
 * Unit tests for response parsing — raw socket data becomes a typed model
 * with correct body kind, cookie parsing and truncation.
 */
import { describe, it, expect } from 'vitest';
import { parseResponse, parseSetCookies } from '../../../src/engine/ResponseParser';
import type { RawHttpResponse } from '../../../src/engine/HttpClient';

function raw(partial: Partial<RawHttpResponse>): RawHttpResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    rawHeaders: [],
    body: Buffer.alloc(0),
    responseTimeMs: 12.4,
    truncated: false,
    finalUrl: 'https://api.example.com/',
    redirectCount: 0,
    ...partial,
  };
}

describe('parseResponse', () => {
  it('parses a simple JSON response', () => {
    const result = parseResponse(
      raw({
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: Buffer.from('{"ok":true}'),
      }),
      { requestId: 'req_1' },
    );

    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.body).toBe('{"ok":true}');
    expect(result.bodyKind).toBe('json');
    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.responseSize).toBe(11);
    expect(result.responseTime).toBe(12);
    expect(result.requestId).toBe('req_1');
    expect(result.error).toBeUndefined();
  });

  it('reports an empty body kind for zero-length bodies', () => {
    const result = parseResponse(raw({ body: Buffer.alloc(0) }), { requestId: 'r' });
    expect(result.body).toBe('');
    expect(result.bodyKind).toBe('empty');
    expect(result.responseSize).toBe(0);
  });

  it('fills in a status text fallback for unknown codes', () => {
    const result = parseResponse(raw({ status: 599, statusText: '' }), { requestId: 'r' });
    expect(result.statusText).toBe('');
    const known = parseResponse(raw({ status: 404, statusText: '' }), { requestId: 'r' });
    expect(known.statusText).toBe('Not Found');
  });

  it('base64-encodes binary bodies', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const result = parseResponse(
      raw({ headers: { 'content-type': 'image/png' }, body: bytes }),
      { requestId: 'r' },
    );
    expect(result.bodyKind).toBe('binary');
    expect(result.body).toBe(bytes.toString('base64'));
    expect(result.responseSize).toBe(4);
  });

  it('treats PDFs and archives as binary even without a sniffed type', () => {
    const result = parseResponse(
      raw({ headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF-1.7') }),
      { requestId: 'r' },
    );
    expect(result.bodyKind).toBe('binary');
  });

  it('truncates oversized text bodies and notes it', () => {
    const big = 'x'.repeat(500);
    const result = parseResponse(
      raw({ headers: { 'content-type': 'text/plain' }, body: Buffer.from(big) }),
      { requestId: 'r', maxBodyBytes: 100 },
    );
    expect(result.body.length).toBeLessThan(500);
    expect(result.body).toContain('truncated at 100 bytes');
    expect(result.responseSize).toBe(500);
  });

  it('parses set-cookie headers into cookies', () => {
    const result = parseResponse(
      raw({
        headers: {
          'content-type': 'text/plain',
          'set-cookie': 'session=abc123; Path=/; HttpOnly, theme=dark; Path=/',
        },
      }),
      { requestId: 'r' },
    );
    expect(result.cookies).toHaveLength(2);
    expect(result.cookies[0].name).toBe('session');
    expect(result.cookies[0].value).toBe('abc123');
    expect(result.cookies[1].name).toBe('theme');
  });

  it('represents transport failure with status 0 and an empty body', () => {
    // HttpClient rejects on transport errors; RequestExecutor builds the
    // error model (see tests/integration/requestExecutor.test.ts). A raw
    // response with status 0 must still parse without throwing.
    const result = parseResponse(
      raw({ status: 0, statusText: '' }),
      { requestId: 'r' },
    );
    expect(result.status).toBe(0);
    expect(result.statusText).toBe('');
    expect(result.bodyKind).toBe('empty');
    expect(result.requestId).toBe('r');
  });
});

describe('parseSetCookies', () => {
  it('returns an empty list when absent', () => {
    expect(parseSetCookies(undefined)).toEqual([]);
    expect(parseSetCookies('')).toEqual([]);
  });

  it('parses attributes', () => {
    const cookies = parseSetCookies('token=xyz; Path=/api; Secure; HttpOnly; SameSite=Strict');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({
      name: 'token',
      value: 'xyz',
      path: '/api',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
    });
  });

  it('parses expiry dates', () => {
    const cookies = parseSetCookies('a=b; Expires=Wed, 21 Oct 2026 07:28:00 GMT');
    expect(cookies[0].expires).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
  });

  it('handles a cookie without attributes', () => {
    const cookies = parseSetCookies('plain=value');
    expect(cookies[0]).toMatchObject({ name: 'plain', value: 'value' });
  });

  it('keeps "=" characters inside the value', () => {
    const cookies = parseSetCookies('data=a=b=c; Path=/');
    expect(cookies[0]).toMatchObject({ name: 'data', value: 'a=b=c' });
  });
});
