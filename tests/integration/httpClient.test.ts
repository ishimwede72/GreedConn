/**
 * Integration tests for `src/engine/HttpClient.ts`.
 *
 * Every request targets a local `node:http` server bound to 127.0.0.1 on an
 * ephemeral port (see tests/helpers/server.ts) — no external hosts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/engine/HttpClient';
import { classifyNetworkError } from '../../src/engine/NetworkErrorHandler';
import { getUnusedPort, startTestServer, type TestServer } from '../helpers/server';

const client = new HttpClient();
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

interface EchoPayload {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

function echoOf(body: Buffer): EchoPayload {
  return JSON.parse(body.toString('utf8')) as EchoPayload;
}

/** Await a promise that must reject, returning the thrown error. */
async function expectRejection(promise: Promise<unknown>): Promise<Error & { code?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error('Expected the request to be rejected, but it resolved.');
}

describe('HttpClient (loopback integration)', () => {
  it('performs a GET and captures status, headers and query', async () => {
    const response = await client.send({
      method: 'GET',
      url: server.url('/echo?foo=bar&n=2'),
      headers: { 'x-custom': 'abc-123' },
      timeoutMs: 5000,
    });

    expect(response.status).toBe(200);
    expect(response.statusText).toBeTruthy();
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.truncated).toBe(false);
    expect(response.redirectCount).toBe(0);
    expect(response.finalUrl).toBe(server.url('/echo?foo=bar&n=2'));
    expect(response.responseTimeMs).toBeGreaterThan(0);

    const payload = echoOf(response.body);
    expect(payload.method).toBe('GET');
    expect(payload.path).toBe('/echo');
    expect(payload.query).toEqual({ foo: 'bar', n: '2' });
    expect(payload.headers['x-custom']).toBe('abc-123');
    expect(payload.body).toBe('');
  });

  it('POSTs a body and echoes it back with its headers', async () => {
    const response = await client.send({
      method: 'POST',
      url: server.url('/echo'),
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('hello body', 'utf8'),
      timeoutMs: 5000,
    });

    expect(response.status).toBe(200);
    const payload = echoOf(response.body);
    expect(payload.method).toBe('POST');
    expect(payload.body).toBe('hello body');
    expect(payload.headers['content-type']).toBe('text/plain');
    expect(payload.headers['content-length']).toBe('10');
  });

  it('captures fixed status codes without throwing', async () => {
    const response = await client.send({
      method: 'GET',
      url: server.url('/status/418'),
      headers: {},
      timeoutMs: 5000,
    });

    expect(response.status).toBe(418);
    expect(response.statusText).toBeTruthy();
    expect(response.headers['x-status-code']).toBe('418');
    expect(response.rawHeaders.some((line) => line.toLowerCase().startsWith('x-status-code:'))).toBe(
      true,
    );
    expect(response.body.toString('utf8')).toBe('status 418');
  });

  it('follows a 302 redirect to the echo endpoint', async () => {
    const hops: string[] = [];
    const response = await client.send({
      method: 'GET',
      url: server.url('/redirect?code=302&to=/echo'),
      headers: {},
      timeoutMs: 5000,
      onRedirect: (_from, to) => hops.push(to),
    });

    expect(response.status).toBe(200);
    expect(response.redirectCount).toBe(1);
    expect(response.finalUrl).toBe(server.url('/echo'));
    expect(hops).toEqual([server.url('/echo')]);
    expect(echoOf(response.body).method).toBe('GET');
  });

  it('downgrades POST to GET on 303 redirects', async () => {
    const response = await client.send({
      method: 'POST',
      url: server.url('/redirect?code=303&to=/echo'),
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('discard me', 'utf8'),
      timeoutMs: 5000,
    });

    expect(response.status).toBe(200);
    const payload = echoOf(response.body);
    expect(payload.method).toBe('GET');
    expect(payload.body).toBe('');
    expect(payload.headers['content-type']).toBeUndefined();
    expect(response.redirectCount).toBe(1);
  });

  it('downgrades POST to GET on 301 and 302 redirects (browser parity)', async () => {
    for (const code of [301, 302]) {
      const response = await client.send({
        method: 'POST',
        url: server.url(`/redirect?code=${code}&to=/echo`),
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('discard me', 'utf8'),
        timeoutMs: 5000,
      });

      expect(response.status).toBe(200);
      const payload = echoOf(response.body);
      expect(payload.method).toBe('GET');
      expect(payload.body).toBe('');
      expect(payload.headers['content-type']).toBeUndefined();
      expect(response.redirectCount).toBe(1);
    }
  });

  it('preserves method and body across a 307 redirect', async () => {
    const response = await client.send({
      method: 'POST',
      url: server.url('/redirect?code=307&to=/echo'),
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from('keep me', 'utf8'),
      timeoutMs: 5000,
    });

    expect(response.status).toBe(200);
    const payload = echoOf(response.body);
    expect(payload.method).toBe('POST');
    expect(payload.body).toBe('keep me');
    expect(payload.headers['content-type']).toBe('text/plain');
    expect(response.redirectCount).toBe(1);
  });

  it('stops following a redirect chain at maxRedirects', async () => {
    const response = await client.send({
      method: 'GET',
      url: server.url('/redirect/chain?hops=5'),
      headers: {},
      timeoutMs: 5000,
      maxRedirects: 2,
    });

    expect(response.status).toBe(302);
    expect(response.redirectCount).toBe(2);
    expect(response.headers['location']).toBe('/redirect/chain?hops=2');
  });

  it('does not follow any redirect when maxRedirects is 0', async () => {
    const response = await client.send({
      method: 'GET',
      url: server.url('/redirect?code=301&to=/echo'),
      headers: {},
      timeoutMs: 5000,
      followRedirects: true,
      maxRedirects: 0,
    });

    expect(response.status).toBe(301);
    expect(response.redirectCount).toBe(0);
    expect(response.headers['location']).toBe('/echo');
    expect(response.finalUrl).toBe(server.url('/redirect?code=301&to=/echo'));
  });

  it('returns the redirect unfollowed when the URL policy forbids the target', async () => {
    const before = server.requests.length;
    const response = await client.send({
      method: 'GET',
      url: server.url('/redirect?code=302&to=/echo'),
      headers: {},
      timeoutMs: 5000,
      urlPolicy: {
        allowPrivateNetwork: false,
        allowHttpsToHttpRedirect: false,
        maxUrlLength: 8192,
      },
    });

    expect(response.status).toBe(302);
    expect(response.redirectCount).toBe(0);
    expect(response.headers['location']).toBe('/echo');
    expect(response.finalUrl).toBe(server.url('/redirect?code=302&to=/echo'));
    // Only the initial request reached the server — /echo was never hit.
    expect(server.requests.slice(before)).toHaveLength(1);
    expect(server.requests[before]?.path).toBe('/redirect');
  });

  it('times out against the slow endpoint and classifies the error', async () => {
    const error = await expectRejection(
      client.send({
        method: 'GET',
        url: server.url('/slow?ms=3000'),
        headers: {},
        timeoutMs: 250,
      }),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ETIMEDOUT');
    expect(error.message).toMatch(/timed out/i);
    const classified = classifyNetworkError(error);
    expect(classified.category).toBe('timeout');
    expect(classified.code).toBe('ETIMEDOUT');
  });

  it('truncates responses that exceed maxResponseBytes', async () => {
    const response = await client.send({
      method: 'GET',
      url: server.url('/large?bytes=40000'),
      headers: {},
      timeoutMs: 5000,
      maxResponseBytes: 5000,
    });

    expect(response.status).toBe(200);
    expect(response.truncated).toBe(true);
    expect(response.body.length).toBe(5000);
    expect(response.body.toString('utf8')).toBe('A'.repeat(5000));
  });

  it('cancels an in-flight request through an AbortSignal', async () => {
    const controller = new AbortController();
    const pending = client.send({
      method: 'GET',
      url: server.url('/slow?ms=5000'),
      headers: {},
      timeoutMs: 0,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);

    const error = await expectRejection(pending);
    expect(error.code).toBe('ABORT_ERR');
    expect(classifyNetworkError(error).category).toBe('cancelled');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await expectRejection(
      client.send({
        method: 'GET',
        url: server.url('/echo'),
        headers: {},
        timeoutMs: 0,
        signal: controller.signal,
      }),
    );
    expect(error.code).toBe('ABORT_ERR');
    expect(classifyNetworkError(error).category).toBe('cancelled');
  });

  it('rejects with ECONNREFUSED when nothing listens on the port', async () => {
    const port = await getUnusedPort();
    const error = await expectRejection(
      client.send({
        method: 'GET',
        url: `http://127.0.0.1:${port}/echo`,
        headers: {},
        timeoutMs: 5000,
      }),
    );

    expect(error.code).toBe('ECONNREFUSED');
    expect(error.message).toMatch(/refused/i);
    const classified = classifyNetworkError(error);
    expect(classified.category).toBe('connection');
    expect(classified.code).toBe('ECONNREFUSED');
  });
});
