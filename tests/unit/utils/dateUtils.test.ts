/**
 * Unit tests for date/byte formatting helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatDuration,
  nowIso,
  relativeTime,
  defaultStatusText,
} from '../../../src/utils/DateUtils';

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024)).toBe('10 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });

  it('returns an em dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats sub-second durations in ms', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(999)).toBe('999 ms');
    expect(formatDuration(12.4)).toBe('12 ms');
  });

  it('formats seconds with two decimals', () => {
    expect(formatDuration(1500)).toBe('1.50 s');
    expect(formatDuration(60_000)).toBe('60.00 s');
  });

  it('returns an em dash for invalid input', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('nowIso', () => {
  it('produces a parseable ISO timestamp', () => {
    const value = nowIso();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(value))).toBe(false);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-01-10T12:00:00.000Z');

  it('reports "just now" for very recent timestamps', () => {
    expect(relativeTime('2026-01-10T11:59:45Z', now)).toBe('just now');
  });

  it('reports seconds, minutes, hours and days', () => {
    expect(relativeTime('2026-01-10T11:59:00Z', now)).toBe('1m ago');
    expect(relativeTime('2026-01-10T11:59:20Z', now)).toBe('40s ago');
    expect(relativeTime('2026-01-10T11:55:00Z', now)).toBe('5m ago');
    expect(relativeTime('2026-01-10T07:00:00Z', now)).toBe('5h ago');
    expect(relativeTime('2026-01-05T12:00:00Z', now)).toBe('5d ago');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(relativeTime('2026-01-10T13:00:00Z', now)).toBe('just now');
  });

  it('returns an em dash for unparseable input', () => {
    expect(relativeTime('not a date', now)).toBe('—');
  });

  it('falls back to a locale date string for old entries', () => {
    const value = relativeTime('2025-01-01T00:00:00Z', now);
    expect(value).not.toBe('—');
    expect(value.length).toBeGreaterThan(2);
  });
});

describe('defaultStatusText', () => {
  it('maps common status codes', () => {
    expect(defaultStatusText(200)).toBe('OK');
    expect(defaultStatusText(201)).toBe('Created');
    expect(defaultStatusText(404)).toBe('Not Found');
    expect(defaultStatusText(500)).toBe('Internal Server Error');
  });

  it('returns empty string for unknown codes', () => {
    expect(defaultStatusText(599)).toBe('');
    expect(defaultStatusText(0)).toBe('');
  });
});
