/**
 * Unit tests for history filtering/search — `matchesFilter`,
 * `searchHistory` and `historyStats`.
 */
import { describe, it, expect } from 'vitest';
import {
  matchesFilter,
  searchHistory,
  historyStats,
} from '../../../src/history/HistorySearch';
import type { HistoryEntry, HistoryFilter } from '../../../src/types/History';

let counter = 0;
function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  counter += 1;
  return {
    id: `hst_${counter}`,
    name: 'Get Users',
    method: 'GET',
    url: 'https://api.example.com/users',
    status: 200,
    responseTime: 100,
    timestamp: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('matchesFilter — method', () => {
  it('matches the exact method', () => {
    expect(matchesFilter(entry({ method: 'POST' }), { method: 'POST' })).toBe(true);
    expect(matchesFilter(entry({ method: 'POST' }), { method: 'GET' })).toBe(false);
  });

  it('ignores the method filter for ALL and empty values', () => {
    expect(matchesFilter(entry({ method: 'DELETE' }), { method: 'ALL' })).toBe(true);
    expect(matchesFilter(entry({ method: 'DELETE' }), {})).toBe(true);
  });
});

describe('matchesFilter — statusGroup', () => {
  it('buckets 2xx as success', () => {
    expect(matchesFilter(entry({ status: 200 }), { statusGroup: 'success' })).toBe(true);
    expect(matchesFilter(entry({ status: 299 }), { statusGroup: 'success' })).toBe(true);
    expect(matchesFilter(entry({ status: 301 }), { statusGroup: 'success' })).toBe(false);
    expect(matchesFilter(entry({ status: 404 }), { statusGroup: 'success' })).toBe(false);
  });

  it('buckets 3xx as redirect', () => {
    expect(matchesFilter(entry({ status: 302 }), { statusGroup: 'redirect' })).toBe(true);
    expect(matchesFilter(entry({ status: 200 }), { statusGroup: 'redirect' })).toBe(false);
    expect(matchesFilter(entry({ status: 400 }), { statusGroup: 'redirect' })).toBe(false);
  });

  it('buckets 4xx as clientError', () => {
    expect(matchesFilter(entry({ status: 404 }), { statusGroup: 'clientError' })).toBe(true);
    expect(matchesFilter(entry({ status: 499 }), { statusGroup: 'clientError' })).toBe(true);
    expect(matchesFilter(entry({ status: 500 }), { statusGroup: 'clientError' })).toBe(false);
  });

  it('buckets 5xx as serverError', () => {
    expect(matchesFilter(entry({ status: 503 }), { statusGroup: 'serverError' })).toBe(true);
    expect(matchesFilter(entry({ status: 600 }), { statusGroup: 'serverError' })).toBe(false);
    expect(matchesFilter(entry({ status: 404 }), { statusGroup: 'serverError' })).toBe(false);
  });

  it('buckets status 0 (and a missing status) as error', () => {
    expect(matchesFilter(entry({ status: 0 }), { statusGroup: 'error' })).toBe(true);
    expect(matchesFilter(entry({ status: undefined }), { statusGroup: 'error' })).toBe(true);
    expect(matchesFilter(entry({ status: 200 }), { statusGroup: 'error' })).toBe(false);
  });

  it('ALL and empty statusGroup match everything', () => {
    expect(matchesFilter(entry({ status: 500 }), { statusGroup: 'ALL' })).toBe(true);
    expect(matchesFilter(entry({ status: 500 }), {})).toBe(true);
  });
});

describe('matchesFilter — date range', () => {
  it('applies from/to boundaries inclusively', () => {
    const target = entry({ timestamp: '2026-01-15T10:00:00.000Z' });
    expect(matchesFilter(target, { from: '2026-01-15T10:00:00.000Z' })).toBe(true);
    expect(matchesFilter(target, { from: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(matchesFilter(target, { from: '2026-01-20T00:00:00.000Z' })).toBe(false);
    expect(matchesFilter(target, { to: '2026-01-20T00:00:00.000Z' })).toBe(true);
    expect(matchesFilter(target, { to: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(
      matchesFilter(target, { from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' }),
    ).toBe(true);
  });

  it('ignores unparseable date bounds', () => {
    const target = entry();
    expect(matchesFilter(target, { from: 'not-a-date' })).toBe(true);
    expect(matchesFilter(target, { to: '' })).toBe(true);
  });
});

describe('matchesFilter — collectionId', () => {
  it('requires a matching source collection', () => {
    const inCollection = entry({ source: { collectionId: 'col_1', itemId: 'itm_1' } });
    expect(matchesFilter(inCollection, { collectionId: 'col_1' })).toBe(true);
    expect(matchesFilter(inCollection, { collectionId: 'col_2' })).toBe(false);
    expect(matchesFilter(entry({}), { collectionId: 'col_1' })).toBe(false);
  });
});

describe('matchesFilter — free text', () => {
  it('searches name, url, method and status case-insensitively', () => {
    expect(matchesFilter(entry({ name: 'Get Users' }), { search: 'get users' })).toBe(true);
    expect(matchesFilter(entry({ name: 'Get Users' }), { search: 'USERS' })).toBe(true);
    expect(matchesFilter(entry({ url: 'https://api.example.com/orders' }), { search: 'api.example' })).toBe(true);
    expect(matchesFilter(entry({ method: 'POST' }), { search: 'post' })).toBe(true);
    expect(matchesFilter(entry({ status: 500 }), { search: '500' })).toBe(true);
    expect(matchesFilter(entry({ status: 200 }), { search: 'nomatch' })).toBe(false);
  });

  it('trims the query and honours finalUrl, environment and error text', () => {
    expect(matchesFilter(entry(), { search: '   users   ' })).toBe(true);
    expect(
      matchesFilter(entry({ finalUrl: 'https://redirect.example.com/final' }), { search: 'redirect.example' }),
    ).toBe(true);
    expect(
      matchesFilter(entry({ environmentName: 'Staging' }), { search: 'staging' }),
    ).toBe(true);
    expect(
      matchesFilter(entry({ error: { code: 'ENOTFOUND', message: 'DNS failed' } }), { search: 'dns failed' }),
    ).toBe(true);
  });

  it('combines text with other filters', () => {
    const target = entry({ method: 'POST', status: 201 });
    expect(matchesFilter(target, { search: 'post', statusGroup: 'success' })).toBe(true);
    expect(matchesFilter(target, { search: 'post', statusGroup: 'serverError' })).toBe(false);
  });
});

describe('searchHistory', () => {
  const entries = [
    entry({ id: 'a', method: 'GET', status: 200 }),
    entry({ id: 'b', method: 'POST', status: 201 }),
    entry({ id: 'c', method: 'GET', status: 500 }),
    entry({ id: 'd', method: 'DELETE', status: 204 }),
    entry({ id: 'e', method: 'GET', status: 404 }),
  ];

  it('returns every match by default', () => {
    expect(searchHistory(entries, {})).toHaveLength(5);
    expect(searchHistory(entries)).toHaveLength(5);
    expect(searchHistory(entries, { method: 'GET' }).map((e) => e.id)).toEqual(['a', 'c', 'e']);
  });

  it('applies the limit after filtering', () => {
    expect(searchHistory(entries, { method: 'GET', limit: 2 }).map((e) => e.id)).toEqual(['a', 'c']);
    expect(searchHistory(entries, { limit: 1 })).toHaveLength(1);
    expect(searchHistory(entries, { method: 'GET', limit: 10 })).toHaveLength(3);
    expect(searchHistory(entries, { limit: 0 })).toHaveLength(0);
  });

  it('returns a new array and never mutates the input', () => {
    const result = searchHistory(entries, { method: 'GET' });
    expect(result).not.toBe(entries);
    expect(entries).toHaveLength(5);
  });
});

describe('historyStats', () => {
  it('counts successes, failures and errors', () => {
    const entries = [
      entry({ id: 's1', status: 200, responseTime: 100 }),
      entry({ id: 's2', status: 302, responseTime: 200 }),
      entry({ id: 'f1', status: 404, responseTime: 300 }),
      entry({ id: 'f2', status: 503, responseTime: 400 }),
      entry({ id: 'e1', status: 0, responseTime: 500 }),
      entry({
        id: 'e2',
        status: 200,
        responseTime: undefined,
        error: { code: 'ECONNRESET', message: 'reset' },
      }),
      entry({ id: 'f3', status: undefined, responseTime: undefined }),
    ];

    const stats = historyStats(entries);
    expect(stats.total).toBe(7);
    // 200 and 302 count as success
    expect(stats.success).toBe(2);
    // 404, 503 and the entry without a status count as failed
    expect(stats.failed).toBe(3);
    // status 0 and entries carrying an error count as errors
    expect(stats.errors).toBe(2);
    // avg over entries that reported a response time: (100+200+300+400+500)/5
    expect(stats.avgResponseTime).toBe(300);
  });

  it('returns zeros for an empty list', () => {
    expect(historyStats([])).toEqual({
      total: 0,
      success: 0,
      failed: 0,
      errors: 0,
      avgResponseTime: 0,
    });
  });

  it('rounds the average response time', () => {
    const stats = historyStats([
      entry({ status: 200, responseTime: 100 }),
      entry({ status: 200, responseTime: 101 }),
    ]);
    expect(stats.avgResponseTime).toBe(101);
  });

  it('ignores non-numeric response times in the average', () => {
    const stats = historyStats([
      entry({ status: 200, responseTime: 250 }),
      entry({ status: 200, responseTime: Number.NaN }),
    ]);
    expect(stats.avgResponseTime).toBe(250);
  });
});
