/**
 * HistorySearch — filtering and free-text search over history entries.
 */
import type { HistoryEntry, HistoryFilter } from '../types/History';

export function matchesFilter(entry: HistoryEntry, filter: HistoryFilter): boolean {
  if (filter.method && filter.method !== 'ALL' && entry.method !== filter.method) return false;

  if (filter.statusGroup && filter.statusGroup !== 'ALL') {
    const status = entry.status ?? 0;
    switch (filter.statusGroup) {
      case 'success':
        if (!(status >= 200 && status < 300)) return false;
        break;
      case 'redirect':
        if (!(status >= 300 && status < 400)) return false;
        break;
      case 'clientError':
        if (!(status >= 400 && status < 500)) return false;
        break;
      case 'serverError':
        if (!(status >= 500 && status < 600)) return false;
        break;
      case 'error':
        if (status !== 0) return false;
        break;
      default:
        break;
    }
  }

  if (filter.collectionId) {
    if (entry.source?.collectionId !== filter.collectionId) return false;
  }

  if (filter.from) {
    const from = Date.parse(filter.from);
    if (!Number.isNaN(from) && Date.parse(entry.timestamp) < from) return false;
  }
  if (filter.to) {
    const to = Date.parse(filter.to);
    if (!Number.isNaN(to) && Date.parse(entry.timestamp) > to) return false;
  }

  const search = filter.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      entry.name,
      entry.url,
      entry.finalUrl ?? '',
      entry.method,
      String(entry.status ?? ''),
      entry.environmentName ?? '',
      entry.error?.message ?? '',
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

export function searchHistory(entries: HistoryEntry[], filter: HistoryFilter = {}): HistoryEntry[] {
  const matched = entries.filter((entry) => matchesFilter(entry, filter));
  const limit = filter.limit ?? matched.length;
  return matched.slice(0, limit);
}

export function historyStats(entries: HistoryEntry[]): {
  total: number;
  success: number;
  failed: number;
  errors: number;
  avgResponseTime: number;
} {
  let success = 0;
  let failed = 0;
  let errors = 0;
  let timeTotal = 0;
  let timeCount = 0;
  for (const entry of entries) {
    const status = entry.status ?? 0;
    if (entry.status === 0 || entry.error) errors += 1;
    else if (status >= 200 && status < 400) success += 1;
    else failed += 1;
    if (typeof entry.responseTime === 'number' && Number.isFinite(entry.responseTime)) {
      timeTotal += entry.responseTime;
      timeCount += 1;
    }
  }
  return {
    total: entries.length,
    success,
    failed,
    errors,
    avgResponseTime: timeCount > 0 ? Math.round(timeTotal / timeCount) : 0,
  };
}
