/**
 * Unit tests for query string construction — URL merging must preserve
 * existing parameters, encode correctly and honour enabled flags.
 */
import { describe, it, expect } from 'vitest';
import {
  buildUrlWithQuery,
  buildQueryString,
  parseQueryString,
  extractQueryFromUrl,
} from '../../../src/engine/QueryManager';
import type { KeyValueRow } from '../../../src/types/Request';

let rowCounter = 0;
function row(key: string, value: string, enabled = true): KeyValueRow {
  rowCounter += 1;
  return { id: `p${rowCounter}`, key, value, enabled };
}

describe('buildUrlWithQuery', () => {
  it('appends params to a URL without a query', () => {
    const result = buildUrlWithQuery('https://api.example.com/users', [row('page', '2')]);
    expect(result.url).toBe('https://api.example.com/users?page=2');
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('preserves params already in the URL', () => {
    const result = buildUrlWithQuery('https://api.example.com/users?existing=1', [row('page', '2')]);
    expect(result.url).toContain('existing=1');
    expect(result.url).toContain('page=2');
  });

  it('percent-encodes keys and values', () => {
    const result = buildUrlWithQuery('https://api.example.com', [row('q', 'a b&c=d')]);
    expect(result.url).toBe('https://api.example.com?q=a+b%26c%3Dd');
  });

  it('skips disabled rows and empty keys', () => {
    const result = buildUrlWithQuery('https://api.example.com', [
      row('on', '1'),
      row('off', '2', false),
      row('  ', '3'),
    ]);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.url).toBe('https://api.example.com?on=1');
  });

  it('keeps duplicate keys (repeated params are legal)', () => {
    const result = buildUrlWithQuery('https://api.example.com', [row('tag', 'a'), row('tag', 'b')]);
    expect(result.url).toBe('https://api.example.com?tag=a&tag=b');
  });

  it('preserves the fragment', () => {
    const result = buildUrlWithQuery('https://api.example.com/page#section', [row('a', '1')]);
    expect(result.url).toBe('https://api.example.com/page?a=1#section');
  });

  it('returns the URL untouched when no rows are enabled', () => {
    const url = 'https://api.example.com/x?keep=1';
    const result = buildUrlWithQuery(url, [row('a', '1', false)]);
    expect(result.url).toBe(url);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('handles a URL that is only a query string edge case', () => {
    const result = buildUrlWithQuery('https://api.example.com?', [row('a', '1')]);
    expect(result.url).toBe('https://api.example.com?a=1');
  });
});

describe('buildQueryString', () => {
  it('serializes enabled rows', () => {
    expect(buildQueryString([row('a', '1'), row('b', 'two')])).toBe('a=1&b=two');
  });

  it('excludes disabled rows by default', () => {
    expect(buildQueryString([row('a', '1'), row('b', '2', false)])).toBe('a=1');
  });

  it('includes disabled rows when enabledOnly=false', () => {
    expect(buildQueryString([row('a', '1'), row('b', '2', false)], false)).toBe('a=1&b=2');
  });

  it('skips empty keys', () => {
    expect(buildQueryString([row('', 'v'), row('a', '1')])).toBe('a=1');
  });

  it('encodes special characters', () => {
    expect(buildQueryString([row('q', 'x y&z')])).toBe('q=x+y%26z');
  });
});

describe('parseQueryString', () => {
  it('parses a query string into rows', () => {
    const rows = parseQueryString('a=1&b=two');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: 'a', value: '1', enabled: true });
    expect(rows[1]).toMatchObject({ key: 'b', value: 'two', enabled: true });
    expect(rows[0].id).toBeTruthy();
  });

  it('accepts a leading question mark', () => {
    expect(parseQueryString('?a=1')).toHaveLength(1);
  });

  it('handles repeated keys', () => {
    expect(parseQueryString('tag=a&tag=b')).toHaveLength(2);
  });

  it('decodes percent-encoding', () => {
    expect(parseQueryString('q=a+b%26c')[0].value).toBe('a b&c');
  });

  it('returns an empty list for empty input', () => {
    expect(parseQueryString('')).toEqual([]);
  });

  it('keeps keys with empty values', () => {
    const rows = parseQueryString('flag=');
    expect(rows[0]).toMatchObject({ key: 'flag', value: '' });
  });
});

describe('extractQueryFromUrl', () => {
  it('splits a URL into base URL and param rows', () => {
    const result = extractQueryFromUrl('https://api.example.com/users?page=2&sort=name');
    expect(result.url).toBe('https://api.example.com/users');
    expect(result.params).toHaveLength(2);
    expect(result.params[0]).toMatchObject({ key: 'page', value: '2' });
    expect(result.params[1]).toMatchObject({ key: 'sort', value: 'name' });
  });

  it('returns the URL unchanged when there is no query', () => {
    const result = extractQueryFromUrl('https://api.example.com/users');
    expect(result.url).toBe('https://api.example.com/users');
    expect(result.params).toEqual([]);
  });

  it('never throws on malformed URLs', () => {
    const result = extractQueryFromUrl('not a url');
    expect(result.url).toBe('not a url');
    expect(result.params).toEqual([]);
  });

  it('round-trips with buildUrlWithQuery', () => {
    const original = 'https://api.example.com/search?q=hello+world&lang=en';
    const split = extractQueryFromUrl(original);
    const rebuilt = buildUrlWithQuery(split.url, split.params);
    const reparsed = new URL(rebuilt.url);
    expect(reparsed.searchParams.get('q')).toBe('hello world');
    expect(reparsed.searchParams.get('lang')).toBe('en');
  });
});
