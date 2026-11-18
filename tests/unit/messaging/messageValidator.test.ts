/**
 * Unit tests for the webview message boundary — `validateWebviewMessage`
 * (envelope + payload branches) and `validateRequestDraft`.
 */
import { describe, it, expect } from 'vitest';
import {
  validateWebviewMessage,
  validateRequestDraft,
} from '../../../src/messaging/MessageValidator';
import { createEmptyRequest } from '../../../src/types/Request';
import { PAGE_IDS } from '../../../src/types/Messages';

describe('validateWebviewMessage — envelope', () => {
  it('rejects non-object messages', () => {
    expect(validateWebviewMessage('msg')).toEqual({ ok: false, error: 'Message must be an object.' });
    expect(validateWebviewMessage(null)).toEqual({ ok: false, error: 'Message must be an object.' });
    expect(validateWebviewMessage(42)).toEqual({ ok: false, error: 'Message must be an object.' });
    expect(validateWebviewMessage([{ id: 'm1', type: 'app.getState' }])).toEqual({
      ok: false,
      error: 'Message must be an object.',
    });
  });

  it('rejects a missing, empty or non-string id', () => {
    expect(validateWebviewMessage({ type: 'app.getState' })).toEqual({
      ok: false,
      error: 'Message id is missing or invalid.',
    });
    expect(validateWebviewMessage({ id: '', type: 'app.getState' })).toEqual({
      ok: false,
      error: 'Message id is missing or invalid.',
    });
    expect(validateWebviewMessage({ id: 7, type: 'app.getState' })).toEqual({
      ok: false,
      error: 'Message id is missing or invalid.',
    });
    expect(validateWebviewMessage({ id: 'm'.repeat(129), type: 'app.getState' })).toEqual({
      ok: false,
      error: 'Message id is missing or invalid.',
    });
  });

  it('rejects unknown message types', () => {
    expect(validateWebviewMessage({ id: 'm1', type: 'totally.bogus' })).toEqual({
      ok: false,
      error: 'Unknown message type "totally.bogus".',
    });
    expect(validateWebviewMessage({ id: 'm1', type: 'APP.GETSTATE' }).error).toBe(
      'Unknown message type "APP.GETSTATE".',
    );
    expect(validateWebviewMessage({ id: 'm1', type: 123 }).error).toBe('Unknown message type "123".');
  });

  it('rejects an array payload', () => {
    expect(validateWebviewMessage({ id: 'm1', type: 'app.getState', data: [1, 2, 3] })).toEqual({
      ok: false,
      error: 'Message data must be an object.',
    });
  });
});

describe('validateWebviewMessage — app branches', () => {
  it('app.navigate requires a valid page id', () => {
    const ok = validateWebviewMessage({ id: 'm1', type: 'app.navigate', data: { page: 'collections' } });
    expect(ok.ok).toBe(true);
    expect(ok.message).toEqual({ type: 'app.navigate', payload: { page: 'collections' } });

    const bad = validateWebviewMessage({ id: 'm2', type: 'app.navigate', data: { page: 'dashboard' } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('app.navigate: invalid page id');

    const missing = validateWebviewMessage({ id: 'm3', type: 'app.navigate', data: {} });
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe('app.navigate: invalid page id');
  });

  it('app.init accepts an optional page', () => {
    const noPage = validateWebviewMessage({ id: 'm1', type: 'app.init' });
    expect(noPage.ok).toBe(true);
    expect(noPage.message?.payload).toEqual({});

    const withPage = validateWebviewMessage({ id: 'm2', type: 'app.init', data: { page: 'history' } });
    expect(withPage.ok).toBe(true);
    expect(withPage.message?.payload).toEqual({ page: 'history' });

    const badPage = validateWebviewMessage({ id: 'm3', type: 'app.init', data: { page: 'nope' } });
    expect(badPage.ok).toBe(false);
    expect(badPage.error).toBe('app.init: invalid page id');
  });

  it('every declared page id is accepted by app.navigate', () => {
    for (const page of PAGE_IDS) {
      const result = validateWebviewMessage({ id: 'm1', type: 'app.navigate', data: { page } });
      expect(result.ok).toBe(true);
      expect(result.message?.payload).toEqual({ page });
    }
  });

  it('parameterless messages normalize to an empty payload', () => {
    for (const type of ['app.getState', 'app.openSettings', 'collections.list', 'settings.get'] as const) {
      const result = validateWebviewMessage({ id: 'm1', type, data: { ignored: true } });
      expect(result.ok).toBe(true);
      expect(result.message).toEqual({ type, payload: {} });
    }
  });
});

describe('validateWebviewMessage — collections.create', () => {
  it('accepts a valid name with optional description', () => {
    const result = validateWebviewMessage({
      id: 'm1',
      type: 'collections.create',
      data: { name: 'My Collection', description: 'Docs' },
    });
    expect(result.ok).toBe(true);
    expect(result.message?.payload).toEqual({ name: 'My Collection', description: 'Docs' });
  });

  it('rejects a missing or non-string name', () => {
    expect(validateWebviewMessage({ id: 'm1', type: 'collections.create', data: {} }).error).toBe(
      'collections.create: name required',
    );
    expect(
      validateWebviewMessage({ id: 'm2', type: 'collections.create', data: { name: 42 } }).error,
    ).toBe('collections.create: name required');
    expect(
      validateWebviewMessage({ id: 'm3', type: 'collections.create', data: { name: 'x'.repeat(501) } })
        .error,
    ).toBe('collections.create: name required');
  });

  it('rejects an invalid description', () => {
    const result = validateWebviewMessage({
      id: 'm1',
      type: 'collections.create',
      data: { name: 'Ok', description: 7 },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('collections.create: invalid description');
  });
});

describe('validateWebviewMessage — request.formatJson', () => {
  it('accepts a text payload', () => {
    const result = validateWebviewMessage({
      id: 'm1',
      type: 'request.formatJson',
      data: { text: '{"a":1}' },
    });
    expect(result.ok).toBe(true);
    expect(result.message?.payload).toEqual({ text: '{"a":1}' });
  });

  it('rejects non-string text', () => {
    const result = validateWebviewMessage({ id: 'm1', type: 'request.formatJson', data: { text: 5 } });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('request.formatJson: text must be a string');
  });

  it('enforces the 5 MB text cap', () => {
    const tooBig = validateWebviewMessage({
      id: 'm1',
      type: 'request.formatJson',
      data: { text: 'a'.repeat(5_000_001) },
    });
    expect(tooBig.ok).toBe(false);
    expect(tooBig.error).toBe('request.formatJson: text must be a string');

    const atLimit = validateWebviewMessage({
      id: 'm2',
      type: 'request.formatJson',
      data: { text: 'a'.repeat(5_000_000) },
    });
    expect(atLimit.ok).toBe(true);
  });
});

describe('validateWebviewMessage — settings.update', () => {
  it('accepts an object patch', () => {
    const result = validateWebviewMessage({
      id: 'm1',
      type: 'settings.update',
      data: { patch: { theme: 'dark', limit: 10 } },
    });
    expect(result.ok).toBe(true);
    expect(result.message?.payload).toEqual({ patch: { theme: 'dark', limit: 10 } });
  });

  it('rejects a missing, array or scalar patch', () => {
    expect(validateWebviewMessage({ id: 'm1', type: 'settings.update', data: {} }).error).toBe(
      'settings.update: patch required',
    );
    expect(
      validateWebviewMessage({ id: 'm2', type: 'settings.update', data: { patch: [1, 2] } }).error,
    ).toBe('settings.update: patch required');
    expect(
      validateWebviewMessage({ id: 'm3', type: 'settings.update', data: { patch: 'x' } }).error,
    ).toBe('settings.update: patch required');
  });
});

describe('validateWebviewMessage — other payload branches', () => {
  it('history.clear requires confirm: true', () => {
    expect(validateWebviewMessage({ id: 'm1', type: 'history.clear', data: {} }).error).toBe(
      'history.clear: confirm must be true',
    );
    const ok = validateWebviewMessage({ id: 'm2', type: 'history.clear', data: { confirm: true } });
    expect(ok.ok).toBe(true);
    expect(ok.message?.payload).toEqual({ confirm: true });
  });

  it('history.search normalizes a filter and rejects bad values', () => {
    const ok = validateWebviewMessage({
      id: 'm1',
      type: 'history.search',
      data: { search: 'users', method: 'GET', statusGroup: 'success', limit: 25, bogus: 1 },
    });
    expect(ok.ok).toBe(true);
    expect(ok.message?.payload).toEqual({
      search: 'users',
      method: 'GET',
      statusGroup: 'success',
      limit: 25,
    });

    expect(
      validateWebviewMessage({ id: 'm2', type: 'history.search', data: { method: 'TRACE' } }).error,
    ).toBe('history.search: invalid method');
    expect(
      validateWebviewMessage({ id: 'm3', type: 'history.search', data: { statusGroup: 'weird' } })
        .error,
    ).toBe('history.search: invalid statusGroup');
  });

  it('tests.save requires an array of at most 200 tests', () => {
    expect(
      validateWebviewMessage({ id: 'm1', type: 'tests.save', data: { requestId: 'r1', tests: 'x' } })
        .error,
    ).toBe('tests.save: tests must be an array');
    expect(
      validateWebviewMessage({
        id: 'm2',
        type: 'tests.save',
        data: { requestId: 'r1', tests: new Array(201).fill({}) },
      }).error,
    ).toBe('tests.save: too many tests');
    const ok = validateWebviewMessage({
      id: 'm3',
      type: 'tests.save',
      data: { requestId: 'r1', tests: [{ id: 't1' }] },
    });
    expect(ok.ok).toBe(true);
    expect(ok.message?.payload).toEqual({ requestId: 'r1', tests: [{ id: 't1' }] });
  });
});

describe('validateRequestDraft', () => {
  it('accepts an empty request draft', () => {
    const draft = createEmptyRequest('req_draft', '2026-01-01T00:00:00.000Z');
    const result = validateRequestDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      id: 'req_draft',
      name: 'Untitled Request',
      method: 'GET',
      url: '',
      timeout: 30000,
      settings: { followRedirects: true, maxRedirects: 5 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const value = result.value as { params: unknown[]; headers: unknown[] };
    expect(value.params).toEqual([]);
    expect(value.headers).toEqual([]);
  });

  it('rejects a non-object draft', () => {
    expect(validateRequestDraft(null)).toEqual({ ok: false, error: 'request must be an object' });
    expect(validateRequestDraft('req')).toEqual({ ok: false, error: 'request must be an object' });
  });

  it('rejects a bad method', () => {
    const draft = { ...createEmptyRequest('r1'), method: 'TRACE' };
    expect(validateRequestDraft(draft)).toEqual({
      ok: false,
      error: 'unsupported method "TRACE"',
    });
  });

  it('rejects a non-string or over-long URL', () => {
    expect(validateRequestDraft({ ...createEmptyRequest('r1'), url: 123 })).toEqual({
      ok: false,
      error: 'request.url must be a string',
    });
    expect(validateRequestDraft({ ...createEmptyRequest('r1'), url: 'u'.repeat(8193) })).toEqual({
      ok: false,
      error: 'request.url must be a string',
    });
  });

  it('rejects a missing id and too many params/headers', () => {
    expect(validateRequestDraft({ ...createEmptyRequest(''), id: '' })).toEqual({
      ok: false,
      error: 'request.id required',
    });

    const manyRows = Array.from({ length: 501 }, (_, i) => ({ id: `p${i}`, key: 'k', value: 'v', enabled: true }));
    expect(validateRequestDraft({ ...createEmptyRequest('r1'), params: manyRows })).toEqual({
      ok: false,
      error: 'too many params/headers (max 500)',
    });
  });

  it('normalizes the draft and clamps the timeout', () => {
    const result = validateRequestDraft({
      ...createEmptyRequest('r1'),
      name: 'My Request',
      url: 'https://api.example.com/x',
      method: 'POST',
      timeout: 10,
      params: [{ key: 'page', value: '1' }, 'junk'],
      headers: [{ key: 'Accept', value: 'text/plain', enabled: false }, 42],
      body: { type: 'json', text: '{"a":1}' },
      authentication: { type: 'bearer', token: 'tok' },
      settings: { followRedirects: false },
    });

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      name: 'My Request',
      url: 'https://api.example.com/x',
      method: 'POST',
      timeout: 100,
      body: { type: 'json', text: '{"a":1}' },
      authentication: { type: 'bearer', token: 'tok' },
      settings: { followRedirects: false },
    });
    const value = result.value as {
      params: Array<{ id: string; key: string; value: string; enabled: boolean }>;
      headers: Array<{ key: string; enabled: boolean }>;
    };
    // Invalid rows are dropped, valid rows get ids and default enabled flags.
    expect(value.params).toHaveLength(1);
    expect(value.params[0]).toMatchObject({ key: 'page', value: '1', enabled: true });
    expect(value.params[0].id).toBeTruthy();
    expect(value.headers).toHaveLength(1);
    expect(value.headers[0]).toMatchObject({ key: 'Accept', enabled: false });
  });
});
