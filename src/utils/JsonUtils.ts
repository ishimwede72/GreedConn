/**
 * JSON helpers: safe parsing, formatting and JSON-path evaluation.
 */

export interface JsonParseResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function parseJson(text: string): JsonParseResult {
  if (typeof text !== 'string') {
    return { ok: false, error: 'Input must be a string.' };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Empty input.' };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatJson(text: string, indent = 2): string {
  const parsed = parseJson(text);
  if (!parsed.ok || parsed.value === undefined) {
    throw new Error(parsed.error ?? 'Invalid JSON');
  }
  return JSON.stringify(parsed.value, null, indent);
}

export function tryFormatJson(text: string, indent = 2): { formatted: string; changed: boolean } {
  try {
    const formatted = formatJson(text, indent);
    return { formatted, changed: formatted !== text };
  } catch {
    return { formatted: text, changed: false };
  }
}

/**
 * Minimal JSON path evaluator supporting `$.a.b[0].c`, `a.b`, `$[0]` and
 * wildcard-free dotted paths — enough for API assertions without pulling in
 * a JSONPath dependency.
 */
export function getJsonPath(root: unknown, path: string): { found: boolean; value?: unknown } {
  if (!path) return { found: false };
  const normalized = path.startsWith('$.')
    ? path.slice(2)
    : path.startsWith('$')
      ? path.slice(1)
      : path;
  const cleaned = normalized.replace(/^\./, '');
  if (cleaned === '') return { found: true, value: root };

  const tokens = tokenizePath(cleaned);
  if (tokens === null) return { found: false };

  let current: unknown = root;
  for (const token of tokens) {
    if (current === null || current === undefined) return { found: false };
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, token)) return { found: false };
      current = record[token];
      continue;
    }
    return { found: false };
  }
  return { found: true, value: current };
}

function tokenizePath(path: string): string[] | null {
  const tokens: string[] = [];
  let buffer = '';
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i];
    if (ch === '.') {
      // A dot right after `]` (e.g. `items[1].id`) separates tokens with an
      // empty buffer — that is valid. An empty buffer anywhere else means a
      // malformed path such as `a..b` or a leading dot.
      if (buffer.length === 0) {
        if (path[i - 1] !== ']') return null;
      } else {
        tokens.push(buffer);
        buffer = '';
      }
    } else if (ch === '[') {
      if (buffer.length > 0) {
        tokens.push(buffer);
        buffer = '';
      }
      const end = path.indexOf(']', i);
      if (end === -1) return null;
      const inner = path.slice(i + 1, end).replace(/^['"]|['"]$/g, '');
      tokens.push(inner);
      i = end;
    } else {
      buffer += ch;
    }
  }
  if (buffer.length > 0) tokens.push(buffer);
  return tokens.length > 0 ? tokens : null;
}

/** Best-effort detection of a response content type for highlighting. */
export function detectBodyKind(
  contentType: string,
  body: string,
): 'json' | 'html' | 'xml' | 'text' | 'empty' {
  const ct = (contentType || '').toLowerCase();
  if (body.length === 0) return 'empty';
  if (ct.includes('json') || ct.includes('+json')) return 'json';
  if (ct.includes('html')) return 'html';
  if (ct.includes('xml')) return 'xml';
  const trimmed = body.trimStart();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && body.trimEnd().length > 1) {
    try {
      JSON.parse(body);
      return 'json';
    } catch {
      /* fall through */
    }
  }
  if (trimmed.startsWith('<'))
    return trimmed.toLowerCase().startsWith('<!doctype html') ? 'html' : 'xml';
  return 'text';
}
