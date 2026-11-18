/**
 * URL validation and safety policy.
 *
 * Policy model (documented in docs/SECURITY.md):
 *  - Only `http:` and `https:` are allowed by default.
 *  - Private/loopback targets are allowed by default because local API
 *    testing is the primary use case; admins can disable them.
 *  - HTTPS -> HTTP redirect (protocol downgrade) is blocked by default.
 */

export type UrlRejectionReason =
  'empty' | 'malformed' | 'protocol' | 'credentials-in-url' | 'private-network' | 'too-long';

export interface UrlPolicy {
  allowPrivateNetwork: boolean;
  allowHttpsToHttpRedirect: boolean;
  maxUrlLength: number;
}

export const DEFAULT_URL_POLICY: UrlPolicy = {
  allowPrivateNetwork: true,
  allowHttpsToHttpRedirect: false,
  maxUrlLength: 8192,
};

export interface UrlCheckResult {
  ok: boolean;
  url?: URL;
  reason?: UrlRejectionReason;
  message?: string;
  /** Set when the host is a loopback/private address. */
  isPrivate?: boolean;
  isLoopback?: boolean;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  const match = IPV4_RE.exec(host);
  if (match) {
    const first = Number(match[1]);
    return first === 127;
  }
  return false;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isLoopbackHostname(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    return true;

  const match = IPV4_RE.exec(host);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 0) return true;
    return false;
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  if (/^f[cd]/.test(host)) return true;
  if (/^fe[89ab]/.test(host)) return true;
  return false;
}

export function validateUrl(raw: string, policy: UrlPolicy = DEFAULT_URL_POLICY): UrlCheckResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'empty', message: 'URL is required.' };
  }
  const trimmed = raw.trim();
  if (trimmed.length > policy.maxUrlLength) {
    return {
      ok: false,
      reason: 'too-long',
      message: `URL exceeds ${policy.maxUrlLength} characters.`,
    };
  }

  // Support {{variable}} placeholders: they are resolved before validation
  // at execution time; for pre-flight validation we validate the shape only.
  const hasPlaceholders = /\{\{[^}]*\}\}/.test(trimmed);
  const candidate = hasPlaceholders ? replacePlaceholders(trimmed) : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    // Allow bare hosts like `api.example.com/users` by assuming https.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate) && candidate.includes('.')) {
      try {
        parsed = new URL(`https://${candidate}`);
      } catch {
        return { ok: false, reason: 'malformed', message: 'The URL could not be parsed.' };
      }
    } else {
      return { ok: false, reason: 'malformed', message: 'The URL could not be parsed.' };
    }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'protocol',
      message: `Unsupported protocol "${parsed.protocol}" — only http: and https: are allowed.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: 'credentials-in-url',
      message:
        'Credentials embedded in the URL are not allowed — use the Authorization tab instead.',
    };
  }

  const isLoopback = isLoopbackHostname(parsed.hostname);
  const isPrivate = isPrivateHostname(parsed.hostname);
  if (isPrivate && !policy.allowPrivateNetwork) {
    return {
      ok: false,
      reason: 'private-network',
      message:
        'Requests to loopback/private network addresses are disabled by your security policy.',
    };
  }

  return { ok: true, url: parsed, isPrivate, isLoopback };
}

/**
 * Validate a redirect target against the policy (called for each hop).
 */
export function validateRedirect(
  from: URL,
  to: string,
  policy: UrlPolicy = DEFAULT_URL_POLICY,
): UrlCheckResult {
  const result = validateUrl(to, policy);
  if (!result.ok) return result;
  if (
    from.protocol === 'https:' &&
    result.url?.protocol === 'http:' &&
    !policy.allowHttpsToHttpRedirect
  ) {
    return {
      ok: false,
      reason: 'protocol',
      message: 'Blocked redirect from HTTPS to HTTP (protocol downgrade).',
    };
  }
  return result;
}

function replacePlaceholders(url: string): string {
  return url.replace(/\{\{[^}]*\}\}/g, 'placeholder');
}

/** True when the URL should be treated as a request that needs variables resolved. */
export function needsVariableResolution(value: string): boolean {
  return /\{\{[^}]+\}\}/.test(value);
}
