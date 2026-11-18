/**
 * End-to-end message protocol tests.
 *
 * Drives `services.router.handle({ id, type, data })` from a fully wired
 * `createServices()` container (vscode is aliased to the mock) with a
 * capturing transport, and asserts the `{ id, ok, data }` /
 * `{ id, ok: false, error }` reply envelopes plus unsolicited events.
 *
 * The HTTP-side `request.send` test targets a local loopback server only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMessageHarness, type MessageHarness } from '../helpers/messageHarness';
import { MessageRouter } from '../../src/messaging/MessageRouter';
import { createEmptyRequest } from '../../src/types/Request';
import type { Collection } from '../../src/types/Collection';
import type { AnyWebviewMessage, AppInitData } from '../../src/types/Messages';
import type { HttpResponseModel } from '../../src/types/Response';
import { MASK } from '../../src/security/RedactionManager';
import { cleanupTempDirs, createTempDir } from '../helpers/temp';
import { startTestServer, type TestServer } from '../helpers/server';

let server: TestServer;
let harness: MessageHarness;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupTempDirs();
});

beforeEach(async () => {
  harness?.detach();
  const directory = await createTempDir();
  harness = createMessageHarness(directory);
});

describe('message protocol (createServices + router)', () => {
  it('app.init returns the full init shape', async () => {
    const reply = await harness.send('app.init');

    expect(reply.ok).toBe(true);
    expect(reply.error).toBeUndefined();
    const data = reply.data as AppInitData;
    expect(data.page).toBe('welcome');
    expect(data.version).toBe('1.0.0');
    expect(data.collections).toEqual([]);
    expect(data.environments).toEqual([]);
    expect(data.activeEnvironmentId).toBe('');
    expect(data.historyCount).toBe(0);
    expect(data.draft).toBeNull();
    expect(data.capabilities).toEqual({ oauth2: true, multipart: true, testRuns: true });
    expect(data.settings).toMatchObject({ version: 2, activeEnvironmentId: '' });
    expect(typeof data.settings.updatedAt).toBe('string');
  });

  it('stores draft credentials in SecretStorage and returns only the mask', async () => {
    const request = createEmptyRequest('req_secret_draft');
    request.authentication = { type: 'bearer', token: 'draft-access-token' };

    const saved = await harness.send('app.saveDraft', { request });
    expect(saved.ok).toBe(true);

    const settings = await harness.services.storage.settings.get();
    const storedAuth = settings.draft?.authentication;
    expect(storedAuth?.type).toBe('bearer');
    if (storedAuth?.type !== 'bearer') throw new Error('Expected bearer authentication.');
    expect(storedAuth.token).toBe(MASK);
    expect(storedAuth.secretId).toBeTruthy();
    expect(JSON.stringify(settings)).not.toContain('draft-access-token');
    expect(await harness.services.credentials.get(storedAuth.secretId!)).toBe('draft-access-token');

    const initialized = await harness.send('app.init');
    expect(JSON.stringify(initialized.data)).not.toContain('draft-access-token');
  });

  it('migrates an older plaintext draft before returning app state', async () => {
    const request = createEmptyRequest('req_legacy_secret_draft');
    request.authentication = { type: 'bearer', token: 'legacy-access-token' };
    await harness.services.storage.settings.update({ draft: request });

    const initialized = await harness.send('app.init');
    const data = initialized.data as AppInitData;
    expect(JSON.stringify(data)).not.toContain('legacy-access-token');
    expect(data.draft?.authentication.type).toBe('bearer');
    if (data.draft?.authentication.type !== 'bearer') {
      throw new Error('Expected bearer authentication.');
    }
    expect(data.draft.authentication.token).toBe(MASK);
    expect(data.settings.draft?.authentication).toEqual(data.draft.authentication);
  });

  it('stores imported Postman credentials by reference before returning the collection', async () => {
    const content = JSON.stringify({
      info: { name: 'Imported API' },
      item: [
        {
          name: 'Get account',
          request: {
            method: 'GET',
            url: 'https://api.example.com/account',
            auth: { type: 'bearer', bearer: [{ key: 'token', value: 'postman-access-token' }] },
          },
        },
      ],
    });

    const imported = await harness.send('collections.import', {
      content,
      source: 'postman.json',
    });
    expect(imported.ok).toBe(true);

    const collection = (imported.data as { collection: Collection }).collection;
    const item = collection.items[0];
    if (item?.type !== 'request') throw new Error('Expected one imported request.');
    const auth = item.request.authentication;
    if (auth.type !== 'bearer') throw new Error('Expected bearer authentication.');
    expect(auth.token).toBe(MASK);
    if (!auth.secretId) throw new Error('Expected an opaque credential reference.');
    expect(JSON.stringify(imported.data)).not.toContain('postman-access-token');
    expect(await harness.services.credentials.get(auth.secretId)).toBe('postman-access-token');

    const stored = await harness.services.collections.get(collection.id);
    expect(JSON.stringify(stored)).not.toContain('postman-access-token');
  });

  it('runs the collections create → list → rename → delete lifecycle', async () => {
    const created = await harness.send('collections.create', { name: 'API Suite' });
    expect(created.ok).toBe(true);
    const collectionId = (created.data as { collection: { id: string; name: string } }).collection
      .id;
    expect(collectionId).toBeTruthy();

    const listed = await harness.send('collections.list');
    expect(listed.ok).toBe(true);
    const collections = (listed.data as { collections: Array<{ id: string; name: string }> })
      .collections;
    expect(collections.map((c) => c.id)).toContain(collectionId);

    const renamed = await harness.send('collections.rename', {
      collectionId,
      name: 'API Suite v2',
    });
    expect(renamed.ok).toBe(true);
    expect((renamed.data as { collection: { name: string } }).collection.name).toBe('API Suite v2');

    const deleted = await harness.send('collections.delete', { collectionId });
    expect(deleted.ok).toBe(true);
    expect(deleted.data).toEqual({ deleted: true });

    const after = await harness.send('collections.list');
    expect((after.data as { collections: unknown[] }).collections).toEqual([]);
  });

  it('preserves stored secrets when the UI echoes the display mask', async () => {
    const created = await harness.send('environments.create', { name: 'Staging' });
    expect(created.ok).toBe(true);
    const environmentId = (created.data as { environment: { id: string } }).environment.id;

    const upserted = await harness.send('environments.variable.upsert', {
      environmentId,
      variable: {
        id: '',
        key: 'api_token',
        value: 'super-secret-value',
        enabled: true,
        secret: true,
      },
    });
    expect(upserted.ok).toBe(true);
    const saved = (upserted.data as { variable: { id: string; value: string } }).variable;
    expect(saved.value).toBe('super-secret-value');
    const variableId = saved.id;
    expect(variableId).toBeTruthy();

    // The list view masks secret values for display.
    const list = await harness.send('environments.list');
    const listed = list.data as {
      environments: Array<{ id: string; variables: Array<{ id: string; value: string }> }>;
    };
    const masked = listed.environments
      .find((environment) => environment.id === environmentId)
      ?.variables.find((variable) => variable.id === variableId);
    expect(masked?.value).toBe(MASK);

    // Echoing the mask back must NOT overwrite the stored secret.
    const again = await harness.send('environments.variable.upsert', {
      environmentId,
      variable: { id: variableId, key: 'api_token', value: MASK, enabled: true, secret: true },
    });
    expect(again.ok).toBe(true);
    expect((again.data as { variable: { value: string } }).variable.value).toBe(
      'super-secret-value',
    );

    const stored = await harness.services.environments.get(environmentId);
    expect(stored).not.toBeNull();
    expect(stored!.variables.find((variable) => variable.id === variableId)?.value).toBe(
      'super-secret-value',
    );
  });

  it('updates settings and reads them back', async () => {
    const updated = await harness.send('settings.update', { patch: { lastPage: 'collections' } });
    expect(updated.ok).toBe(true);
    expect((updated.data as { settings: { lastPage?: string } }).settings.lastPage).toBe(
      'collections',
    );
    expect(harness.events).toContainEqual({
      type: 'event',
      name: 'settings.changed',
      data: expect.objectContaining({
        settings: expect.objectContaining({ lastPage: 'collections' }),
      }),
    });

    const got = await harness.send('settings.get');
    expect(got.ok).toBe(true);
    expect((got.data as { settings: { lastPage?: string } }).settings.lastPage).toBe('collections');
  });

  it('request.send executes against the local server and emits request.completed', async () => {
    const request = createEmptyRequest('req_e2e_1');
    request.name = 'Echo check';
    request.url = server.url('/echo');
    request.params = [{ id: 'p1', key: 'q', value: 'greedcon', enabled: true }];

    const reply = await harness.send('request.send', { request });
    expect(reply.ok).toBe(true);

    const data = reply.data as {
      response: HttpResponseModel | null;
      warnings: string[];
      variableIssues: unknown[];
    };
    expect(data.response).not.toBeNull();
    expect(data.response!.status).toBe(200);
    expect(data.response!.requestId).toBe('req_e2e_1');
    expect(data.warnings).toEqual([]);

    const payload = JSON.parse(data.response!.body) as {
      method: string;
      query: Record<string, string>;
    };
    expect(payload.method).toBe('GET');
    expect(payload.query).toEqual({ q: 'greedcon' });

    // Unsolicited events captured during the send.
    expect(harness.events.some((event) => event.name === 'request.started')).toBe(true);
    const completed = harness.events.find((event) => event.name === 'request.completed');
    expect(completed).toBeDefined();
    const completedData = completed!.data as {
      requestId: string;
      response: HttpResponseModel | null;
    };
    expect(completedData.requestId).toBe('req_e2e_1');
    expect(completedData.response?.status).toBe(200);

    const phases = harness.events
      .filter((event) => event.name === 'request.progress')
      .map((event) => (event.data as { phase: string }).phase);
    expect(phases).toEqual(['resolving', 'authenticating', 'building', 'sending']);
  });

  it('redacts custom API-key query credentials from history and webview responses', async () => {
    const request = createEmptyRequest('req_query_secret');
    request.name = 'Authenticated echo';
    request.url = server.url('/echo');
    request.authentication = {
      type: 'apiKey',
      key: 'tenant',
      value: 'private-tenant-key',
      placement: 'query',
    };

    const reply = await harness.send('request.send', { request });
    expect(reply.ok).toBe(true);
    const data = reply.data as { response: HttpResponseModel | null };
    expect(data.response?.finalUrl).not.toContain('private-tenant-key');
    expect(data.response?.body).not.toContain('private-tenant-key');
    expect(data.response?.body).toContain(MASK);

    const entries = await harness.services.history.search();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).not.toContain('private-tenant-key');
    expect(entries[0].finalUrl).toContain('«redacted»');
    expect(entries[0].body).toContain(MASK);
  });

  it('formats and validates JSON payloads', async () => {
    const formatted = await harness.send('request.formatJson', { text: '{"a":1,"b":[2,3]}' });
    expect(formatted.ok).toBe(true);
    const formattedData = formatted.data as { text: string; ok: boolean };
    expect(formattedData.ok).toBe(true);
    expect(formattedData.text).toContain('"a": 1');
    expect(formattedData.text).toContain('"b": [\n');

    const broken = await harness.send('request.formatJson', { text: '{ not json' });
    const brokenData = broken.data as { text: string; ok: boolean; error?: string };
    expect(brokenData.ok).toBe(false);
    expect(brokenData.text).toBe('{ not json');
    expect(brokenData.error).toBeTruthy();

    const valid = await harness.send('request.validateJson', { text: '{"x":1}' });
    expect(valid.data).toEqual({ ok: true });

    const invalid = await harness.send('request.validateJson', { text: 'definitely not json' });
    const invalidData = invalid.data as { ok: boolean; error?: string };
    expect(invalidData.ok).toBe(false);
    expect(invalidData.error).toBeTruthy();
  });

  it('rejects invalid message shapes with INVALID_MESSAGE', async () => {
    // Valid type, missing required field.
    const missingName = await harness.send('collections.create', {});
    expect(missingName.ok).toBe(false);
    expect(missingName.error?.code).toBe('INVALID_MESSAGE');
    expect(missingName.error?.message).toContain('collections.create');

    // Unknown message type.
    const unknownType = await harness.send('definitely.not.a.type', {});
    expect(unknownType.ok).toBe(false);
    expect(unknownType.error?.code).toBe('INVALID_MESSAGE');
    expect(unknownType.error?.message).toContain('Unknown message type');

    // data must be an object, not an array.
    const arrayData = await harness.send('collections.list', [1, 2, 3]);
    expect(arrayData.ok).toBe(false);
    expect(arrayData.error?.code).toBe('INVALID_MESSAGE');
  });

  it('returns an error envelope for an unregistered handler', async () => {
    const outbound: AnyWebviewMessage[] = [];
    const router = new MessageRouter({ post: (message) => outbound.push(message) });

    // Valid message type, but this router has no handlers registered.
    await router.handle({ id: 'standalone_1', type: 'settings.get', data: {} });

    expect(outbound).toHaveLength(1);
    expect(outbound[0]).toEqual({
      id: 'standalone_1',
      ok: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'No handler for "settings.get".' },
    });
  });

  it('router.emit reaches the transport as { type: event, name, data }', async () => {
    harness.services.router.emit('toast', { level: 'info', message: 'Saved' });

    expect(harness.events).toContainEqual({
      type: 'event',
      name: 'toast',
      data: { level: 'info', message: 'Saved' },
    });
    const toast = harness.events.find((event) => event.name === 'toast');
    expect(toast).toEqual({
      type: 'event',
      name: 'toast',
      data: { level: 'info', message: 'Saved' },
    });
  });
});
