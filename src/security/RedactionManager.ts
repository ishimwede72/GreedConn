/**
 * Redaction utilities for logs, history and exports.
 */

import { isSensitiveHeader, redactHeaderValue } from './HeaderSanitizer';
import { isSensitiveQueryKeyName, redactString } from '../utils/Logger';

const SENSITIVE_KEY_RE =
  /(token|secret|password|passwd|api[-_]?key|authorization|credential|refresh)/i;

export const MASK = '••••••••';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/** Mask a value when its key looks sensitive. */
export function redactByKey(key: string, value: string): string {
  return isSensitiveKey(key) ? MASK : redactString(value);
}

export function redactHeadersForDisplay(
  headers: Record<string, string>,
  urls: string[] = [],
  sensitiveQueryKeys: string[] = [],
  knownSecrets: string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveHeader(key)
      ? redactHeaderValue(key, value)
      : redactKnownSecrets(
          redactQuerySecrets(redactString(value), urls, sensitiveQueryKeys),
          knownSecrets,
        );
  }
  return out;
}

/**
 * Prepare headers for history persistence: sensitive headers are stored as a
 * presence marker only (so "header exists" tests can still be reviewed later)
 * rather than the raw value.
 */
export function redactHeadersForStorage(
  headers: Record<string, string>,
  urls: string[] = [],
  sensitiveQueryKeys: string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = isSensitiveHeader(key)
      ? MASK
      : redactQuerySecrets(redactString(value), urls, sensitiveQueryKeys);
  }
  return out;
}

/** Recursively mask sensitive-looking fields in a plain object (imports/exports). */
export function redactObject<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item)) as unknown as T;
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    const fields = input as Record<string, unknown>;
    const rowKey = typeof fields.key === 'string' ? fields.key : undefined;
    for (const [key, value] of Object.entries(fields)) {
      if (isSensitiveKey(key) && typeof value === 'string') {
        out[key] = MASK;
      } else if (
        key === 'value' &&
        rowKey &&
        (isSensitiveKey(rowKey) || isSensitiveQueryKeyName(rowKey)) &&
        typeof value === 'string'
      ) {
        out[key] = MASK;
      } else {
        out[key] = redactObject(value);
      }
    }
    return out as unknown as T;
  }
  return (typeof input === 'string' ? redactString(input) : input) as T;
}

/** Replace occurrences of known secret values in free text (best effort). */
export function redactKnownSecrets(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      result = result.split(secret).join(MASK);
    }
  }
  return redactString(result);
}

/** Remove query credentials from response text when a server reflects them. */
export function redactQuerySecrets(
  text: string,
  urls: string[],
  sensitiveKeys: string[] = [],
): string {
  const normalizedKeys = new Set(sensitiveKeys.map((key) => key.toLowerCase()));
  const secrets = new Set<string>();
  for (const value of urls) {
    try {
      const parsed = new URL(value);
      for (const [key, queryValue] of parsed.searchParams) {
        if ((isSensitiveKey(key) || normalizedKeys.has(key.toLowerCase())) && queryValue) {
          secrets.add(queryValue);
        }
      }
    } catch {
      // Ignore non-URL text, which can occur in older history records.
    }
  }

  let result = text;
  for (const secret of secrets) {
    if (secret.length < 4) {
      if (result.includes(secret) || result.includes(encodeURIComponent(secret))) {
        return '[Response body hidden because it contains a short query credential.]';
      }
      continue;
    }
    for (const variant of new Set([
      secret,
      encodeURIComponent(secret),
      secret.replace(/%20/gi, '+'),
    ])) {
      if (variant) result = result.split(variant).join(MASK);
    }
  }
  return redactString(result);
}
