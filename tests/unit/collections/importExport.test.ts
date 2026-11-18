/**
 * Unit tests for collection export/import — the Greedcon native format
 * (round-trip + redaction + detection) and the Postman v2.1 importer.
 */
import { describe, it, expect } from 'vitest';
import { CollectionExporter } from '../../../src/collections/CollectionExporter';
import { CollectionImporter } from '../../../src/collections/CollectionImporter';
import {
  detect as detectGreedcon,
  parse as parseGreedcon,
  serializeCollection,
  GREEDCON_FORMAT_ID,
  GREEDCON_FORMAT_VERSION,
} from '../../../src/collections/formats/GreedconFormat';
import { detect as detectPostman, parse as parsePostman } from '../../../src/collections/formats/PostmanImporter';
import { importRegistry } from '../../../src/collections/formats/ImportFormatRegistry';
import { MASK } from '../../../src/security/RedactionManager';
import { createEmptyRequest } from '../../../src/types/Request';
import type { Collection } from '../../../src/types/Collection';
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
    name: 'Round Trip',
    description: 'Exported for tests',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: 2,
    items: [
      {
        type: 'folder',
        id: 'fld_1',
        name: 'Users',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [
          {
            type: 'request',
            id: 'itm_1',
            name: 'Get Users',
            request: makeRequest({
              headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
              params: [{ id: 'p1', key: 'page', value: '1', enabled: true }],
              body: { type: 'json', text: '{"hello":"world"}' },
              timeout: 5000,
              settings: { followRedirects: false, maxRedirects: 3 },
            }),
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        type: 'request',
        id: 'itm_2',
        name: 'Health',
        request: makeRequest({ id: 'itm_2_req', name: 'Health', url: 'https://api.example.com/health' }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const POSTMAN_FIXTURE = {
  info: {
    name: 'Postman Sample',
    description: 'A sample collection',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'Folder A',
      item: [
        {
          name: 'Get Users',
          request: {
            method: 'GET',
            url: 'https://api.example.com/users',
            header: [{ key: 'Accept', value: 'application/json' }],
          },
        },
        {
          name: 'Create User',
          request: {
            method: 'POST',
            url: {
              raw: 'https://api.example.com/users?page=1',
              protocol: 'https',
              host: ['api', 'example', 'com'],
              path: ['users'],
              query: [{ key: 'page', value: '1', description: 'page number' }],
            },
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'X-Disabled', value: '1', disabled: true },
            ],
            body: {
              mode: 'raw',
              raw: '{"name":"Ada"}',
              options: { raw: { language: 'json' } },
            },
            auth: { type: 'bearer', bearer: [{ key: 'token', value: 'pmf-token-xyz' }] },
          },
        },
      ],
    },
    {
      name: 'Status Check',
      request: {
        method: 'GET',
        url: { protocol: 'https', host: 'example.org', path: ['status'] },
      },
    },
  ],
};

describe('Greedcon export/import round-trip', () => {
  it('exports a versioned envelope with a sanitized file name', () => {
    const exporter = new CollectionExporter();
    const result = exporter.export(makeCollection());

    expect(result.format).toBe(GREEDCON_FORMAT_ID);
    expect(result.fileName).toBe('Round Trip.greedcon.json');
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    expect(parsed['format']).toBe('greedcon-collection');
    expect(parsed['version']).toBe(GREEDCON_FORMAT_VERSION);
    expect(Number.isNaN(Date.parse(String(parsed['exportedAt'])))).toBe(false);
    expect(typeof parsed['collection']).toBe('object');
  });

  it('rejects unsupported export formats', () => {
    const exporter = new CollectionExporter();
    expect(() => exporter.export(makeCollection(), 'postman')).toThrow(
      'Unsupported export format "postman".',
    );
    expect(exporter.supportedFormats()).toEqual(['greedcon-collection']);
  });

  it('round-trips structure through export → import', () => {
    const exporter = new CollectionExporter();
    const importer = new CollectionImporter();
    const source = makeCollection();

    const { content } = exporter.export(source);
    const result = importer.import(content);

    expect(result.format).toBe('greedcon-collection');
    expect(result.warnings).toEqual([]);
    expect(result.preservedUnknownFields).toBe(0);

    const imported = result.collection;
    expect(imported.name).toBe(source.name);
    expect(imported.description).toBe(source.description);
    expect(imported.version).toBe(2);
    // A fresh collection id is always assigned on import.
    expect(imported.id).not.toBe(source.id);
    expect(imported.id).toMatch(/^col_/);
    expect(imported.items).toEqual(source.items);
  });

  it('detects greedcon vs postman envelopes', () => {
    const greedconContent = serializeCollection(makeCollection());
    const postmanContent = JSON.stringify(POSTMAN_FIXTURE);

    expect(detectGreedcon(greedconContent)).toBe(true);
    expect(detectGreedcon(postmanContent)).toBe(false);
    expect(detectGreedcon('not json')).toBe(false);
    expect(detectGreedcon('[1,2]')).toBe(false);

    expect(detectPostman(postmanContent)).toBe(true);
    expect(detectPostman(greedconContent)).toBe(false);
    expect(detectPostman('nope')).toBe(false);

    expect(importRegistry.detect(greedconContent)?.id).toBe('greedcon');
    expect(importRegistry.detect(postmanContent)?.id).toBe('postman-v2.1');
    expect(importRegistry.detect('totally unrelated content')).toBeNull();
  });

  it('preserves request fields across the round-trip', () => {
    const source = makeCollection();
    const item = source.items[0];
    if (item.type !== 'folder') throw new Error('expected folder');
    const imported = parseGreedcon(serializeCollection(source)).collection;
    const importedFolder = imported.items[0];
    if (importedFolder.type !== 'folder') throw new Error('expected folder');
    const request = importedFolder.items[0];
    if (request.type !== 'request') throw new Error('expected request');

    expect(request.request).toEqual(
      (item.items[0] as { request: HttpRequestModel }).request,
    );
    expect(request.request.timeout).toBe(5000);
    expect(request.request.body).toEqual({ type: 'json', text: '{"hello":"world"}' });
    expect(request.request.settings).toEqual({ followRedirects: false, maxRedirects: 3 });
    expect(request.request.params).toEqual([{ id: 'p1', key: 'page', value: '1', enabled: true }]);
    expect(request.request.headers).toEqual([{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }]);
  });
});

describe('export redaction', () => {
  it('masks sensitive fields (password/token) in the exported JSON', () => {
    const collection = makeCollection({
      items: [
        {
          type: 'request',
          id: 'itm_sec',
          name: 'Login',
          request: makeRequest({
            id: 'itm_sec_req',
            name: 'Login',
            url: 'https://api.example.com/login',
            authentication: { type: 'basic', username: 'admin', password: 'Sup3rSecret!' },
          }),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'request',
          id: 'itm_tok',
          name: 'Private',
          request: makeRequest({
            id: 'itm_tok_req',
            name: 'Private',
            url: 'https://api.example.com/private',
            authentication: { type: 'bearer', token: 'tok-1234567890' },
          }),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const { content } = new CollectionExporter().export(collection);
    expect(content).not.toContain('Sup3rSecret!');
    expect(content).not.toContain('tok-1234567890');
    expect(content).toContain(MASK);

    const imported = new CollectionImporter().import(content).collection;
    const login = imported.items[0];
    const priv = imported.items[1];
    if (login.type !== 'request' || priv.type !== 'request') throw new Error('expected requests');
    expect(login.request.authentication).toEqual({ type: 'basic', username: 'admin', password: MASK });
    expect(priv.request.authentication).toEqual({ type: 'bearer', token: MASK });
  });

  it('warns when the document is newer than the supported version', () => {
    const envelope = JSON.parse(serializeCollection(makeCollection())) as Record<string, unknown>;
    envelope['version'] = 99;
    const result = parseGreedcon(JSON.stringify(envelope));
    expect(result.collection.name).toBe('Round Trip');
    expect(result.warnings.some((w) => w.includes('newer than supported version 2'))).toBe(true);
  });

  it('throws a descriptive error for invalid greedcon documents', () => {
    expect(() => parseGreedcon('not json at all')).toThrow(/^Invalid JSON:/);
    expect(() => parseGreedcon('[1,2]')).toThrow('Not a Greedcon collection document.');
    expect(() => parseGreedcon('{"format":"other"}')).toThrow(
      'Not a Greedcon collection document (format field mismatch).',
    );
    expect(() => parseGreedcon('{"format":"greedcon-collection"}')).toThrow(
      /^Collection validation failed:/,
    );
  });
});

describe('Postman v2.1 import', () => {
  it('maps folders, requests, urls, headers, body and auth', () => {
    const result = parsePostman(JSON.stringify(POSTMAN_FIXTURE));

    expect(result.format).toBe('postman-v2.1');
    expect(result.collection.name).toBe('Postman Sample');
    expect(result.collection.description).toContain('A sample collection');
    expect(result.collection.version).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.preservedUnknownFields).toBe(0);

    const [folder, status] = result.collection.items;
    if (folder.type !== 'folder') throw new Error('expected folder');
    expect(folder.name).toBe('Folder A');
    if (status.type !== 'request') throw new Error('expected request');

    // String URL form.
    const getUsers = folder.items[0];
    if (getUsers.type !== 'request') throw new Error('expected request');
    expect(getUsers.request.method).toBe('GET');
    expect(getUsers.request.url).toBe('https://api.example.com/users');
    expect(getUsers.request.params).toEqual([]);
    expect(getUsers.request.headers).toHaveLength(1);
    expect(getUsers.request.headers[0]).toMatchObject({
      key: 'Accept',
      value: 'application/json',
      enabled: true,
    });
    expect(getUsers.request.headers[0].id).toMatch(/^header_/);
    expect(getUsers.request.authentication).toEqual({ type: 'none' });

    // Object URL form (raw wins, query params extracted).
    const createUser = folder.items[1];
    if (createUser.type !== 'request') throw new Error('expected request');
    expect(createUser.request.method).toBe('POST');
    expect(createUser.request.url).toBe('https://api.example.com/users?page=1');
    expect(createUser.request.params).toHaveLength(1);
    expect(createUser.request.params[0]).toMatchObject({
      key: 'page',
      value: '1',
      description: 'page number',
      enabled: true,
    });
    expect(createUser.request.params[0].id).toMatch(/^param_/);
    expect(createUser.request.headers.map((h) => [h.key, h.enabled])).toEqual([
      ['Content-Type', true],
      ['X-Disabled', false],
    ]);
    expect(createUser.request.body).toEqual({ type: 'json', text: '{"name":"Ada"}' });
    expect(createUser.request.authentication).toEqual({ type: 'bearer', token: 'pmf-token-xyz' });
    expect(createUser.request.timeout).toBe(30000);

    // Object URL without raw: protocol/host/path assembled.
    expect(status.request.url).toBe('https://example.org/status');
    expect(status.request.params).toEqual([]);
    expect(status.request.body).toEqual({ type: 'none' });
  });

  it('preserves unsupported top-level fields in the description with warnings', () => {
    const withExtras = { ...POSTMAN_FIXTURE, myCustomField: 'x', anotherUnknown: 1 };
    const result = parsePostman(JSON.stringify(withExtras));
    expect(result.preservedUnknownFields).toBe(2);
    expect(result.warnings.some((w) => w.includes('Preserved 2 unsupported top-level field(s)'))).toBe(true);
    expect(result.collection.description).toContain('Preserved from import (unsupported fields)');
    expect(result.collection.description).toContain('myCustomField');
  });

  it('warns about unsupported auth types instead of guessing', () => {
    const doc = {
      info: { name: 'Auth Sample' },
      item: [
        {
          name: 'Weird Auth',
          request: { method: 'GET', url: 'https://x.test', auth: { type: 'oauth1' } },
        },
      ],
    };
    const result = parsePostman(JSON.stringify(doc));
    const item = result.collection.items[0];
    if (item.type !== 'request') throw new Error('expected request');
    expect(item.request.authentication).toEqual({ type: 'none' });
    expect(result.warnings).toContain('Request "Weird Auth": unsupported auth type "oauth1" ignored.');
  });

  it('throws when the document has no item array', () => {
    expect(() => parsePostman('{"info":{"name":"x"}}')).toThrow('Postman collection has no "item" array.');
    expect(() => parsePostman('not json')).toThrow(/^Invalid JSON:/);
    expect(() => parsePostman('[1,2]')).toThrow('Not a Postman collection document.');
  });
});

describe('CollectionImporter', () => {
  it('lists both supported formats', () => {
    const formats = new CollectionImporter().supportedFormats();
    expect(formats.map((f) => f.id)).toEqual(['greedcon', 'postman-v2.1']);
    for (const format of formats) {
      expect(format.displayName.length).toBeGreaterThan(0);
      expect(format.extensions.length).toBeGreaterThan(0);
    }
  });

  it('imports greedcon content through the registry', () => {
    const content = serializeCollection(makeCollection());
    const result = new CollectionImporter().import(content);
    expect(result.format).toBe('greedcon-collection');
    expect(result.collection.name).toBe('Round Trip');
  });

  it('imports postman content through auto-detection', () => {
    const result = new CollectionImporter().import(JSON.stringify(POSTMAN_FIXTURE));
    expect(result.format).toBe('postman-v2.1');
    expect(result.collection.items).toHaveLength(2);
  });

  it('throws a descriptive error for unsupported content', () => {
    const importer = new CollectionImporter();
    expect(() => importer.import('this is not a collection')).toThrow(
      'Unrecognized collection format. Supported formats: Greedcon collection (v2), Postman Collection v2.1.',
    );
    expect(() => importer.import('{"just":"a random object"}')).toThrow(
      /Unrecognized collection format/,
    );
  });

  it('throws for empty content', () => {
    const importer = new CollectionImporter();
    expect(() => importer.import('')).toThrow('The selected file is empty.');
    expect(() => importer.import('   \n\t ')).toThrow('The selected file is empty.');
  });

  it('enforces the size limit', () => {
    const importer = new CollectionImporter();
    expect(() => importer.import('x'.repeat(2048), { maxBytes: 1024 })).toThrow(/import limit/);
  });

  it('honours a forced format id', () => {
    const importer = new CollectionImporter();
    const postmanContent = JSON.stringify(POSTMAN_FIXTURE);
    expect(importer.import(postmanContent, { formatId: 'postman-v2.1' }).format).toBe('postman-v2.1');
  });
});
