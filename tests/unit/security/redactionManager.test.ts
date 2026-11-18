/**
 * Unit tests for redaction — secrets must never reach history, logs or
 * exported files.
 */
import { describe, it, expect } from 'vitest';
import {
  MASK,
  isSensitiveKey,
  redactByKey,
  redactHeadersForDisplay,
  redactHeadersForStorage,
  redactObject,
  redactKnownSecrets,
  redactQuerySecrets,
} from '../../../src/security/RedactionManager';
import { redactString, redactUrl } from '../../../src/utils/Logger';

describe('URL secret redaction', () => {
  it('masks standard secret query parameters in strings and URLs', () => {
    expect(redactString('GET https://api.test/items?access_token=secret123&limit=5')).toBe(
      'GET https://api.test/items?access_token=«redacted»&limit=5',
    );
    expect(redactUrl('https://api.test/items?api_key=secret123&limit=5')).toBe(
      'https://api.test/items?api_key=«redacted»&limit=5',
    );
  });

  it('masks custom API-key query names without hiding ordinary parameters', () => {
    expect(redactUrl('https://api.test/items?tenant=acme&signature=secret123', ['tenant'])).toBe(
      'https://api.test/items?tenant=«redacted»&signature=«redacted»',
    );
  });

  it('removes reflected query credentials from response text', () => {
    expect(
      redactQuerySecrets(
        '{"query":{"tenant":"top-secret-value","page":"2"}}',
        ['https://api.test/items?tenant=top-secret-value&page=2'],
        ['tenant'],
      ),
    ).toBe('{"query":{"tenant":"••••••••","page":"2"}}');
  });
});

describe('isSensitiveKey', () => {
  it('matches secret-looking keys', () => {
    expect(isSensitiveKey('token')).toBe(true);
    expect(isSensitiveKey('accessToken')).toBe(true);
    expect(isSensitiveKey('client_secret')).toBe(true);
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('API_KEY')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
    expect(isSensitiveKey('credential')).toBe(true);
  });

  it('ignores ordinary keys', () => {
    expect(isSensitiveKey('username')).toBe(false);
    expect(isSensitiveKey('url')).toBe(false);
    expect(isSensitiveKey('content-type')).toBe(false);
    expect(isSensitiveKey('id')).toBe(false);
  });
});

describe('redactByKey', () => {
  it('masks sensitive keys', () => {
    expect(redactByKey('password', 'hunter2')).toBe(MASK);
    expect(redactByKey('token', 'abc')).toBe(MASK);
  });

  it('passes non-sensitive values through', () => {
    expect(redactByKey('name', 'Ada')).toBe('Ada');
  });
});

describe('redactHeadersForDisplay', () => {
  it('masks sensitive headers and keeps others', () => {
    const result = redactHeadersForDisplay({
      authorization: 'Bearer secret',
      'content-type': 'application/json',
      'x-api-key': 'key-123',
      'x-request-id': 'req-1',
    });
    expect(result.authorization).toBe(MASK);
    expect(result['x-api-key']).toBe(MASK);
    expect(result['content-type']).toBe('application/json');
    expect(result['x-request-id']).toBe('req-1');
  });
});

describe('redactHeadersForStorage', () => {
  it('stores a presence marker for sensitive headers only', () => {
    const result = redactHeadersForStorage({
      Authorization: 'Bearer supersecret',
      'Set-Cookie': 'session=abc',
      'Content-Type': 'application/json',
    });
    expect(result.Authorization).toBe(MASK);
    expect(result['Set-Cookie']).toBe(MASK);
    expect(result['Content-Type']).toBe('application/json');
    // The raw secret must be gone entirely.
    expect(JSON.stringify(result)).not.toContain('supersecret');
    expect(JSON.stringify(result)).not.toContain('session=abc');
  });
});

describe('redactObject', () => {
  it('masks sensitive string fields recursively', () => {
    const result = redactObject({
      name: 'My API',
      password: 'hunter2',
      nested: { clientSecret: 'shh', label: 'ok' },
      list: [{ refreshToken: 'r1' }, { plain: 'keep' }],
    });

    expect(result.password).toBe(MASK);
    expect(result.nested.clientSecret).toBe(MASK);
    expect(result.nested.label).toBe('ok');
    expect(result.list[0].refreshToken).toBe(MASK);
    expect(result.list[1].plain).toBe('keep');
    expect(result.name).toBe('My API');
  });

  it('masks values in exported query rows with secret-looking names', () => {
    const result = redactObject({
      params: [
        { key: 'api_key', value: 'private-query-key', enabled: true },
        { key: 'page', value: '3', enabled: true },
      ],
    });
    expect(result.params[0].value).toBe(MASK);
    expect(result.params[1].value).toBe('3');
  });

  it('leaves non-string values untouched even for sensitive keys', () => {
    const result = redactObject({ tokenExpiry: 12345, enabled: true });
    expect(result.tokenExpiry).toBe(12345);
    expect(result.enabled).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(redactObject('text')).toBe('text');
    expect(redactObject(42)).toBe(42);
    expect(redactObject(null)).toBeNull();
    expect(redactObject(undefined)).toBeUndefined();
  });

  it('does not mutate the input object', () => {
    const input = { password: 'hunter2' };
    const result = redactObject(input);
    expect(input.password).toBe('hunter2');
    expect(result.password).toBe(MASK);
  });
});

describe('redactKnownSecrets', () => {
  it('replaces occurrences of known secret values', () => {
    const result = redactKnownSecrets('connecting with abc12345 now', ['abc12345']);
    expect(result).not.toContain('abc12345');
    expect(result).toContain(MASK);
  });

  it('ignores secrets shorter than 4 characters', () => {
    const result = redactKnownSecrets('ab cd', ['ab']);
    expect(result).toBe('ab cd');
  });

  it('ignores empty and non-string entries', () => {
    expect(redactKnownSecrets('text', ['', null as unknown as string])).toBe('text');
  });

  it('replaces every occurrence', () => {
    const result = redactKnownSecrets('tok=SECRET1 and tok=SECRET1', ['SECRET1']);
    expect(result.split(MASK).length).toBe(3);
  });
});
