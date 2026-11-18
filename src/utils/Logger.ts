/**
 * Shared logging with credential redaction.
 *
 * The logger never prints values that look like secrets: `Authorization`,
 * `Cookie`, `Set-Cookie`, `X-Api-Key`, `Proxy-Authorization` and anything
 * that matches a token-like pattern is masked before formatting.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'off';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  off: 4,
};

export const REDACTED = '«redacted»';

const SENSITIVE_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-access-token|api-key|apikey)$/i;

const TOKEN_LIKE = /\b(bearer\s+)[A-Za-z0-9\-._~+/=]{8,}/gi;
const QUERY_PARAMETER = /([?&])([^=&#\s"'<>]+)=([^&#\s"'<>]*)/g;
const SENSITIVE_QUERY_KEY =
  /(^|[-_.])(auth|authorization|credential|key|password|passwd|refresh|secret|session|sig|signature|token)([-_.]|$)/i;

/** Redact recognizable secret query parameters in logs and arbitrary text. */
export function redactString(input: string, additionalSensitiveQueryKeys: string[] = []): string {
  const extraKeys = new Set(additionalSensitiveQueryKeys.map(normalizeQueryKey));
  return input
    .replace(TOKEN_LIKE, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(QUERY_PARAMETER, (match, separator: string, rawKey: string) => {
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      } catch {
        // Keep the raw key when it contains malformed percent-encoding.
      }
      return isSensitiveQueryKey(key, extraKeys) ? `${separator}${rawKey}=${REDACTED}` : match;
    });
}

/** Redact secret query values from a URL, including custom API-key names. */
export function redactUrl(input: string, additionalSensitiveQueryKeys: string[] = []): string {
  return redactString(input, additionalSensitiveQueryKeys);
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER.test(key) ? REDACTED : redactString(value);
  }
  return out;
}

export interface LoggerSink {
  write(level: Exclude<LogLevel, 'off'>, message: string): void;
}

/** Default sink writes to the VS Code output channel when available. */
let sink: LoggerSink = {
  write(level, message) {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : console.log)(line);
  },
};

let currentLevel: LogLevel = 'info';

export const logger = {
  setSink(next: LoggerSink): void {
    sink = next;
  },
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },
  getLevel(): LogLevel {
    return currentLevel;
  },
  enabled(level: Exclude<LogLevel, 'off'>): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[currentLevel] && currentLevel !== 'off';
  },
  error(message: string, ...rest: unknown[]): void {
    if (logger.enabled('error')) sink.write('error', format(message, rest));
  },
  warn(message: string, ...rest: unknown[]): void {
    if (logger.enabled('warn')) sink.write('warn', format(message, rest));
  },
  info(message: string, ...rest: unknown[]): void {
    if (logger.enabled('info')) sink.write('info', format(message, rest));
  },
  debug(message: string, ...rest: unknown[]): void {
    if (logger.enabled('debug')) sink.write('debug', format(message, rest));
  },
};

function format(message: string, rest: unknown[]): string {
  const parts = [redactString(message)];
  for (const item of rest) {
    if (item === undefined) continue;
    try {
      parts.push(
        typeof item === 'string' ? redactString(item) : redactString(JSON.stringify(item)),
      );
    } catch {
      parts.push('[unserializable]');
    }
  }
  return parts.join(' ');
}

function normalizeQueryKey(key: string): string {
  try {
    return decodeURIComponent(key.replace(/\+/g, ' ')).toLowerCase();
  } catch {
    return key.toLowerCase();
  }
}

function isSensitiveQueryKey(key: string, additionalKeys: Set<string>): boolean {
  const normalized = normalizeQueryKey(key);
  return additionalKeys.has(normalized) || isSensitiveQueryKeyName(normalized);
}

export function isSensitiveQueryKeyName(key: string): boolean {
  return SENSITIVE_QUERY_KEY.test(normalizeQueryKey(key));
}

export const log = logger;
