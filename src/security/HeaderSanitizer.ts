/**
 * Header validation/sanitization.
 *
 * HTTP header injection via CR/LF/NUL in names or values is the classic
 * request-smuggling vector; every header passes through here before it is
 * written to the socket.
 */

export interface HeaderSanitizeResult {
  ok: boolean;
  name?: string;
  value?: string;
  reason?: string;
}

const VALID_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-connection',
  'keep-alive',
]);

export function sanitizeHeaderName(name: unknown): HeaderSanitizeResult {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, reason: 'Header name is required.' };
  }
  const trimmed = name.trim();
  if (trimmed.length > 256) {
    return { ok: false, reason: 'Header name is too long (max 256 characters).' };
  }
  if (/[\r\n\0]/.test(trimmed)) {
    return { ok: false, reason: 'Header name contains illegal control characters.' };
  }
  if (!VALID_NAME_RE.test(trimmed)) {
    return { ok: false, reason: `"${trimmed}" is not a valid HTTP header name.` };
  }
  if (FORBIDDEN_HEADERS.has(trimmed.toLowerCase())) {
    return {
      ok: false,
      reason: `Header "${trimmed}" is managed by the HTTP client and cannot be set manually.`,
    };
  }
  return { ok: true, name: trimmed };
}

export function sanitizeHeaderValue(value: unknown): HeaderSanitizeResult {
  if (typeof value !== 'string') {
    return { ok: false, reason: 'Header value must be a string.' };
  }
  if (value.length > 16384) {
    return { ok: false, reason: 'Header value is too long (max 16384 characters).' };
  }
  if (/[\r\n\0]/.test(value)) {
    return { ok: false, reason: 'Header value contains illegal control characters (CR/LF).' };
  }
  return { ok: true, value };
}

export interface SanitizedHeader {
  name: string;
  value: string;
}

/**
 * Sanitize a full header map. Returns valid headers plus rejections so the
 * caller can surface precise errors instead of silently dropping input.
 */
export function sanitizeHeaders(headers: Record<string, string>): {
  headers: SanitizedHeader[];
  rejected: Array<{ name: string; reason: string }>;
} {
  const valid: SanitizedHeader[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  for (const [name, value] of Object.entries(headers)) {
    const nameCheck = sanitizeHeaderName(name);
    if (!nameCheck.ok) {
      rejected.push({ name: String(name), reason: nameCheck.reason ?? 'Invalid header name.' });
      continue;
    }
    const valueCheck = sanitizeHeaderValue(value);
    if (!valueCheck.ok) {
      rejected.push({
        name: nameCheck.name!,
        reason: valueCheck.reason ?? 'Invalid header value.',
      });
      continue;
    }
    valid.push({ name: nameCheck.name!, value: valueCheck.value! });
  }
  return { headers: valid, rejected };
}

/** Redact sensitive header values for display/logging. */
const SENSITIVE =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-access-token|api-key|apikey)$/i;

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE.test(name);
}

export function redactHeaderValue(name: string, value: string): string {
  return isSensitiveHeader(name) ? '••••••••' : value;
}
