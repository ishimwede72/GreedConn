/**
 * Bearer token authentication.
 */

export interface BearerApplyResult {
  headers: Record<string, string>;
}

export function applyBearer(token: string, prefix = 'Bearer'): BearerApplyResult {
  const trimmed = token ?? '';
  if (trimmed.length === 0) {
    throw new Error('Bearer token is empty.');
  }
  const headerValue = prefix ? `${prefix} ${trimmed}` : trimmed;
  return { headers: { authorization: headerValue } };
}

/** Split a "Bearer xyz" style value into scheme + value. */
export function parseAuthorizationHeader(value: string): { scheme: string; value: string } {
  const spaceIndex = value.indexOf(' ');
  if (spaceIndex === -1) return { scheme: '', value };
  return { scheme: value.slice(0, spaceIndex), value: value.slice(spaceIndex + 1) };
}
