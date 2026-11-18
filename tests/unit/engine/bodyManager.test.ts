/**
 * Unit tests for request body building — every body type, multipart file
 * error handling and size estimation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { buildBody, isMultipartBody, estimateBodyBytes } from '../../../src/engine/BodyManager';
import type { RequestBody } from '../../../src/types/Request';

let tempDir = '';
let existingFile = '';

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'greedcon-body-'));
  existingFile = path.join(tempDir, 'sample.txt');
  await fs.writeFile(existingFile, 'file-content', 'utf8');
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('buildBody', () => {
  it('returns no body for type "none"', async () => {
    const result = await buildBody({ type: 'none' });
    expect(result).toEqual({ body: null, contentType: null, errors: [] });
  });

  it('builds a JSON body with a default content type', async () => {
    const body: RequestBody = { type: 'json', text: '{"a":1}' };
    const result = await buildBody(body);
    expect(result.body?.toString('utf8')).toBe('{"a":1}');
    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.errors).toEqual([]);
  });

  it('honours an explicit content type override', async () => {
    const result = await buildBody({
      type: 'json',
      text: '{}',
      contentType: 'application/vnd.api+json',
    });
    expect(result.contentType).toBe('application/vnd.api+json');
  });

  it('defaults to an empty string when text is missing', async () => {
    const result = await buildBody({ type: 'text' });
    expect(result.body?.toString('utf8')).toBe('');
    expect(result.contentType).toMatch(/^text\/plain/);
  });

  it('builds an XML body', async () => {
    const result = await buildBody({ type: 'xml', text: '<root/>' });
    expect(result.body?.toString('utf8')).toBe('<root/>');
    expect(result.contentType).toMatch(/^application\/xml/);
  });

  it('serializes form-urlencoded rows, skipping disabled and blank keys', async () => {
    const result = await buildBody({
      type: 'formUrlEncoded',
      formParams: [
        { id: '1', key: 'a', value: '1', enabled: true },
        { id: '2', key: 'b', value: 'skip', enabled: false },
        { id: '3', key: '  ', value: 'blank', enabled: true },
        { id: '4', key: 'c', value: 'x y&z', enabled: true },
      ],
    });
    expect(result.body?.toString('utf8')).toBe('a=1&c=x+y%26z');
    expect(result.contentType).toMatch(/^application\/x-www-form-urlencoded/);
  });

  it('builds a multipart body with text parts', async () => {
    const result = await buildBody({
      type: 'multipart',
      multipartParts: [
        { id: '1', name: 'field', value: 'value', kind: 'text', enabled: true },
        { id: '2', name: 'skipped', value: 'x', kind: 'text', enabled: false },
      ],
    });
    const text = result.body?.toString('utf8') ?? '';
    expect(result.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(text).toContain('Content-Disposition: form-data; name="field"');
    expect(text).toContain('value');
    expect(text).not.toContain('name="skipped"');
    expect(text.trimEnd().endsWith('--')).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports a missing file path instead of sending an empty part', async () => {
    const result = await buildBody({
      type: 'multipart',
      multipartParts: [{ id: '1', name: 'file', value: '  ', kind: 'file', enabled: true }],
    });
    expect(result.errors[0]).toMatch(/has no file path/);
    expect(result.body?.toString('utf8')).toContain('--');
  });

  it('reports an unreadable file instead of throwing', async () => {
    const result = await buildBody({
      type: 'multipart',
      multipartParts: [
        { id: '1', name: 'file', value: '/nonexistent/path/xyz.bin', kind: 'file', enabled: true },
      ],
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/could not be read/);
  });

  it('embeds existing file contents', async () => {
    const result = await buildBody({
      type: 'multipart',
      multipartParts: [
        { id: '1', name: 'upload', value: existingFile, kind: 'file', enabled: true },
      ],
    });
    const text = result.body?.toString('utf8') ?? '';
    expect(text).toContain('file-content');
    expect(text).toContain('filename="sample.txt"');
    expect(result.errors).toEqual([]);
  });

  it('skips multipart parts without a name', async () => {
    const result = await buildBody({
      type: 'multipart',
      multipartParts: [
        { id: '1', name: '   ', value: 'x', kind: 'text', enabled: true },
      ],
    });
    expect(result.errors[0]).toMatch(/without a name/);
  });

  it('escapes quotes and newlines in disposition names', async () => {
    const result = await buildBody({
      type: 'multipart',
      multipartParts: [
        { id: '1', name: 'na"me\r\n', value: 'v', kind: 'text', enabled: true },
      ],
    });
    const text = result.body?.toString('utf8') ?? '';
    expect(text).not.toContain('na"me');
    expect(text).toContain('name="na_me__"');
  });

  it('rejects unknown body types with an error rather than throwing', async () => {
    const result = await buildBody({ type: 'weird' } as unknown as RequestBody);
    expect(result.body).toBeNull();
    expect(result.errors).toHaveLength(1);
  });
});

describe('isMultipartBody', () => {
  it('is true only for multipart with at least one enabled part', () => {
    expect(
      isMultipartBody({
        type: 'multipart',
        multipartParts: [{ id: '1', name: 'a', value: 'b', kind: 'text', enabled: true }],
      }),
    ).toBe(true);
    expect(
      isMultipartBody({
        type: 'multipart',
        multipartParts: [{ id: '1', name: 'a', value: 'b', kind: 'text', enabled: false }],
      }),
    ).toBe(false);
    expect(isMultipartBody({ type: 'multipart' })).toBe(false);
    expect(isMultipartBody({ type: 'json', text: '{}' })).toBe(false);
  });
});

describe('estimateBodyBytes', () => {
  it('returns 0 for no body', async () => {
    expect(await estimateBodyBytes({ type: 'none' })).toBe(0);
  });

  it('measures raw text bodies', async () => {
    expect(await estimateBodyBytes({ type: 'json', text: '{"a":1}' })).toBe(7);
    expect(await estimateBodyBytes({ type: 'text', text: 'héllo' })).toBe(6);
  });

  it('measures form bodies from enabled rows only', async () => {
    const size = await estimateBodyBytes({
      type: 'formUrlEncoded',
      formParams: [
        { id: '1', key: 'a', value: '1', enabled: true },
        { id: '2', key: 'b', value: '2', enabled: false },
      ],
    });
    expect(size).toBe('a=1'.length);
  });

  it('is a close approximation of the real multipart body', async () => {
    const body: RequestBody = {
      type: 'multipart',
      multipartParts: [
        { id: '1', name: 'field', value: 'value', kind: 'text', enabled: true },
      ],
    };
    const estimate = await estimateBodyBytes(body);
    const actual = (await buildBody(body)).body?.length ?? 0;
    expect(estimate).toBeGreaterThan(0);
    // The estimate accounts for name + part overhead; it must be within a
    // small factor of the real size (never wildly wrong).
    expect(estimate).toBeLessThanOrEqual(actual + 100);
    expect(estimate).toBeGreaterThan(actual / 2);
  });
});
