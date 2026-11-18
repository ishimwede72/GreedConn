/**
 * Loopback-only HTTP test server for integration tests.
 *
 * - binds to 127.0.0.1 on an ephemeral port (port 0, port read from
 *   `server.address().port`) — external hosts are never used
 * - deterministic endpoints: echo, fixed status codes, redirect chains
 *   (301/302/303/307/308), a slow endpoint for timeout tests and a large
 *   payload endpoint for response size-cap tests
 * - starts/stops cleanly: pending timers are cleared and keep-alive
 *   connections are destroyed on `close()` so vitest sees no open handles
 */
import * as http from 'http';
import type { AddressInfo } from 'net';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  /** Lower-cased header names as received by node:http. */
  headers: Record<string, string>;
  body: string;
}

export interface TestServer {
  /** Ephemeral port bound on 127.0.0.1. */
  readonly port: number;
  /** e.g. `http://127.0.0.1:54321`. */
  readonly baseUrl: string;
  /** Absolute URL for a path, e.g. `server.url('/echo?a=1')`. */
  url(path: string): string;
  /** Every request received so far, in arrival order. */
  readonly requests: readonly RecordedRequest[];
  /** Close the server and release every socket/timer. */
  close(): Promise<void>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_SLOW_MS = 30_000;
const MAX_LARGE_BYTES = 10 * 1024 * 1024;

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(text, 'utf8')),
  });
  res.end(text);
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function startTestServer(): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const pendingTimers = new Set<NodeJS.Timeout>();

  const server = http.createServer((req, res) => {
    // The client intentionally aborts responses in size-cap/cancel tests:
    // swallow socket errors so they never surface as unhandled events.
    res.on('error', () => undefined);
    req.on('error', () => undefined);

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      let target: URL;
      try {
        target = new URL(req.url ?? '/', 'http://127.0.0.1');
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('bad request target');
        return;
      }

      const bodyText = Buffer.concat(chunks).toString('utf8');
      const pathname = target.pathname;
      requests.push({
        method: req.method ?? '',
        path: pathname,
        query: Object.fromEntries(target.searchParams),
        headers: flattenHeaders(req.headers),
        body: bodyText,
      });

      try {
        route(req, res, pathname, target, bodyText);
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  function route(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    target: URL,
    bodyText: string,
  ): void {
    // --- echo -------------------------------------------------------
    if (pathname === '/echo') {
      sendJson(res, 200, {
        method: req.method ?? '',
        path: pathname,
        query: Object.fromEntries(target.searchParams),
        headers: flattenHeaders(req.headers),
        body: bodyText,
      });
      return;
    }

    // --- fixed status codes ----------------------------------------
    if (pathname.startsWith('/status/')) {
      const code = toInt(pathname.slice('/status/'.length), 200, 100, 599);
      res.writeHead(code, {
        'content-type': 'text/plain; charset=utf-8',
        'x-status-code': String(code),
      });
      res.end(`status ${code}`);
      return;
    }

    // --- single redirect: /redirect?code=302&to=/echo ---------------
    if (pathname === '/redirect') {
      const rawCode = toInt(target.searchParams.get('code'), 302, 300, 399);
      const code = REDIRECT_STATUSES.has(rawCode) ? rawCode : 302;
      const to = target.searchParams.get('to') ?? '/echo';
      res.writeHead(code, {
        location: to,
        'content-type': 'text/plain; charset=utf-8',
      });
      res.end(`redirecting (${code}) to ${to}`);
      return;
    }

    // --- redirect chain: /redirect/chain?hops=3 ----------------------
    if (pathname === '/redirect/chain') {
      const hops = toInt(target.searchParams.get('hops'), 3, 0, 20);
      if (hops > 0) {
        res.writeHead(302, {
          location: `/redirect/chain?hops=${hops - 1}`,
          'content-type': 'text/plain; charset=utf-8',
        });
        res.end(`redirecting, ${hops} hops left`);
      } else {
        sendJson(res, 200, { done: true, path: '/redirect/chain' });
      }
      return;
    }

    // --- slow endpoint: /slow?ms=2000 -------------------------------
    if (pathname === '/slow') {
      const ms = toInt(target.searchParams.get('ms'), 1_000, 0, MAX_SLOW_MS);
      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        sendJson(res, 200, { slow: true, waitedMs: ms });
      }, ms);
      pendingTimers.add(timer);
      // Client aborts (timeout/cancel) must not leave the timer pending.
      res.on('close', () => {
        clearTimeout(timer);
        pendingTimers.delete(timer);
      });
      return;
    }

    // --- large payload: /large?bytes=50000 --------------------------
    if (pathname === '/large') {
      const bytes = toInt(target.searchParams.get('bytes'), 65_536, 1, MAX_LARGE_BYTES);
      const payload = Buffer.alloc(bytes, 0x41); // 'A'
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': String(payload.length),
      });
      res.end(payload);
      return;
    }

    // --- everything else --------------------------------------------
    sendJson(res, 404, { error: 'not found', path: pathname });
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    // Loopback only — never bind on a routable interface.
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === 'string') {
    throw new Error('test server did not report an ephemeral TCP port');
  }
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let closed = false;
  return {
    port,
    baseUrl,
    url(path: string): string {
      return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    },
    requests,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Node >= 19 keeps keep-alive sockets open; destroy them explicitly
        // so `close()` resolves immediately and vitest sees no open handles.
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
      });
    },
  };
}

/**
 * Reserve a loopback port and release it again, so tests can target a
 * connection that is guaranteed to be refused.
 */
export async function getUnusedPort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === 'string') {
    throw new Error('probe server did not report an ephemeral TCP port');
  }
  const port = address.port;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  });
  return port;
}

export { DEFAULT_TIMEOUT_MS };
