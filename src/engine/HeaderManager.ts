/**
 * Header assembly for outgoing requests.
 */
import type { KeyValueRow } from '../types/Request';
import { sanitizeHeaderName, sanitizeHeaderValue } from '../security/HeaderSanitizer';

export interface HeaderBuildResult {
  headers: Record<string, string>;
  rejected: Array<{ name: string; reason: string }>;
}

export const DEFAULT_USER_AGENT = 'Greedcon/1.0 (VS Code REST Client)';

/**
 * Build the final header map:
 *  1. defaults (User-Agent, Accept)
 *  2. body content-type (when a body is present)
 *  3. explicit editor headers (later entries win)
 */
export function buildHeaders(options: {
  rows: KeyValueRow[];
  contentType?: string;
  removeUserAgent?: boolean;
  extra?: Record<string, string>;
}): HeaderBuildResult {
  const headers: Record<string, string> = {};
  const rejected: Array<{ name: string; reason: string }> = [];

  if (!options.removeUserAgent) {
    headers['user-agent'] = DEFAULT_USER_AGENT;
  }
  headers['accept'] = '*/*';

  if (options.contentType) {
    headers['content-type'] = options.contentType;
  }

  const apply = (rawName: string, rawValue: string): void => {
    const nameCheck = sanitizeHeaderName(rawName);
    if (!nameCheck.ok) {
      rejected.push({ name: rawName, reason: nameCheck.reason ?? 'Invalid header name.' });
      return;
    }
    const valueCheck = sanitizeHeaderValue(rawValue);
    if (!valueCheck.ok) {
      rejected.push({ name: rawName, reason: valueCheck.reason ?? 'Invalid header value.' });
      return;
    }
    // Case-insensitive overwrite so `Content-Type` and `content-type` collide correctly.
    for (const existing of Object.keys(headers)) {
      if (existing.toLowerCase() === nameCheck.name!.toLowerCase()) {
        delete headers[existing];
      }
    }
    headers[nameCheck.name!.toLowerCase()] = valueCheck.value!;
  };

  for (const row of options.rows) {
    if (!row.enabled) continue;
    if (!row.key.trim()) continue;
    apply(row.key, row.value);
  }

  if (options.extra) {
    for (const [name, value] of Object.entries(options.extra)) {
      apply(name, value);
    }
  }

  return { headers, rejected };
}

/** Get a header value case-insensitively. */
export function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/** Apply headers onto a row list (used when a request is imported). */
export function headersToRows(headers: Record<string, string>): KeyValueRow[] {
  return Object.entries(headers).map(([key, value], index) => ({
    id: `header_${index}_${Math.random().toString(36).slice(2, 8)}`,
    key,
    value,
    enabled: true,
  }));
}
