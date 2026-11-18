/**
 * Unit tests for header building — case-insensitive overwrite, rejection
 * reporting and default headers.
 */
import { describe, it, expect } from 'vitest';
import {
  buildHeaders,
  getHeader,
  headersToRows,
  DEFAULT_USER_AGENT,
} from '../../../src/engine/HeaderManager';
import type { KeyValueRow } from '../../../src/types/Request';

let counter = 0;
function row(key: string, value: string, enabled = true): KeyValueRow {
  counter += 1;
  return { id: `h${counter}`, key, value, enabled };
}

describe('buildHeaders', () => {
  it('adds default user-agent and accept headers', () => {
    const result = buildHeaders({ rows: [] });
    expect(result.headers['user-agent']).toBe(DEFAULT_USER_AGENT);
    expect(result.headers['accept']).toBe('*/*');
    expect(result.rejected).toEqual([]);
  });

  it('can omit the user-agent', () => {
    const result = buildHeaders({ rows: [], removeUserAgent: true });
    expect(result.headers['user-agent']).toBeUndefined();
  });

  it('lower-cases header names for consistent casing', () => {
    const result = buildHeaders({ rows: [row('Content-Type', 'application/json')] });
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('applies rows in order with last-write-wins regardless of case', () => {
    const result = buildHeaders({
      rows: [row('X-Value', 'first'), row('x-value', 'second')],
    });
    expect(Object.keys(result.headers).filter((k) => k.toLowerCase() === 'x-value')).toHaveLength(1);
    expect(getHeader(result.headers, 'X-Value')).toBe('second');
  });

  it('skips disabled rows and blank keys', () => {
    const result = buildHeaders({
      rows: [row('X-Keep', 'yes'), row('X-Skip', 'no', false), row('   ', 'blank')],
    });
    expect(result.headers['x-keep']).toBe('yes');
    expect(result.headers['x-skip']).toBeUndefined();
  });

  it('reports rejected headers instead of silently dropping them', () => {
    const result = buildHeaders({
      rows: [row('X-Good', 'ok'), row('Bad Header', 'x'), row('X-Inject', 'a\r\nb')],
    });
    expect(result.headers['x-good']).toBe('ok');
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].name).toBe('Bad Header');
    expect(result.rejected[1].name).toBe('X-Inject');
    expect(result.rejected[1].reason).toMatch(/control characters/);
  });

  it('blocks client-managed headers', () => {
    const result = buildHeaders({ rows: [row('Content-Length', '999')] });
    expect(result.headers['content-length']).toBeUndefined();
    expect(result.rejected[0].reason).toMatch(/managed by the HTTP client/);
  });

  it('sets an explicit content type when provided', () => {
    const result = buildHeaders({ rows: [], contentType: 'application/json; charset=utf-8' });
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('merges extra headers through the same validation', () => {
    const result = buildHeaders({
      rows: [],
      extra: { 'X-Extra': 'value', 'X-Bad': 'a\nb' },
    });
    expect(result.headers['x-extra']).toBe('value');
    expect(result.rejected).toHaveLength(1);
  });

  it('lets extra headers override row headers case-insensitively', () => {
    const result = buildHeaders({
      rows: [row('X-Value', 'row')],
      extra: { 'x-value': 'extra' },
    });
    expect(getHeader(result.headers, 'X-Value')).toBe('extra');
  });
});

describe('getHeader', () => {
  const headers = { 'content-type': 'application/json', 'X-Request-Id': 'abc' };

  it('looks up headers case-insensitively', () => {
    expect(getHeader(headers, 'Content-Type')).toBe('application/json');
    expect(getHeader(headers, 'content-TYPE')).toBe('application/json');
    expect(getHeader(headers, 'x-request-id')).toBe('abc');
  });

  it('returns undefined for missing headers', () => {
    expect(getHeader(headers, 'nope')).toBeUndefined();
  });
});

describe('headersToRows', () => {
  it('converts a header map into editor rows', () => {
    const rows = headersToRows({ 'X-A': '1', 'content-type': 'application/json' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: 'X-A', value: '1', enabled: true });
    expect(rows[0].id).toBeTruthy();
    expect(rows[1]).toMatchObject({ key: 'content-type', value: 'application/json' });
  });

  it('returns an empty list for no headers', () => {
    expect(headersToRows({})).toEqual([]);
  });
});
