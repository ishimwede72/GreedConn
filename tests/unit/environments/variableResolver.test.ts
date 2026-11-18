/**
 * Unit tests for {{variable}} resolution — precedence, missing/disabled
 * handling, nesting, cycles and malformed references.
 */
import { describe, it, expect } from 'vitest';
import {
  VariableResolver,
  extractVariableNames,
  findMissingVariables,
} from '../../../src/environments/VariableResolver';
import type { Environment, EnvironmentVariable } from '../../../src/types/Environment';
import { createEmptyRequest } from '../../../src/types/Request';

function variable(
  key: string,
  value: string,
  overrides: Partial<EnvironmentVariable> = {},
): EnvironmentVariable {
  return {
    id: `var_${key}`,
    key,
    value,
    enabled: true,
    ...overrides,
  };
}

function environment(id: string, variables: EnvironmentVariable[]): Environment {
  return {
    id,
    name: id,
    variables,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  };
}

function resolver(input: {
  envVars?: EnvironmentVariable[];
  globals?: EnvironmentVariable[];
  activeId?: string;
  environmentId?: string;
} = {}): VariableResolver {
  const env = environment('env_1', input.envVars ?? []);
  return new VariableResolver({
    environments: [env],
    globals: input.globals ?? [],
    activeEnvironmentId: input.activeId ?? 'env_1',
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
  });
}

describe('VariableResolver.resolve', () => {
  it('substitutes environment variables', () => {
    const r = resolver({ envVars: [variable('host', 'api.example.com')] });
    const result = r.resolve('https://{{host}}/v1');
    expect(result.value).toBe('https://api.example.com/v1');
    expect(result.issues).toEqual([]);
    expect(result.resolved).toEqual(['host']);
  });

  it('tolerates whitespace inside the braces', () => {
    const r = resolver({ envVars: [variable('token', 'abc')] });
    expect(r.resolve('Bearer {{ token }}').value).toBe('Bearer abc');
    expect(r.resolve('Bearer {{token}}').value).toBe('Bearer abc');
  });

  it('leaves the original text untouched when a variable is missing', () => {
    const r = resolver();
    const result = r.resolve('https://{{host}}/api');
    expect(result.value).toBe('https://{{host}}/api');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ reason: 'missing', variable: 'host', location: 'value' });
    expect(result.resolved).toEqual([]);
  });

  it('never substitutes the literal string "undefined"', () => {
    const r = resolver();
    expect(r.resolve('{{nope}}').value).not.toContain('undefined');
    expect(r.resolve('{{nope}}').value).toBe('{{nope}}');
  });

  it('reports disabled variables distinctly from missing ones', () => {
    const r = resolver({ envVars: [variable('flag', 'x', { enabled: false })] });
    const result = r.resolve('{{flag}}');
    expect(result.value).toBe('{{flag}}');
    expect(result.issues[0].reason).toBe('disabled');
  });

  it('prefers environment variables over globals with the same key', () => {
    const r = resolver({
      globals: [variable('key', 'from-global')],
      envVars: [variable('key', 'from-env')],
    });
    expect(r.resolve('{{key}}').value).toBe('from-env');
  });

  it('falls back to globals when the environment has no match', () => {
    const r = resolver({
      globals: [variable('key', 'from-global')],
      envVars: [],
    });
    expect(r.resolve('{{key}}').value).toBe('from-global');
  });

  it('ignores disabled globals', () => {
    const r = resolver({
      globals: [variable('key', 'x', { enabled: false })],
      envVars: [],
    });
    expect(r.resolve('{{key}}').issues[0].reason).toBe('disabled');
  });

  it('resolves values that reference other variables', () => {
    const r = resolver({
      envVars: [variable('base', 'https://api.example.com'), variable('baseUrl', '{{base}}/v2')],
    });
    const result = r.resolve('{{baseUrl}}/users');
    expect(result.value).toBe('https://api.example.com/v2/users');
    expect(result.issues).toEqual([]);
    expect(result.resolved).toContain('baseUrl');
    expect(result.resolved).toContain('base');
  });

  it('detects direct circular references and keeps the text', () => {
    const r = resolver({
      envVars: [variable('a', '{{b}}'), variable('b', '{{a}}')],
    });
    const result = r.resolve('{{a}}');
    expect(result.value).toBe('{{a}}');
    expect(result.issues.some((i) => i.reason === 'circular')).toBe(true);
  });

  it('detects self-referencing variables', () => {
    const r = resolver({ envVars: [variable('loop', '{{loop}}')] });
    const result = r.resolve('{{loop}}');
    expect(result.issues.some((i) => i.reason === 'circular')).toBe(true);
    expect(result.value).toBe('{{loop}}');
  });

  it('reports malformed unbalanced references', () => {
    const r = resolver({ envVars: [variable('a', 'x')] });
    const result = r.resolve('broken {{a and more');
    expect(result.issues.some((i) => i.reason === 'malformed')).toBe(true);
    expect(result.value).toBe('broken {{a and more');
  });

  it('treats single braces as plain text', () => {
    const r = resolver({ envVars: [variable('a', 'x')] });
    const result = r.resolve('css { color: red } and {{a}}');
    expect(result.value).toBe('css { color: red } and x');
    expect(result.issues).toEqual([]);
  });

  it('resolves multiple occurrences and reports each name once', () => {
    const r = resolver({ envVars: [variable('v', '1')] });
    const result = r.resolve('{{v}}-{{v}}-{{v}}');
    expect(result.value).toBe('1-1-1');
    expect(result.resolved).toEqual(['v']);
  });

  it('handles empty and non-string input gracefully', () => {
    const r = resolver();
    expect(r.resolve('')).toEqual({ value: '', issues: [], resolved: [] });
    expect(r.resolve(null as unknown as string).value).toBe('');
  });

  it('uses the provided location for issue reporting', () => {
    const r = resolver();
    expect(r.resolve('{{missing}}', 'headers.x.value').issues[0].location).toBe(
      'headers.x.value',
    );
  });

  it('resolves an empty reference name as malformed', () => {
    const r = resolver();
    const result = r.resolve('{{   }}');
    expect(result.issues[0].reason).toBe('malformed');
  });
});

describe('VariableResolver environment selection', () => {
  it('uses the active environment by default', () => {
    const r = new VariableResolver({
      environments: [
        environment('env_a', [variable('who', 'A')]),
        environment('env_b', [variable('who', 'B')]),
      ],
      globals: [],
      activeEnvironmentId: 'env_b',
    });
    expect(r.resolve('{{who}}').value).toBe('B');
  });

  it('honours a per-request environment override', () => {
    const r = resolver({
      envVars: [variable('who', 'A')],
      environmentId: 'env_other',
    });
    // Override points at an environment that does not exist → missing.
    expect(r.resolve('{{who}}').issues[0].reason).toBe('missing');
  });

  it('resolves nothing when there is no active environment but globals exist', () => {
    const r = new VariableResolver({
      environments: [],
      globals: [variable('g', 'global-value')],
      activeEnvironmentId: '',
    });
    expect(r.resolve('{{g}}').value).toBe('global-value');
    expect(r.resolve('{{g}}').issues).toEqual([]);
  });
});

describe('VariableResolver.resolveRequest', () => {
  it('resolves url, headers, params and body on a deep copy', () => {
    const r = resolver({
      envVars: [variable('host', 'api.test'), variable('tok', 'secret-1')],
    });
    const request = createEmptyRequest('req_1');
    request.url = 'https://{{host}}/x';
    request.headers = [
      { id: 'h1', key: 'Authorization', value: 'Bearer {{tok}}', enabled: true },
    ];
    request.params = [{ id: 'p1', key: 'page', value: '{{host}}', enabled: true }];
    request.body = { type: 'json', text: '{"host":"{{host}}"}' };

    const result = r.resolveRequest(request);

    expect(result.request.url).toBe('https://api.test/x');
    expect(result.request.headers[0].value).toBe('Bearer secret-1');
    expect(result.request.params[0].value).toBe('api.test');
    expect(result.request.body.text).toBe('{"host":"api.test"}');

    // Original untouched.
    expect(request.url).toBe('https://{{host}}/x');
    expect(request.headers[0].value).toBe('Bearer {{tok}}');

    expect(result.issues).toEqual([]);
    expect(result.resolved).toContain('host');
    expect(result.resolved).toContain('tok');
  });

  it('collects issues from every location', () => {
    const r = resolver();
    const request = createEmptyRequest('req_2');
    request.url = 'https://{{missingHost}}/x';
    request.headers = [{ id: 'h1', key: 'X-{{missingHeader}}', value: 'v', enabled: true }];

    const result = r.resolveRequest(request);
    const locations = result.issues.map((i) => i.location);
    expect(locations).toContain('url');
    expect(locations).toContain('headers.key');
    expect(result.request.url).toBe('https://{{missingHost}}/x');
  });

  it('leaves file paths in multipart parts untouched', () => {
    const r = resolver({ envVars: [variable('dir', '/tmp')] });
    const request = createEmptyRequest('req_3');
    request.body = {
      type: 'multipart',
      multipartParts: [
        { id: 'm1', name: 'file', value: '/var/data.bin', kind: 'file', enabled: true },
        { id: 'm2', name: 'dir', value: '{{dir}}', kind: 'text', enabled: true },
      ],
    };
    const result = r.resolveRequest(request);
    expect(result.request.body.multipartParts?.[0].value).toBe('/var/data.bin');
    expect(result.request.body.multipartParts?.[1].value).toBe('/tmp');
  });

  it('resolves basic-auth username but leaves the password field alone', () => {
    const r = resolver({ envVars: [variable('user', 'ada')] });
    const request = createEmptyRequest('req_4');
    request.authentication = { type: 'basic', username: '{{user}}', password: 'keep' };
    const result = r.resolveRequest(request);
    expect(result.request.authentication).toEqual({
      type: 'basic',
      username: 'ada',
      password: 'keep',
    });
  });
});

describe('extractVariableNames', () => {
  it('finds unique names in order', () => {
    expect(extractVariableNames('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('handles whitespace and mixed text', () => {
    expect(extractVariableNames('Bearer {{ token }}')).toEqual(['token']);
    expect(extractVariableNames('no references here')).toEqual([]);
  });

  it('does not throw on malformed input', () => {
    expect(extractVariableNames('{{unclosed')).toEqual([]);
    expect(extractVariableNames('')).toEqual([]);
  });
});

describe('findMissingVariables', () => {
  it('reports variables that do not resolve across a request', () => {
    const r = resolver({
      envVars: [variable('host', 'api.test')],
      globals: [variable('g', 'x')],
    });
    const request = createEmptyRequest('req_5');
    request.url = 'https://{{host}}/{{missing1}}/x';
    request.headers = [{ id: 'h1', key: 'X-{{missing2}}', value: 'v', enabled: true }];
    request.params = [{ id: 'p1', key: 'q', value: '{{missing3}}', enabled: true }];
    request.body = { type: 'text', text: 'body {{missing4}}' };

    const missing = findMissingVariables(request, r);
    expect(missing.sort()).toEqual(['missing1', 'missing2', 'missing3', 'missing4']);
  });

  it('returns an empty list when everything resolves', () => {
    const r = resolver({ envVars: [variable('host', 'api.test')] });
    const request = createEmptyRequest('req_6');
    request.url = 'https://{{host}}/x';
    expect(findMissingVariables(request, r)).toEqual([]);
  });

  it('reports disabled variables as missing too', () => {
    const r = resolver({ envVars: [variable('flag', 'x', { enabled: false })] });
    const request = createEmptyRequest('req_7');
    request.url = 'https://example.com/{{flag}}';
    expect(findMissingVariables(request, r)).toEqual(['flag']);
  });

  it('does not report the same variable twice', () => {
    const r = resolver();
    const request = createEmptyRequest('req_8');
    request.url = 'https://example.com/{{dup}}';
    request.headers = [{ id: 'h1', key: 'X-{{dup}}', value: '{{dup}}', enabled: true }];
    expect(findMissingVariables(request, r)).toEqual(['dup']);
  });
});
