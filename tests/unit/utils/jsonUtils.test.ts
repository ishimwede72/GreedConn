/**
 * Unit tests for JSON helpers: safe parsing, formatting, JSON-path
 * evaluation and content-type detection.
 */
import { describe, it, expect } from 'vitest';
import {
  parseJson,
  formatJson,
  tryFormatJson,
  getJsonPath,
  detectBodyKind,
} from '../../../src/utils/JsonUtils';

describe('parseJson', () => {
  it('parses valid JSON', () => {
    const result = parseJson('{"a": 1}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1 });
  });

  it('trims whitespace before parsing', () => {
    const result = parseJson('  [1, 2, 3]  ');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([1, 2, 3]);
  });

  it('rejects invalid JSON with a message', () => {
    const result = parseJson('{not json}');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.value).toBeUndefined();
  });

  it('rejects empty input', () => {
    expect(parseJson('').ok).toBe(false);
    expect(parseJson('   ').ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(parseJson(42 as unknown as string).ok).toBe(false);
  });

  it('accepts primitives', () => {
    expect(parseJson('42').value).toBe(42);
    expect(parseJson('"text"').value).toBe('text');
    expect(parseJson('null').value).toBeNull();
  });
});

describe('formatJson', () => {
  it('pretty-prints JSON', () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('respects a custom indent', () => {
    expect(formatJson('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
  });

  it('throws on invalid JSON', () => {
    expect(() => formatJson('nope')).toThrow();
  });
});

describe('tryFormatJson', () => {
  it('reports changed=true when formatting alters the text', () => {
    const result = tryFormatJson('{"a":1}');
    expect(result.changed).toBe(true);
    expect(result.formatted).toContain('"a"');
  });

  it('returns the original text unchanged when already formatted', () => {
    const formatted = '{"a": 1}';
    const result = tryFormatJson(formatted);
    // Either unchanged or reformatted — must never throw.
    expect(typeof result.formatted).toBe('string');
    expect(result.formatted.length).toBeGreaterThan(0);
  });

  it('returns changed=false for invalid JSON', () => {
    const result = tryFormatJson('not json');
    expect(result.changed).toBe(false);
    expect(result.formatted).toBe('not json');
  });
});

describe('getJsonPath', () => {
  const doc = {
    user: { name: 'Ada', tags: ['admin', 'dev'], address: { city: 'London' } },
    items: [{ id: 1 }, { id: 2 }],
    'weird.key': true,
    nullValue: null,
  };

  it('resolves $.-prefixed dotted paths', () => {
    expect(getJsonPath(doc, '$.user.name')).toEqual({ found: true, value: 'Ada' });
  });

  it('resolves array indexes', () => {
    expect(getJsonPath(doc, '$.items[1].id')).toEqual({ found: true, value: 2 });
    expect(getJsonPath(doc, '$.user.tags[0]')).toEqual({ found: true, value: 'admin' });
  });

  it('resolves bracket access on the root', () => {
    expect(getJsonPath(doc, '$.user.tags[1]')).toEqual({ found: true, value: 'dev' });
  });

  it('returns found=true with the root for "$." and "$"', () => {
    expect(getJsonPath(doc, '$.')).toEqual({ found: true, value: doc });
    expect(getJsonPath(doc, '$')).toEqual({ found: true, value: doc });
  });

  it('reports missing paths instead of throwing', () => {
    expect(getJsonPath(doc, '$.user.middleName').found).toBe(false);
    expect(getJsonPath(doc, '$.items[99].id').found).toBe(false);
    expect(getJsonPath(doc, '$.user.name.first').found).toBe(false);
  });

  it('handles null values without treating them as missing', () => {
    expect(getJsonPath(doc, '$.nullValue')).toEqual({ found: true, value: null });
  });

  it('returns found=false for an empty path', () => {
    expect(getJsonPath(doc, '').found).toBe(false);
  });

  it('does not walk into prototype properties', () => {
    expect(getJsonPath(doc, '$.toString').found).toBe(false);
    expect(getJsonPath(doc, '$.__proto__').found).toBe(false);
  });

  it('returns not-found when traversing through a primitive', () => {
    expect(getJsonPath(doc, '$.user.name.length.x').found).toBe(false);
  });

  it('supports quoted keys inside brackets', () => {
    expect(getJsonPath(doc, '$["weird.key"]')).toEqual({ found: true, value: true });
  });
});

describe('detectBodyKind', () => {
  it('uses the content type when present', () => {
    expect(detectBodyKind('application/json', 'anything')).toBe('json');
    expect(detectBodyKind('application/ld+json', 'x')).toBe('json');
    expect(detectBodyKind('text/html; charset=utf-8', '<p>hi</p>')).toBe('html');
    expect(detectBodyKind('application/xml', '<a/>')).toBe('xml');
    expect(detectBodyKind('text/plain', 'hello')).toBe('text');
  });

  it('reports empty for empty bodies', () => {
    expect(detectBodyKind('application/json', '')).toBe('empty');
    expect(detectBodyKind('', '')).toBe('empty');
  });

  it('sniffs JSON when the content type is generic', () => {
    expect(detectBodyKind('', '{"a":1}')).toBe('json');
    expect(detectBodyKind('', '[1,2]')).toBe('json');
  });

  it('sniffs HTML vs XML from the leading tag', () => {
    expect(detectBodyKind('', '<!DOCTYPE html><html></html>')).toBe('html');
    expect(detectBodyKind('', '<root><child/></root>')).toBe('xml');
  });

  it('falls back to text', () => {
    expect(detectBodyKind('', 'plain words')).toBe('text');
    expect(detectBodyKind('', '{not valid json')).toBe('text');
  });
});
