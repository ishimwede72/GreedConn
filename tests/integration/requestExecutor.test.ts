/**
 * Integration tests for `src/engine/RequestExecutor.ts` — the full
 * validate → resolve variables → auth → build → send → parse pipeline
 * against a loopback `node:http` server (no external hosts).
 *
 * The harness mirrors production wiring (see src/services/GreedconServices.ts):
 * real EnvironmentManager over JsonStorage in a temp dir, AuthenticationManager
 * with a CredentialStore backed by the fake SecretStorage from the vscode mock,
 * and SecurityManager (defaults come from the mocked vscode configuration).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RequestExecutor } from '../../src/engine/RequestExecutor';
import { HttpClient } from '../../src/engine/HttpClient';
import { CancellationManager } from '../../src/engine/CancellationManager';
import { AuthenticationManager } from '../../src/authentication/AuthenticationManager';
import { CredentialStore } from '../../src/authentication/CredentialStore';
import { OAuth2Manager } from '../../src/authentication/OAuth2Auth';
import { SecretManager } from '../../src/security/SecretManager';
import { SecurityManager } from '../../src/security/SecurityManager';
import { EnvironmentManager } from '../../src/environments/EnvironmentManager';
import { EnvironmentRepository } from '../../src/environments/EnvironmentRepository';
import { JsonStorage } from '../../src/storage/JsonStorage';
import { SCHEMA_VERSION } from '../../src/types/Storage';
import { createEmptyRequest } from '../../src/types/Request';
import type { HttpRequestModel, KeyValueRow } from '../../src/types/Request';
import { __mock } from '../mocks/vscode.mock';
import { cleanupTempDirs, createTempDir } from '../helpers/temp';
import { getUnusedPort, startTestServer, type TestServer } from '../helpers/server';

interface EchoPayload {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

interface ExecutorHarness {
  executor: RequestExecutor;
  environments: EnvironmentManager;
  cancellation: CancellationManager;
}

let server: TestServer;
let directory: string;
let harness: ExecutorHarness;

/** Wire the executor exactly like GreedconServices does, minus the UI. */
function createExecutorHarness(storageDirectory: string): ExecutorHarness {
  const provider = new JsonStorage({ directory: storageDirectory, version: SCHEMA_VERSION, backups: 0 });
  const environments = new EnvironmentManager(new EnvironmentRepository(provider));
  const secrets = new SecretManager(__mock.createSecretStorage());
  const credentials = new CredentialStore(secrets);
  const oauth2 = new OAuth2Manager(credentials);
  const auth = new AuthenticationManager(credentials, oauth2);
  const security = new SecurityManager();
  const cancellation = new CancellationManager();
  const executor = new RequestExecutor(
    new HttpClient(),
    cancellation,
    auth,
    environments,
    security,
  );
  return { executor, environments, cancellation };
}

function row(key: string, value: string): KeyValueRow {
  return { id: `row_${key}`, key, value, enabled: true };
}

function makeRequest(url: string, method: HttpRequestModel['method'] = 'GET'): HttpRequestModel {
  const request = createEmptyRequest(`req_${Math.random().toString(36).slice(2, 12)}`);
  request.url = url;
  request.method = method;
  request.name = `${method} ${url}`;
  return request;
}

function echoOf(body: string): EchoPayload {
  return JSON.parse(body) as EchoPayload;
}

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupTempDirs();
});

beforeEach(async () => {
  directory = await createTempDir();
  harness = createExecutorHarness(directory);
});

describe('RequestExecutor (full pipeline)', () => {
  it('executes a GET and returns a parsed response with progress phases', async () => {
    const request = makeRequest(server.url('/echo'));
    request.params = [row('page', '1')];
    request.headers = [row('X-Trace', 'trace-123')];

    const phases: string[] = [];
    const outcome = await harness.executor.execute(request, {
      onProgress: (phase) => phases.push(phase),
    });

    expect(outcome.response).not.toBeNull();
    const response = outcome.response!;
    expect(response.status).toBe(200);
    expect(response.bodyKind).toBe('json');
    expect(response.contentType).toContain('application/json');
    expect(response.requestId).toBe(request.id);
    expect(response.error).toBeUndefined();
    expect(outcome.warnings).toEqual([]);
    expect(outcome.variableIssues).toEqual([]);
    expect(phases).toEqual(['resolving', 'authenticating', 'building', 'sending']);

    const payload = echoOf(response.body);
    expect(payload.method).toBe('GET');
    expect(payload.query).toEqual({ page: '1' });
    expect(payload.headers['x-trace']).toBe('trace-123');
  });

  it('builds and sends a POST with a JSON body', async () => {
    const request = makeRequest(server.url('/echo'), 'POST');
    request.body = { type: 'json', text: '{"name":"Ada"}' };

    const outcome = await harness.executor.execute(request);
    expect(outcome.response!.status).toBe(200);

    const payload = echoOf(outcome.response!.body);
    expect(payload.method).toBe('POST');
    expect(payload.body).toBe('{"name":"Ada"}');
    expect(payload.headers['content-type']).toContain('application/json');
  });

  it('returns response.error.code VALIDATION for an invalid URL without throwing', async () => {
    const request = makeRequest('ftp://files.example.com/secret.txt');

    const outcome = await harness.executor.execute(request);

    expect(outcome.response).not.toBeNull();
    expect(outcome.response!.status).toBe(0);
    expect(outcome.response!.bodyKind).toBe('error');
    expect(outcome.response!.error?.code).toBe('VALIDATION');
    expect(outcome.response!.error?.message).toMatch(/url/i);
  });

  it('returns status 0 with a real transport error for a closed port', async () => {
    const port = await getUnusedPort();
    const request = makeRequest(`http://127.0.0.1:${port}/echo`);

    const outcome = await harness.executor.execute(request);

    expect(outcome.response).not.toBeNull();
    expect(outcome.response!.status).toBe(0);
    expect(outcome.response!.error?.code).toBe('ECONNREFUSED');
    expect(outcome.response!.error?.message).toMatch(/refused/i);
    expect(outcome.response!.error?.aborted ?? false).toBe(false);
    expect(outcome.response!.error?.timeout ?? false).toBe(false);
  });

  it('resolves {{variable}} references from an environment into the URL', async () => {
    const environment = await harness.environments.create('Local');
    await harness.environments.upsertVariable(environment.id, {
      id: 'var_base_url',
      key: 'base_url',
      value: server.baseUrl,
      enabled: true,
    });

    const request = makeRequest('{{base_url}}/echo');
    request.params = [row('hello', 'world')];

    const outcome = await harness.executor.execute(request, { environmentId: environment.id });

    expect(outcome.response!.status).toBe(200);
    expect(outcome.response!.finalUrl).toBe(`${server.baseUrl}/echo?hello=world`);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.variableIssues).toEqual([]);

    const payload = echoOf(outcome.response!.body);
    expect(payload.path).toBe('/echo');
    expect(payload.query).toEqual({ hello: 'world' });
  });

  it('classifies a timeout as a timeout error on the response', async () => {
    const request = makeRequest(server.url('/slow?ms=3000'));
    request.timeout = 300;

    const outcome = await harness.executor.execute(request);

    expect(outcome.response!.status).toBe(0);
    expect(outcome.response!.error?.code).toBe('ETIMEDOUT');
    expect(outcome.response!.error?.timeout).toBe(true);
    expect(outcome.response!.responseTime).toBeGreaterThanOrEqual(250);
  });

  it('aborts an in-flight request through the CancellationManager', async () => {
    const request = makeRequest(server.url('/slow?ms=5000'));
    const pending = harness.executor.execute(request);
    setTimeout(() => harness.cancellation.cancel(request.id), 100);

    const outcome = await pending;

    expect(outcome.response!.status).toBe(0);
    expect(outcome.response!.error?.code).toBe('ABORT_ERR');
    expect(outcome.response!.error?.aborted).toBe(true);
  });
});
