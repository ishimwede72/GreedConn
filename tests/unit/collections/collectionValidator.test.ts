/**
 * Unit tests for collection validation — `validateCollection` for whole
 * documents and `validateRequestModel` for individual request shapes.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCollection,
  validateRequestModel,
} from '../../../src/collections/CollectionValidator';
import { createEmptyRequest } from '../../../src/types/Request';
import type { Collection, FolderItem, RequestItem } from '../../../src/types/Collection';
import type { HttpRequestModel } from '../../../src/types/Request';

function makeRequest(overrides: Partial<HttpRequestModel> = {}): HttpRequestModel {
  return {
    ...createEmptyRequest('itm_req1', '2026-01-01T00:00:00.000Z'),
    name: 'Get Users',
    url: 'https://api.example.com/users',
    ...overrides,
  };
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col_1',
    name: 'My API',
    description: 'Test collection',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: 2,
    items: [
      {
        type: 'request',
        id: 'itm_1',
        name: 'Get Users',
        request: makeRequest(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('validateCollection', () => {
  it('accepts a valid document and preserves its fields', () => {
    const result = validateCollection(makeCollection());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.value).toBeDefined();
    expect(result.value?.id).toBe('col_1');
    expect(result.value?.name).toBe('My API');
    expect(result.value?.description).toBe('Test collection');
    expect(result.value?.version).toBe(2);
    expect(result.value?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.value?.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(result.value?.items).toHaveLength(1);
    expect(result.value?.items[0].type).toBe('request');
  });

  it('defaults version to 2 and timestamps to now when missing', () => {
    const result = validateCollection({ id: 'col_1', name: 'Bare' });
    expect(result.ok).toBe(true);
    expect(result.value?.version).toBe(2);
    expect(Number.isNaN(Date.parse(result.value?.createdAt ?? ''))).toBe(false);
    expect(Number.isNaN(Date.parse(result.value?.updatedAt ?? ''))).toBe(false);
    expect(result.value?.items).toEqual([]);
  });

  it('rejects non-object documents', () => {
    for (const bad of [null, undefined, 'collection', 42, []]) {
      const result = validateCollection(bad);
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(['Collection must be an object.']);
    }
  });

  it('reports missing id and name', () => {
    const result = validateCollection({ items: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'Collection "id" is missing or invalid.',
      'Collection "name" is missing or invalid.',
    ]);
    expect(result.value).toBeUndefined();
  });

  it('rejects a non-array items field', () => {
    const result = validateCollection({ id: 'c', name: 'N', items: { nope: true } });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['Collection "items" must be an array.']);
  });

  it('validates a nested folder/request tree', () => {
    const nested = makeCollection({
      items: [
        {
          type: 'folder',
          id: 'fld_1',
          name: 'Users',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          items: [
            {
              type: 'folder',
              id: 'fld_2',
              name: 'Inner',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              items: [
                {
                  type: 'request',
                  id: 'itm_deep',
                  name: 'Deep',
                  request: makeRequest({ id: 'itm_deep_req', name: 'Deep', url: 'https://x/deep' }),
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = validateCollection(nested);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    const folder = result.value?.items[0];
    expect(folder?.type).toBe('folder');
    if (folder?.type !== 'folder') throw new Error('expected folder');
    expect(folder.name).toBe('Users');
    expect(folder.items).toHaveLength(1);
    const inner = folder.items[0];
    if (inner.type !== 'folder') throw new Error('expected inner folder');
    expect(inner.items[0].type).toBe('request');
    if (inner.items[0].type !== 'request') throw new Error('expected request');
    expect(inner.items[0].request.url).toBe('https://x/deep');
  });

  it('skips non-object item entries with a warning', () => {
    const result = validateCollection({ id: 'c', name: 'N', items: ['junk', null, 7] });
    expect(result.ok).toBe(true);
    expect(result.value?.items).toEqual([]);
    expect(result.warnings).toEqual([
      'items[0]: non-object entry skipped.',
      'items[1]: non-object entry skipped.',
      'items[2]: non-object entry skipped.',
    ]);
  });

  it('preserves unknown item types as a request stub with a warning', () => {
    const result = validateCollection({
      id: 'c',
      name: 'N',
      items: [{ type: 'graphql', id: 'itm_x', name: 'GraphQL call', request: makeRequest({ id: 'itm_x_req' }) }],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      'items[0]: unknown item type "graphql" preserved as a request stub.',
    ]);
    const item = result.value?.items[0];
    expect(item?.type).toBe('request');
    if (item?.type !== 'request') throw new Error('expected request');
    expect(item.id).toBe('itm_x');
    expect(item.name).toBe('GraphQL call');
    expect(item.description).toContain('Preserved unsupported item (graphql)');
  });

  it('uses a fallback request when an unknown item has no request payload', () => {
    const result = validateCollection({ id: 'c', name: 'N', items: [{ type: 'mystery' }] });
    expect(result.ok).toBe(true);
    const item = result.value?.items[0];
    if (item?.type !== 'request') throw new Error('expected request');
    expect(item.request.method).toBe('GET');
    expect(item.request.name).toBe('Imported request');
    expect(item.description).toContain('Preserved unsupported item (mystery)');
  });

  it('generates a folder id and name when they are missing', () => {
    const result = validateCollection({ id: 'c', name: 'N', items: [{ type: 'folder' }] });
    expect(result.ok).toBe(true);
    const folder = result.value?.items[0];
    if (folder?.type !== 'folder') throw new Error('expected folder');
    expect(folder.id).toMatch(/^fld_/);
    expect(folder.name).toBe('Untitled Folder');
    expect(result.warnings).toEqual(['items[0]: folder id was missing and has been generated.']);
  });

  it('accumulates request-level errors inside items', () => {
    const result = validateCollection({
      id: 'c',
      name: 'N',
      items: [
        {
          type: 'request',
          id: 'itm_1',
          name: 'Bad rows',
          request: { ...makeRequest(), headers: [{ nope: true }], params: [{ nope: true }] },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.value?.items[0].type).toBe('request');
    if (result.value?.items[0].type !== 'request') throw new Error('expected request');
    expect(result.value.items[0].request.headers).toEqual([]);
    expect(result.value.items[0].request.params).toEqual([]);
    // params are normalized before headers inside validateRequestModel
    expect(result.warnings).toEqual([
      'items[0].request: some params rows were invalid and skipped.',
      'items[0].request: some headers rows were invalid and skipped.',
    ]);
  });
});

describe('validateRequestModel', () => {
  it('normalizes a minimal request into a complete model', () => {
    const model = validateRequestModel({ method: 'POST', url: 'https://x.test' }, 'req');
    expect(model).not.toBeNull();
    expect(model?.id).toMatch(/^itm_/);
    expect(model?.name).toBe('Untitled Request');
    expect(model?.method).toBe('POST');
    expect(model?.url).toBe('https://x.test');
    expect(model?.params).toEqual([]);
    expect(model?.headers).toEqual([]);
    expect(model?.body).toEqual({ type: 'none' });
    expect(model?.authentication).toEqual({ type: 'none' });
    expect(model?.timeout).toBe(30000);
    expect(model?.settings).toEqual({ followRedirects: true });
    expect(Number.isNaN(Date.parse(model?.createdAt ?? ''))).toBe(false);
  });

  it('warns and falls back to GET for an unsupported method', () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const model = validateRequestModel({ method: 'TRACE', url: 'https://x.test' }, 'req', errors, warnings);
    expect(model?.method).toBe('GET');
    expect(warnings).toEqual(['req: unsupported method "TRACE" normalized to GET.']);
    expect(errors).toEqual([]);
  });

  it('drops an over-long URL', () => {
    const model = validateRequestModel({ method: 'GET', url: 'u'.repeat(8193) }, 'req');
    expect(model?.url).toBe('');
  });

  it('keeps a URL at the size limit', () => {
    const model = validateRequestModel({ method: 'GET', url: 'u'.repeat(8192) }, 'req');
    expect(model?.url).toBe('u'.repeat(8192));
  });

  it('skips invalid header rows with a warning', () => {
    const warnings: string[] = [];
    const model = validateRequestModel(
      { method: 'GET', url: 'https://x.test', headers: [{ key: 1, value: 2 }, 'junk'] },
      'req',
      [],
      warnings,
    );
    expect(model?.headers).toEqual([]);
    expect(warnings).toEqual(['req: some headers rows were invalid and skipped.']);
  });

  it('keeps valid header rows and stays quiet when at least one survives', () => {
    const warnings: string[] = [];
    const model = validateRequestModel(
      { method: 'GET', url: '', headers: [{ key: 1, value: 2 }, { key: 'Accept', value: 'text/plain', enabled: false }] },
      'req',
      [],
      warnings,
    );
    expect(model?.headers).toHaveLength(1);
    expect(model?.headers[0]).toMatchObject({ key: 'Accept', value: 'text/plain', enabled: false });
    expect(warnings).toEqual([]);
  });

  it('rejects non-object requests (with a warning when one was provided)', () => {
    expect(validateRequestModel('nope', 'req')).toBeNull();
    expect(validateRequestModel(undefined, 'req')).toBeNull();

    const warnings: string[] = [];
    expect(validateRequestModel(42, 'req', [], warnings)).toBeNull();
    expect(warnings).toEqual(['req: request is not an object; skipped.']);
  });

  it('clamps the timeout into [100, 600000]', () => {
    expect(validateRequestModel({ method: 'GET', url: '', timeout: 5 }, 'req')?.timeout).toBe(100);
    expect(validateRequestModel({ method: 'GET', url: '', timeout: 9_999_999 }, 'req')?.timeout).toBe(600000);
    expect(validateRequestModel({ method: 'GET', url: '', timeout: 5000 }, 'req')?.timeout).toBe(5000);
  });

  it('normalizes unknown body and auth types with warnings', () => {
    const warnings: string[] = [];
    const model = validateRequestModel(
      { method: 'GET', url: '', body: { type: 'graphql', text: '{ x }' }, authentication: { type: 'digest' } },
      'req',
      [],
      warnings,
    );
    expect(model?.body.type).toBe('none');
    expect(model?.authentication).toEqual({ type: 'none' });
    expect(warnings).toEqual([
      'req: unknown body type "graphql" normalized to none.',
      'req: unknown auth type "digest" ignored.',
    ]);
  });

  it('keeps a known body shape', () => {
    const model = validateRequestModel(
      {
        method: 'POST',
        url: '',
        body: { type: 'json', text: '{"a":1}', contentType: 'application/json' },
        authentication: { type: 'bearer', token: 'tok', prefix: 'Token' },
      },
      'req',
    );
    expect(model?.body).toEqual({ type: 'json', text: '{"a":1}', contentType: 'application/json' });
    expect(model?.authentication).toEqual({ type: 'bearer', token: 'tok', prefix: 'Token' });
  });

  it('coerces a full HttpRequestModel through unchanged', () => {
    const source = makeRequest({
      headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
      params: [{ id: 'p1', key: 'page', value: '1', enabled: true }],
      body: { type: 'text', text: 'hello' },
      timeout: 1234,
      settings: { followRedirects: false, maxRedirects: 3 },
    });
    const model = validateRequestModel(source, 'req');
    expect(model).not.toBeNull();
    expect(model).toMatchObject({
      id: 'itm_req1',
      name: 'Get Users',
      method: 'GET',
      url: 'https://api.example.com/users',
      timeout: 1234,
      settings: { followRedirects: false, maxRedirects: 3 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(model?.headers).toEqual(source.headers);
    expect(model?.params).toEqual(source.params);
    expect(model?.body).toEqual(source.body);
  });
});

describe('collection item type guards', () => {
  it('discriminates folders from requests', () => {
    const collection = makeCollection();
    const item = collection.items[0];
    expect(item.type).toBe('request');
    const folder: FolderItem = {
      type: 'folder',
      id: 'fld',
      name: 'F',
      items: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const request: RequestItem = collection.items[0] as RequestItem;
    expect(folder.type).toBe('folder');
    expect(request.request.method).toBe('GET');
  });
});
