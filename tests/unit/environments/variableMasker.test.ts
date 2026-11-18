/**
 * Unit tests for variable masking/validation — secret values must be masked
 * before they leave the extension host.
 */
import { describe, it, expect } from 'vitest';
import {
  validateVariableKey,
  validateVariable,
  looksSensitive,
  maskValue,
  maskVariable,
  maskVariables,
  sensitiveVariableKeys,
} from '../../../src/environments/VariableMasker';
import type { EnvironmentVariable } from '../../../src/types/Environment';

function variable(overrides: Partial<EnvironmentVariable> = {}): EnvironmentVariable {
  return {
    id: 'var_1',
    key: 'host',
    value: 'api.example.com',
    enabled: true,
    ...overrides,
  };
}

describe('validateVariableKey', () => {
  it('accepts typical keys', () => {
    expect(validateVariableKey('host')).toBeNull();
    expect(validateVariableKey('API_TOKEN')).toBeNull();
    expect(validateVariableKey('base-url')).toBeNull();
    expect(validateVariableKey('v1')).toBeNull();
  });

  it('rejects empty and whitespace-only keys', () => {
    expect(validateVariableKey('')).toMatchObject({ key: '', message: expect.stringContaining('required') });
    expect(validateVariableKey('   ')).toMatchObject({ message: expect.stringContaining('required') });
  });

  it('rejects keys with spaces or braces', () => {
    expect(validateVariableKey('my key')).toMatchObject({ message: expect.stringContaining('start with a letter') });
    expect(validateVariableKey('{{x}}')).not.toBeNull();
    expect(validateVariableKey('1host')).not.toBeNull();
  });

  it('rejects over-long keys', () => {
    expect(validateVariableKey('k'.repeat(257))).toMatchObject({ message: expect.stringContaining('too long') });
    expect(validateVariableKey('k'.repeat(256))).toBeNull();
  });

  it('rejects keys containing {{ }} that would nest references', () => {
    expect(validateVariableKey('a{{b}}c')).not.toBeNull();
  });

  it('allows dots, dashes and underscores after the first character', () => {
    expect(validateVariableKey('a.b-c_d')).toBeNull();
  });
});

describe('validateVariable', () => {
  it('accepts a well-formed variable', () => {
    expect(validateVariable(variable())).toBeNull();
  });

  it('rejects a missing key', () => {
    expect(validateVariable(variable({ key: '' }))).toMatchObject({ message: expect.stringContaining('required') });
  });

  it('accepts an empty value (placeholder for later input)', () => {
    expect(validateVariable(variable({ value: '' }))).toBeNull();
  });

  it('leaves values unconstrained (secrets can be long)', () => {
    expect(validateVariable(variable({ value: 'x'.repeat(100_000) }))).toBeNull();
  });
});

describe('looksSensitive', () => {
  it('flags secret-looking keys', () => {
    expect(looksSensitive('token')).toBe(true);
    expect(looksSensitive('auth_token')).toBe(true);
    expect(looksSensitive('PASSWORD')).toBe(true);
    expect(looksSensitive('clientSecret')).toBe(true);
    expect(looksSensitive('api-key')).toBe(true);
  });

  it('ignores ordinary keys', () => {
    expect(looksSensitive('host')).toBe(false);
    expect(looksSensitive('region')).toBe(false);
    expect(looksSensitive('userId')).toBe(false);
  });
});

describe('maskValue / maskVariable', () => {
  it('masks a non-empty value', () => {
    expect(maskValue('super-secret-value')).toBe('••••••••');
  });

  it('leaves an empty value empty (nothing to hide)', () => {
    expect(maskValue('')).toBe('');
  });

  it('masks variables explicitly flagged as secret', () => {
    const sensitive = maskVariable(variable({ key: 'API_TOKEN', value: 'abc123', secret: true }));
    expect(sensitive.value).toBe('••••••••');
    expect(sensitive.key).toBe('API_TOKEN');
    expect(sensitive.enabled).toBe(true);
    expect(sensitive.secret).toBe(true);
  });

  it('leaves non-secret variables untouched, even sensitive-looking keys', () => {
    // Masking is driven by the explicit `secret` flag so ordinary values
    // stay visible while editing.
    const plain = maskVariable(variable({ key: 'host', value: 'api.example.com' }));
    expect(plain.value).toBe('api.example.com');
    const unflagged = maskVariable(variable({ key: 'API_TOKEN', value: 'visible' }));
    expect(unflagged.value).toBe('visible');
  });

  it('does not mutate the input variable', () => {
    const input = variable({ key: 'token', value: 'abc', secret: true });
    maskVariable(input);
    expect(input.value).toBe('abc');
  });

  it('masks a list of variables', () => {
    const masked = maskVariables([
      variable({ key: 'token', value: 'secret', secret: true }),
      variable({ key: 'host', value: 'api.test' }),
    ]);
    expect(masked[0].value).toBe('••••••••');
    expect(masked[1].value).toBe('api.test');
  });

  it('masks an empty list', () => {
    expect(maskVariables([])).toEqual([]);
  });
});

describe('sensitiveVariableKeys', () => {
  it('returns keys that are secret or look sensitive', () => {
    const keys = sensitiveVariableKeys([
      variable({ id: '1', key: 'token', value: 'a' }),
      variable({ id: '2', key: 'host', value: 'b' }),
      variable({ id: '3', key: 'password', value: 'c' }),
      variable({ id: '4', key: 'region', value: 'd', secret: true }),
    ]);
    expect(keys).toEqual(['token', 'password', 'region']);
  });

  it('returns an empty list when nothing is sensitive', () => {
    expect(sensitiveVariableKeys([variable({ key: 'host' })])).toEqual([]);
  });
});
