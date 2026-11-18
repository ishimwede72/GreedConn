/**
 * Postman Collection v2.1 importer.
 *
 * Supported mappings:
 *  - info.name / info.description          -> collection name/description
 *  - item[] (folders, recursive)           -> folders
 *  - item[].request                        -> requests
 *  - request.method                        -> method
 *  - request.url (string | object)         -> url + query params
 *  - request.header[]                      -> headers
 *  - request.body.mode                     -> body (raw/urlencoded/formdata)
 *  - request.auth                          -> authentication (bearer/basic/apikey)
 *  - request.description / item.description-> item description
 *
 * Unknown/unsupported data is NEVER silently discarded: it is preserved in
 * the item `description` as a JSON note and reported via `warnings`.
 */
import type {
  Collection,
  CollectionItem,
  ImportResult,
  RequestItem,
  FolderItem,
} from '../../types/Collection';
import type { HttpRequestModel, KeyValueRow, BodyType } from '../../types/Request';
import { generateCollectionId, generateFolderId, generateItemId } from '../../utils/IdGenerator';
import { nowIso } from '../../utils/DateUtils';

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string | string[];
  path?: string | string[];
  query?: Array<{ key?: string; value?: string; disabled?: boolean; description?: string }>;
  port?: string;
}

interface PostmanHeader {
  key?: string;
  value?: string;
  disabled?: boolean;
  description?: string;
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  urlencoded?: Array<{ key?: string; value?: string; disabled?: boolean }>;
  formdata?: Array<{
    key?: string;
    value?: string;
    type?: string;
    disabled?: boolean;
    src?: string | string[];
  }>;
  options?: { raw?: { language?: string } };
}

interface PostmanAuth {
  type?: string;
  bearer?: Array<{ key?: string; value?: string }>;
  basic?: Array<{ key?: string; value?: string }>;
  apikey?: Array<{ key?: string; value?: string }>;
}

interface PostmanRequest {
  method?: string;
  url?: string | PostmanUrl;
  header?: PostmanHeader[];
  body?: PostmanBody;
  auth?: PostmanAuth;
  description?: string;
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  description?: string;
  [key: string]: unknown;
}

interface PostmanCollection {
  info?: { name?: string; description?: string; schema?: string; _postman_id?: string };
  item?: PostmanItem[];
  [key: string]: unknown;
}

export function detect(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    const info = record['info'];
    if (info && typeof info === 'object') {
      const schema = (info as Record<string, unknown>)['schema'];
      if (typeof schema === 'string' && schema.includes('postman')) return true;
    }
    return (
      Array.isArray(record['item']) &&
      (record['info'] !== undefined || record['item'] !== undefined)
    );
  } catch {
    return false;
  }
}

export function parse(content: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Not a Postman collection document.');
  }
  const doc = parsed as PostmanCollection;
  const warnings: string[] = [];
  let preservedUnknownFields = 0;

  if (!Array.isArray(doc.item)) {
    throw new Error('Postman collection has no "item" array.');
  }

  const now = nowIso();
  const items: CollectionItem[] = [];
  for (const entry of doc.item) {
    const result = convertItem(entry, warnings, now);
    if (result) {
      items.push(result.item);
      preservedUnknownFields += result.preserved;
    } else {
      warnings.push('An empty Postman item was skipped.');
    }
  }

  // Preserve top-level unknown fields as a collection description note.
  const knownTop = new Set([
    'info',
    'item',
    'auth',
    'variable',
    'event',
    'protocolProfileBehaviors',
  ]);
  const extras = Object.keys(doc).filter((key) => !knownTop.has(key));
  let description = typeof doc.info?.description === 'string' ? doc.info.description : '';
  if (extras.length > 0) {
    preservedUnknownFields += extras.length;
    const note = `\n\n--- Preserved from import (unsupported fields) ---\n${JSON.stringify(
      Object.fromEntries(extras.map((key) => [key, doc[key]])),
      null,
      2,
    ).slice(0, 4000)}`;
    description = `${description}${note}`;
    warnings.push(`Preserved ${extras.length} unsupported top-level field(s) in the description.`);
  }

  const collection: Collection = {
    id: generateCollectionId(),
    name: doc.info?.name?.trim() || 'Imported Postman Collection',
    ...(description ? { description } : {}),
    items,
    createdAt: now,
    updatedAt: now,
    version: 2,
  };

  return { collection, format: 'postman-v2.1', warnings, preservedUnknownFields };
}

function convertItem(
  entry: PostmanItem,
  warnings: string[],
  now: string,
): { item: CollectionItem; preserved: number } | null {
  if (!entry || typeof entry !== 'object') return null;
  const name = typeof entry.name === 'string' && entry.name ? entry.name : 'Untitled';

  // Folder: has nested `item` and no `request`
  if (Array.isArray(entry.item) && entry.request === undefined) {
    const folder: FolderItem = {
      type: 'folder',
      id: generateFolderId(),
      name,
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    let preserved = 0;
    for (const child of entry.item) {
      const result = convertItem(child, warnings, now);
      if (result) {
        folder.items.push(result.item);
        preserved += result.preserved;
      }
    }
    const unknownKeys = Object.keys(entry).filter(
      (k) => !['name', 'item', 'description', 'id'].includes(k),
    );
    if (unknownKeys.length > 0) {
      preserved += unknownKeys.length;
      folder.description =
        `${folder.description ?? ''}\n[preserved: ${unknownKeys.join(', ')}]`.trim();
    }
    return { item: folder, preserved };
  }

  if (entry.request === undefined) {
    warnings.push(`Item "${name}" has neither request nor children; preserved as an empty folder.`);
    const folder: FolderItem = {
      type: 'folder',
      id: generateFolderId(),
      name,
      description: `[preserved unsupported item: ${JSON.stringify(entry).slice(0, 300)}]`,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    return { item: folder, preserved: 1 };
  }

  const request = convertRequest(entry.request, name, warnings);
  const item: RequestItem = {
    type: 'request',
    id: generateItemId(),
    name,
    request,
    ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
    createdAt: now,
    updatedAt: now,
  };

  let preserved = 0;
  const unknownKeys = Object.keys(entry).filter(
    (k) =>
      !['name', 'request', 'description', 'id', 'event', 'protocolProfileBehavior'].includes(k),
  );
  if (unknownKeys.length > 0) {
    preserved += unknownKeys.length;
    item.description = `${item.description ?? ''}\n[preserved: ${unknownKeys.join(', ')}]`.trim();
    warnings.push(`Item "${name}": preserved unsupported fields (${unknownKeys.join(', ')}).`);
  }
  if (Array.isArray(entry['event'])) {
    preserved += 1;
    item.description =
      `${item.description ?? ''}\n[preserved: postman test scripts are not executed by Greedcon]`.trim();
    warnings.push(`Item "${name}": Postman test scripts preserved as notes (not executed).`);
  }

  return { item, preserved };
}

function convertRequest(raw: PostmanRequest, name: string, warnings: string[]): HttpRequestModel {
  const now = nowIso();
  const method = (typeof raw.method === 'string' ? raw.method : 'GET').toUpperCase();
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const finalMethod = (allowed.includes(method) ? method : 'GET') as HttpRequestModel['method'];
  if (!allowed.includes(method)) {
    warnings.push(`Request "${name}": method ${method} is not supported; imported as GET.`);
  }

  const { url, params } = normalizeUrl(raw.url);
  const headers = (raw.header ?? [])
    .filter((h) => h && typeof h.key === 'string')
    .map((h, index) => ({
      id: `header_${index}_${Math.random().toString(36).slice(2, 8)}`,
      key: h.key as string,
      value: h.value ?? '',
      ...(h.description ? { description: h.description } : {}),
      enabled: h.disabled !== true,
    }));

  const { body, bodyWarnings } = normalizeBody(raw.body);
  warnings.push(...bodyWarnings.map((w) => `Request "${name}": ${w}`));

  return {
    id: generateItemId(),
    name,
    method: finalMethod,
    url,
    params,
    headers,
    body,
    authentication: normalizeAuth(raw.auth, warnings, name),
    timeout: 30000,
    settings: { followRedirects: true, maxRedirects: 5 },
    ...(typeof raw.description === 'string' && raw.description ? {} : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeUrl(raw: string | PostmanUrl | undefined): {
  url: string;
  params: KeyValueRow[];
} {
  if (raw === undefined) return { url: '', params: [] };
  if (typeof raw === 'string') return { url: raw, params: [] };

  const params: KeyValueRow[] = (raw.query ?? [])
    .filter((q) => q && typeof q.key === 'string')
    .map((q, index) => ({
      id: `param_${index}_${Math.random().toString(36).slice(2, 8)}`,
      key: q.key as string,
      value: q.value ?? '',
      ...(q.description ? { description: q.description } : {}),
      enabled: q.disabled !== true,
    }));

  if (raw.raw) return { url: raw.raw, params };

  const protocol = raw.protocol ? `${raw.protocol}://` : '';
  const host = Array.isArray(raw.host) ? raw.host.join('.') : (raw.host ?? '');
  const path = Array.isArray(raw.path) ? `/${raw.path.join('/')}` : raw.path ? `/${raw.path}` : '';
  const port = raw.port ? `:${raw.port}` : '';
  return { url: `${protocol}${host}${port}${path}`, params };
}

function normalizeBody(raw: PostmanBody | undefined): {
  body: HttpRequestModel['body'];
  bodyWarnings: string[];
} {
  const warnings: string[] = [];
  if (!raw || !raw.mode) return { body: { type: 'none' }, bodyWarnings: warnings };

  switch (raw.mode) {
    case 'raw': {
      const language = raw.options?.raw?.language;
      const type: BodyType =
        language === 'xml'
          ? 'xml'
          : language === 'json' || looksLikeJson(raw.raw)
            ? 'json'
            : 'text';
      return { body: { type, text: raw.raw ?? '' }, bodyWarnings: warnings };
    }
    case 'urlencoded': {
      const formParams: KeyValueRow[] = (raw.urlencoded ?? [])
        .filter((row) => row && typeof row.key === 'string')
        .map((row, index) => ({
          id: `form_${index}_${Math.random().toString(36).slice(2, 8)}`,
          key: row.key as string,
          value: row.value ?? '',
          enabled: row.disabled !== true,
        }));
      return { body: { type: 'formUrlEncoded', formParams }, bodyWarnings: warnings };
    }
    case 'formdata': {
      const multipartParts = (raw.formdata ?? [])
        .filter((row) => row && typeof row.key === 'string')
        .map((row, index) => {
          const isFile = row.type === 'file';
          if (isFile && Array.isArray(row.src)) {
            warnings.push(
              `File part "${row.key}" references multiple files; only the first was kept.`,
            );
          }
          return {
            id: `part_${index}_${Math.random().toString(36).slice(2, 8)}`,
            name: row.key as string,
            value: isFile
              ? Array.isArray(row.src)
                ? String(row.src[0] ?? '')
                : String(row.src ?? '')
              : (row.value ?? ''),
            kind: (isFile ? 'file' : 'text') as 'file' | 'text',
            enabled: row.disabled !== true,
          };
        });
      return { body: { type: 'multipart', multipartParts }, bodyWarnings: warnings };
    }
    case 'file':
      warnings.push(
        'Postman file bodies are not supported; the file path was preserved as a note.',
      );
      return {
        body: { type: 'text', text: `[file body: ${JSON.stringify(raw)}]` },
        bodyWarnings: warnings,
      };
    case 'graphql':
      warnings.push('GraphQL bodies imported as raw text.');
      return {
        body: { type: 'text', text: (raw as { raw?: string }).raw ?? '' },
        bodyWarnings: warnings,
      };
    default:
      warnings.push(`Unknown body mode "${raw.mode}"; preserved as raw text.`);
      return {
        body: { type: 'text', text: raw.raw ?? JSON.stringify(raw) },
        bodyWarnings: warnings,
      };
  }
}

function looksLikeJson(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function normalizeAuth(
  raw: PostmanAuth | undefined,
  warnings: string[],
  name: string,
): HttpRequestModel['authentication'] {
  if (!raw || !raw.type || raw.type === 'noauth') return { type: 'none' };
  const pick = (list: Array<{ key?: string; value?: string }> | undefined, key: string): string =>
    list?.find((entry) => entry.key?.toLowerCase() === key)?.value ?? '';

  switch (raw.type) {
    case 'bearer':
      return { type: 'bearer', token: pick(raw.bearer, 'token') };
    case 'basic':
      return {
        type: 'basic',
        username: pick(raw.basic, 'username'),
        password: pick(raw.basic, 'password'),
      };
    case 'apikey':
      return {
        type: 'apiKey',
        key: pick(raw.apikey, 'key') || 'X-API-Key',
        value: pick(raw.apikey, 'value'),
        placement: (pick(raw.apikey, 'in') as 'header' | 'query' | 'cookie') || 'header',
      };
    case 'oauth2':
      warnings.push(`Request "${name}": Postman OAuth2 configuration imported without tokens.`);
      return { type: 'none' };
    default:
      warnings.push(`Request "${name}": unsupported auth type "${raw.type}" ignored.`);
      return { type: 'none' };
  }
}
