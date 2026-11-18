/**
 * Unit tests for input sanitization at the webview boundary.
 * The webview is untrusted: everything crossing it must be size-capped and
 * stripped of control characters.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeMultiline,
  escapeHtml,
  sanitizeFileName,
  safeKey,
} from '../../../src/security/InputSanitizer';

describe('sanitizeText', () => {
  it('returns plain strings unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world');
  });

  it('returns empty string for non-strings', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(42)).toBe('');
    expect(sanitizeText({})).toBe('');
    expect(sanitizeText([])).toBe('');
  });

  it('strips control characters by default', () => {
    expect(sanitizeText('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeText('keep\ttab and\nnewline')).toBe('keep\ttab and\nnewline');
    expect(sanitizeText('bell\u0007')).toBe('bell');
  });

  it('caps length at maxLength', () => {
    expect(sanitizeText('x'.repeat(50), { maxLength: 10 })).toHaveLength(10);
    expect(sanitizeText('x'.repeat(50), { maxLength: 100 })).toHaveLength(50);
  });

  it('trims when asked', () => {
    expect(sanitizeText('  padded  ', { trim: true })).toBe('padded');
  });

  it('keeps control characters when explicitly allowed', () => {
    expect(sanitizeText('a\u0001b', { allowControlChars: true })).toBe('a\u0001b');
  });
});

describe('sanitizeMultiline', () => {
  it('preserves newlines and tabs', () => {
    expect(sanitizeMultiline('line1\nline2\tindented')).toBe('line1\nline2\tindented');
  });

  it('strips other control characters', () => {
    expect(sanitizeMultiline('a\u0000b\u0007\nc')).toBe('ab\nc');
  });

  it('caps length', () => {
    expect(sanitizeMultiline('y'.repeat(100), 20)).toHaveLength(20);
  });

  it('returns empty string for non-strings', () => {
    expect(sanitizeMultiline(null)).toBe('');
    expect(sanitizeMultiline(7)).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes all HTML metacharacters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("it's & more")).toBe('it&#39;s &amp; more');
  });

  it('handles nullish input safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('is idempotent for already-safe text', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });
});

describe('sanitizeFileName', () => {
  it('strips path separators and dangerous characters', () => {
    expect(sanitizeFileName('my/collection:version*1')).toBe('mycollectionversion1');
    expect(sanitizeFileName('../../etc/passwd')).toBe('....etcpasswd');
    expect(sanitizeFileName('a<b>c"d|e')).toBe('abcde');
  });

  it('normalizes whitespace and trims', () => {
    expect(sanitizeFileName('  my   collection  ')).toBe('my collection');
  });

  it('uses the fallback when nothing survives', () => {
    expect(sanitizeFileName('///')).toBe('export');
    expect(sanitizeFileName('', 'collection')).toBe('collection');
    expect(sanitizeFileName('   ', 'collection')).toBe('collection');
  });

  it('caps length at 120 characters', () => {
    expect(sanitizeFileName('a'.repeat(300))).toHaveLength(120);
  });
});

describe('safeKey', () => {
  it('neutralizes prototype-polluting keys', () => {
    expect(safeKey('__proto__')).toBe('___proto__');
    expect(safeKey('constructor')).toBe('_constructor');
    expect(safeKey('prototype')).toBe('_prototype');
  });

  it('leaves ordinary keys alone', () => {
    expect(safeKey('username')).toBe('username');
    expect(safeKey('a-b_c.d')).toBe('a-b_c.d');
  });
});
