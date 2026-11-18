/**
 * Low-level HTTP client built on node:http / node:https.
 *
 * Design notes:
 *  - zero third-party networking dependencies (no axios/fetch indirection)
 *  - first-class cancellation via AbortSignal
 *  - hard response size cap (streams are destroyed past the limit)
 *  - redirect handling with policy checks and Authorization stripping
 *  - preserves HTTP error statuses as normal responses (never throws for 4xx/5xx)
 */
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { describeNetworkError } from '../utils/ErrorUtils';
import { logger } from '../utils/Logger';
import { validateRedirect, UrlPolicy, DEFAULT_URL_POLICY } from '../security/UrlValidator';

export interface HttpClientOptions {
  method: string;
  url: string | URL;
  headers: Record<string, string>;
  body?: Buffer | null;
  timeoutMs: number;
  signal?: AbortSignal;
  followRedirects?: boolean;
  maxRedirects?: number;
  validateSsl?: boolean;
  maxResponseBytes?: number;
  urlPolicy?: UrlPolicy;
  /** Called for each redirect hop (from, to). */
  onRedirect?: (from: URL, to: string) => void;
}

export interface RawHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  body: Buffer;
  responseTimeMs: number;
  truncated: boolean;
  finalUrl: string;
  redirectCount: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class HttpClient {
  async send(options: HttpClientOptions): Promise<RawHttpResponse> {
    const startedAt = performance.now();
    const followRedirects = options.followRedirects ?? true;
    const maxRedirects = options.maxRedirects ?? 5;
    const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const policy = options.urlPolicy ?? DEFAULT_URL_POLICY;

    let currentUrl = typeof options.url === 'string' ? new URL(options.url) : options.url;
    let method = options.method.toUpperCase();
    let body = options.body ?? null;
    const headers = { ...options.headers };
    let redirectCount = 0;


    while (true) {
      const isLastHop = !followRedirects || redirectCount >= maxRedirects;
      const response = await this.singleRequest({
        ...options,
        method,
        url: currentUrl,
        headers,
        body,
        maxResponseBytes: maxBytes,
        isLastHop,
      });

      const isRedirect = REDIRECT_STATUSES.has(response.status) && locationHeader(response.headers);
      if (!isRedirect || isLastHop) {
        return {
          ...response,
          responseTimeMs: performance.now() - startedAt,
          finalUrl: currentUrl.toString(),
          redirectCount,
        };
      }

      const location = locationHeader(response.headers)!;
      const nextUrl = new URL(location, currentUrl);

      const check = validateRedirect(currentUrl, nextUrl.toString(), policy);
      if (!check.ok) {
        logger.warn(`redirect blocked: ${check.message}`);
        return {
          ...response,
          responseTimeMs: performance.now() - startedAt,
          finalUrl: currentUrl.toString(),
          redirectCount,
        };
      }

      // 303 always becomes GET; 301/302 downgrade POST to GET (browser parity).
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === 'POST')
      ) {
        method = 'GET';
        body = null;
        delete headers['content-type'];
        delete headers['content-length'];
      }

      // Never forward credentials across origins.
      if (!sameOrigin(currentUrl, nextUrl)) {
        delete headers['authorization'];
        delete headers['cookie'];
      }

      options.onRedirect?.(currentUrl, nextUrl.toString());
      currentUrl = nextUrl;
      redirectCount += 1;
    }
  }

  private singleRequest(
    options: HttpClientOptions & { isLastHop: boolean },
  ): Promise<Omit<RawHttpResponse, 'responseTimeMs' | 'finalUrl' | 'redirectCount'>> {
    return new Promise((resolve, reject) => {
      const url = typeof options.url === 'string' ? new URL(options.url) : options.url;
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = { ...options.headers };
      if (options.body && options.body.length > 0) {
        headers['content-length'] = String(options.body.length);
      }
      // RFC 7230: Host header is derived from the URL by the client.
      delete headers['host'];

      const requestOptions: https.RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers,
        // Node 18+: `agent` defaults handle keep-alive.
      };

      if (isHttps) {
        requestOptions.rejectUnauthorized = options.validateSsl !== false;
      }

      let settled = false;
      let timeoutHandle: NodeJS.Timeout | undefined;
      const cleanup = (): void => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        options.signal?.removeEventListener('abort', onAbort);
      };

      const fail = (error: Error & { code?: string }): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const onAbort = (): void => {
        const abortError = new Error('Request cancelled.') as Error & { code: string };
        abortError.code = 'ABORT_ERR';
        req.destroy(abortError);
        fail(abortError);
      };

      const req = transport.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;

        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > (options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES)) {
            truncated = true;
            // Keep only up to the cap so the caller still gets a partial body.
            const remaining =
              (options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES) - (total - chunk.length);
            if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (settled) return;
          settled = true;
          cleanup();
          const rawHeaders: string[] = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            rawHeaders.push(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`);
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: flattenHeaders(res.headers),
            rawHeaders,
            body: Buffer.concat(chunks),
            truncated,
          });
        });

        res.on('error', (error: Error & { code?: string }) => {
          if (truncated) {
            // Destroy due to size cap is expected; treat as end-of-stream.
            if (settled) return;
            settled = true;
            cleanup();
            const rawHeaders: string[] = [];
            for (let i = 0; i < res.rawHeaders.length; i += 2) {
              rawHeaders.push(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`);
            }
            resolve({
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? '',
              headers: flattenHeaders(res.headers),
              rawHeaders,
              body: Buffer.concat(chunks),
              truncated: true,
            });
            return;
          }
          fail(normalizeSocketError(error));
        });
      });

      // Attach the error listener before any abort/timeout path can destroy
      // the request — otherwise a pre-aborted signal emits `error` with no
      // listener and crashes the process (uncaught exception).
      req.on('error', (error: Error & { code?: string }) => {
        fail(normalizeSocketError(error));
      });

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      if (options.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          const timeoutError = new Error(
            `Request timed out after ${options.timeoutMs} ms.`,
          ) as Error & { code: string };
          timeoutError.code = 'ETIMEDOUT';
          req.destroy(timeoutError);
          fail(timeoutError);
        }, options.timeoutMs);
      }

      if (options.body && options.body.length > 0) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

function normalizeSocketError(error: Error & { code?: string }): Error & { code?: string } {
  if (error.code === 'ABORT_ERR') {
    const description = describeNetworkError(error);
    const renamed = new Error(description.message) as Error & { code: string };
    renamed.code = 'ABORT_ERR';
    return renamed;
  }
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    const renamed = new Error('Request timed out.') as Error & { code: string };
    renamed.code = 'ETIMEDOUT';
    return renamed;
  }
  return error;
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function locationHeader(headers: Record<string, string>): string | undefined {
  const value = headers['location'];
  return value && value.length > 0 ? value : undefined;
}

function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port;
}
