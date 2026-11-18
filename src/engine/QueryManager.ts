/**
 * Query string construction.
 *
 * Query parameters from the editor are merged into the URL with correct
 * percent-encoding (URLSearchParams semantics), preserving any parameters
 * already present in the URL string.
 */
import type { KeyValueRow } from '../types/Request';

export interface QueryBuildResult {
  url: string;
  applied: number;
  skipped: number;
}

/**
 * Merge enabled query rows into a URL string.
 * Disabled rows are skipped; empty keys are skipped; duplicate keys are kept
 * (repeated query params are legal and commonly used by APIs).
 */
export function buildUrlWithQuery(rawUrl: string, params: KeyValueRow[]): QueryBuildResult {
  const enabled = params.filter((p) => p.enabled && p.key.trim().length > 0);
  const skipped = params.length - enabled.length;
  if (enabled.length === 0) {
    return { url: rawUrl, applied: 0, skipped };
  }

  // Split fragment so we don't encode it into the query.
  const hashIndex = rawUrl.indexOf('#');
  const base = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
  const fragment = hashIndex >= 0 ? rawUrl.slice(hashIndex) : '';

  const queryIndex = base.indexOf('?');
  const pathPart = queryIndex >= 0 ? base.slice(0, queryIndex) : base;
  const existingQuery = queryIndex >= 0 ? base.slice(queryIndex + 1) : '';

  const search = new URLSearchParams(existingQuery);
  for (const param of enabled) {
    search.append(param.key.trim(), param.value);
  }

  const serialized = search.toString();
  const url =
    serialized.length > 0 ? `${pathPart}?${serialized}${fragment}` : `${pathPart}${fragment}`;
  return { url, applied: enabled.length, skipped };
}

/** Serialize rows to a query string without touching a URL. */
export function buildQueryString(params: KeyValueRow[], enabledOnly = true): string {
  const search = new URLSearchParams();
  for (const param of params) {
    if (enabledOnly && !param.enabled) continue;
    if (!param.key.trim()) continue;
    search.append(param.key.trim(), param.value);
  }
  return search.toString();
}

/** Parse a query string back into rows (used by importers). */
export function parseQueryString(query: string): KeyValueRow[] {
  const search = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const rows: KeyValueRow[] = [];
  search.forEach((value, key) => {
    rows.push({
      id: `param_${rows.length}_${Math.random().toString(36).slice(2, 8)}`,
      key,
      value,
      enabled: true,
    });
  });
  return rows;
}

/** Extract query rows from a full URL (import helper). */
export function extractQueryFromUrl(url: string): { url: string; params: KeyValueRow[] } {
  try {
    const parsed = new URL(url);
    const params = parseQueryString(parsed.search);
    parsed.search = '';
    return { url: parsed.toString().replace(/\?$/, ''), params };
  } catch {
    return { url, params: [] };
  }
}
