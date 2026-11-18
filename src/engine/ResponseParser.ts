/**
 * Response parsing: raw socket data -> typed HttpResponseModel.
 */
import type { HttpResponseModel, ResponseCookie, ResponseBodyKind } from '../types/Response';
import type { RawHttpResponse } from './HttpClient';
import { detectBodyKind } from '../utils/JsonUtils';
import { defaultStatusText } from '../utils/DateUtils';

const BINARY_CONTENT_RE =
  /^(image\/|audio\/|video\/|application\/(octet-stream|pdf|zip|gzip|x-|vnd\.))/i;

export interface ParseOptions {
  requestId: string;
  /** Cap for retained body text (bytes). */
  maxBodyBytes?: number;
}

export function parseResponse(raw: RawHttpResponse, options: ParseOptions): HttpResponseModel {
  const contentType = raw.headers['content-type'] ?? '';
  const maxBytes = options.maxBodyBytes ?? 10 * 1024 * 1024;

  let body: string;
  let bodyKind: ResponseBodyKind;

  const isBinary = isBinaryContentType(contentType, raw.body);
  if (raw.body.length === 0) {
    body = '';
    bodyKind = 'empty';
  } else if (isBinary) {
    body = raw.body.toString('base64');
    bodyKind = 'binary';
  } else {
    const slice = raw.body.subarray(0, maxBytes);
    body = slice.toString('utf8');
    bodyKind = mapKind(detectBodyKind(contentType, body));
    if (raw.body.length > maxBytes) {
      body += `\n\n… response truncated at ${maxBytes} bytes (full size ${raw.body.length} bytes)`;
    }
  }

  return {
    status: raw.status,
    statusText: raw.statusText || defaultStatusText(raw.status),
    headers: raw.headers,
    cookies: parseSetCookies(raw.headers['set-cookie']),
    body,
    bodyKind,
    responseTime: Math.round(raw.responseTimeMs),
    responseSize: raw.body.length,
    contentType,
    requestId: options.requestId,
    finalUrl: raw.finalUrl,
    redirectCount: raw.redirectCount,
    truncated: raw.truncated,
  };
}

function mapKind(kind: ReturnType<typeof detectBodyKind>): ResponseBodyKind {
  switch (kind) {
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'xml':
      return 'xml';
    case 'empty':
      return 'empty';
    default:
      return 'text';
  }
}

function isBinaryContentType(contentType: string, body: Buffer): boolean {
  if (!contentType) {
    // No content type: treat as binary when it contains NUL bytes.
    return body.includes(0);
  }
  return BINARY_CONTENT_RE.test(contentType);
}

export function parseSetCookies(raw: string | undefined): ResponseCookie[] {
  if (!raw) return [];
  // Node joins duplicate set-cookie headers with ", " which breaks Expires
  // values containing commas. Split defensively.
  const parts = splitSetCookie(raw);
  return parts
    .map((cookie) => parseOneCookie(cookie))
    .filter((c): c is ResponseCookie => c !== null);
}

function splitSetCookie(raw: string): string[] {
  const result: string[] = [];
  let current = '';
  let inExpires = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    current += ch;
    if (ch === '=' && /expires=?$/i.test(current)) inExpires = true;
    if (ch === ';' && inExpires) {
      inExpires = false;
      continue;
    }
    if (ch === ',' && !inExpires) {
      // Peek: a real cookie boundary is ", " followed by token=.
      const rest = raw.slice(i + 1);
      if (/^\s*[A-Za-z0-9!#$%&'*+.^_`|~-]+=/.test(rest)) {
        result.push(current.trim());
        current = '';
      }
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseOneCookie(raw: string): ResponseCookie | null {
  const segments = raw.split(';');
  const first = segments[0]?.trim();
  if (!first) return null;
  const eq = first.indexOf('=');
  if (eq <= 0) return null;

  const cookie: ResponseCookie = {
    name: first.slice(0, eq).trim(),
    value: first.slice(eq + 1).trim(),
  };

  for (const segment of segments.slice(1)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    const key = (separator >= 0 ? trimmed.slice(0, separator) : trimmed).trim().toLowerCase();
    const value = separator >= 0 ? trimmed.slice(separator + 1).trim() : '';
    switch (key) {
      case 'domain':
        cookie.domain = value;
        break;
      case 'path':
        cookie.path = value;
        break;
      case 'expires':
        cookie.expires = value;
        break;
      case 'max-age':
        cookie.expires = value;
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'samesite':
        cookie.sameSite = value;
        break;
      default:
        break;
    }
  }
  return cookie;
}
