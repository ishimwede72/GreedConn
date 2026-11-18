/**
 * Variable resolution: {{variable_name}} substitution with safe handling of
 * missing, circular and malformed references.
 *
 * Rules:
 *  - `{{ name }}` and `{{name}}` both resolve (whitespace trimmed).
 *  - Environment variables override globals.
 *  - Missing / disabled variables leave the original text untouched and are
 *    reported as issues (never replaced with "undefined").
 *  - Values may reference other variables; resolution is depth-limited with
 *    cycle detection (circular references are reported, original text kept).
 *  - Malformed references (unbalanced braces) are reported, not guessed.
 */
import type {
  Environment,
  EnvironmentVariable,
  VariableResolutionIssue,
  VariableResolutionResult,
} from '../types/Environment';
import type { HttpRequestModel, KeyValueRow } from '../types/Request';

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MAX_DEPTH = 10;

export interface ResolverInput {
  environments: Environment[];
  globals: EnvironmentVariable[];
  activeEnvironmentId: string;
  /** Optional override (per-request environment selection). */
  environmentId?: string;
}

export class VariableResolver {
  constructor(private readonly input: ResolverInput) {}

  private activeEnvironment(): Environment | null {
    const id = this.input.environmentId || this.input.activeEnvironmentId;
    if (!id) return null;
    return this.input.environments.find((env) => env.id === id) ?? null;
  }

  /** Build a lookup that prefers environment scope over globals. */
  private lookup(): Map<
    string,
    { variable: EnvironmentVariable; scope: 'environment' | 'global' }
  > {
    const map = new Map<
      string,
      { variable: EnvironmentVariable; scope: 'environment' | 'global' }
    >();
    // Disabled variables are kept in the table so `resolve` can report them
    // as `disabled` (distinct from `missing`); `substitute` never uses their
    // value. Scope precedence is unchanged: environment overrides globals.
    for (const variable of this.input.globals) {
      if (variable.key) {
        map.set(variable.key, { variable, scope: 'global' });
      }
    }
    const env = this.activeEnvironment();
    if (env) {
      for (const variable of env.variables) {
        if (variable.key) {
          map.set(variable.key, { variable, scope: 'environment' });
        }
      }
    }
    return map;
  }

  /** Resolve a single string. */
  resolve(value: string, location = 'value'): VariableResolutionResult {
    const issues: VariableResolutionIssue[] = [];
    const resolvedNames: string[] = [];
    const table = this.lookup();

    if (typeof value !== 'string' || value.length === 0) {
      return { value: value ?? '', issues, resolved: [] };
    }

    // Detect unbalanced/malformed references before substitution.
    detectMalformed(value, location, issues);

    const visiting = new Set<string>();

    const substitute = (input: string, depth: number): string => {
      if (depth > MAX_DEPTH) {
        issues.push({
          reference: input,
          variable: '',
          reason: 'circular',
          location,
        });
        return input;
      }
      return input.replace(PLACEHOLDER_RE, (match, rawName: string) => {
        const name = rawName.trim();
        if (!name) {
          issues.push({ reference: match, variable: '', reason: 'malformed', location });
          return match;
        }
        const entry = table.get(name);
        if (!entry) {
          issues.push({ reference: match, variable: name, reason: 'missing', location });
          return match;
        }
        if (entry.variable.enabled === false) {
          issues.push({ reference: match, variable: name, reason: 'disabled', location });
          return match;
        }
        if (visiting.has(name)) {
          issues.push({ reference: match, variable: name, reason: 'circular', location });
          return match;
        }
        visiting.add(name);
        try {
          const raw = entry.variable.value ?? '';
          const expanded = raw.includes('{{') ? substitute(raw, depth + 1) : raw;
          if (!resolvedNames.includes(name)) resolvedNames.push(name);
          return expanded;
        } finally {
          visiting.delete(name);
        }
      });
    };

    return { value: substitute(value, 0), issues, resolved: resolvedNames };
  }

  /** Resolve an entire request, returning a deep copy. */
  resolveRequest(request: HttpRequestModel): {
    request: HttpRequestModel;
    issues: VariableResolutionIssue[];
    resolved: string[];
  } {
    const issues: VariableResolutionIssue[] = [];
    const resolved: string[] = [];
    const merge = (result: VariableResolutionResult): string => {
      issues.push(...result.issues);
      for (const name of result.resolved) {
        if (!resolved.includes(name)) resolved.push(name);
      }
      return result.value;
    };

    const clone: HttpRequestModel = {
      ...request,
      params: request.params.map((row) => this.resolveRow(row, merge, 'params')),
      headers: request.headers.map((row) => this.resolveRow(row, merge, 'headers')),
      url: merge(this.resolve(request.url, 'url')),
      body: this.resolveBody(request.body, merge),
      authentication: this.resolveAuth(request.authentication, merge),
      settings: { ...request.settings },
    };

    return { request: clone, issues, resolved };
  }

  private resolveRow(
    row: KeyValueRow,
    merge: (r: VariableResolutionResult) => string,
    location: string,
  ): KeyValueRow {
    return {
      ...row,
      key: merge(this.resolve(row.key, `${location}.key`)),
      value: merge(this.resolve(row.value, `${location}.value`)),
      ...(row.description !== undefined
        ? { description: merge(this.resolve(row.description, `${location}.description`)) }
        : {}),
    };
  }

  private resolveBody(
    body: HttpRequestModel['body'],
    merge: (r: VariableResolutionResult) => string,
  ): HttpRequestModel['body'] {
    const next: HttpRequestModel['body'] = { ...body };
    if (typeof body.text === 'string') {
      next.text = merge(this.resolve(body.text, 'body.text'));
    }
    if (body.formParams) {
      next.formParams = body.formParams.map((row) =>
        this.resolveRow(row, merge, 'body.formParams'),
      );
    }
    if (body.multipartParts) {
      next.multipartParts = body.multipartParts.map((part) => ({
        ...part,
        name: merge(this.resolve(part.name, 'body.multipart.name')),
        value:
          part.kind === 'file'
            ? part.value
            : merge(this.resolve(part.value, 'body.multipart.value')),
      }));
    }
    return next;
  }

  private resolveAuth(
    auth: HttpRequestModel['authentication'],
    merge: (r: VariableResolutionResult) => string,
  ): HttpRequestModel['authentication'] {
    switch (auth.type) {
      case 'bearer':
        // Secrets are resolved later via SecretStorage; only non-secret fields here.
        return {
          ...auth,
          prefix: auth.prefix ? merge(this.resolve(auth.prefix, 'auth.prefix')) : auth.prefix,
        };
      case 'basic':
        return { ...auth, username: merge(this.resolve(auth.username, 'auth.username')) };
      case 'apiKey':
        return {
          ...auth,
          key: merge(this.resolve(auth.key, 'auth.key')),
          value: auth.secretId ? auth.value : merge(this.resolve(auth.value, 'auth.value')),
        };
      case 'oauth2':
        return {
          ...auth,
          clientId: merge(this.resolve(auth.clientId, 'auth.clientId')),
          tokenUrl: merge(this.resolve(auth.tokenUrl, 'auth.tokenUrl')),
          ...(auth.authorizationUrl
            ? {
                authorizationUrl: merge(
                  this.resolve(auth.authorizationUrl, 'auth.authorizationUrl'),
                ),
              }
            : {}),
        };
      default:
        return auth;
    }
  }
}

function detectMalformed(value: string, location: string, issues: VariableResolutionIssue[]): void {
  // Unclosed {{ ... }}
  const openCount = (value.match(/\{\{/g) ?? []).length;
  const closeCount = (value.match(/\}\}/g) ?? []).length;
  if (openCount !== closeCount) {
    issues.push({
      reference: value,
      variable: '',
      reason: 'malformed',
      location,
    });
    return;
  }
  // Single-brace leftovers like `{name}` are not references; leave them alone.
}

/** Collect every unique variable name referenced in a string. */
export function extractVariableNames(value: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  while ((match = re.exec(value)) !== null) {
    const name = match[1].trim();
    if (name) names.add(name);
  }
  return [...names];
}

/** Find missing variables across an entire request (used by the UI hint bar). */
export function findMissingVariables(
  request: HttpRequestModel,
  resolver: VariableResolver,
): string[] {
  const candidates = [
    request.url,
    ...request.headers.map((h) => `${h.key}:${h.value}`),
    ...request.params.map((p) => `${p.key}:${p.value}`),
  ];
  if (request.body.text) candidates.push(request.body.text);
  const missing = new Set<string>();
  for (const candidate of candidates) {
    for (const name of extractVariableNames(candidate)) {
      const result = resolver.resolve(`{{${name}}}`, 'scan');
      if (result.issues.some((i) => i.reason === 'missing' || i.reason === 'disabled')) {
        missing.add(name);
      }
    }
  }
  return [...missing];
}
