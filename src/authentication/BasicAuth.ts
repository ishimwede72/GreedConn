/**
 * HTTP Basic authentication.
 */

export function applyBasic(
  username: string,
  password: string,
): { headers: Record<string, string> } {
  if (!username && !password) {
    throw new Error('Basic authentication requires a username and/or password.');
  }
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return { headers: { authorization: `Basic ${encoded}` } };
}

/** Decode a Basic header (used by importers/tests; returns empty on error). */
export function decodeBasic(value: string): { username: string; password: string } | null {
  const match = /^Basic\s+(.+)$/i.exec(value.trim());
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const index = decoded.indexOf(':');
    if (index === -1) return { username: decoded, password: '' };
    return { username: decoded.slice(0, index), password: decoded.slice(index + 1) };
  } catch {
    return null;
  }
}
