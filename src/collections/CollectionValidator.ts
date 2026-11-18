/**
 * Collection data validation — used for storage loads, imports and messages.
 * Never throws for recoverable problems; returns structured issues.
 */
import type { Collection, CollectionItem, FolderItem, RequestItem } from '../types/Collection';
import type { HttpRequestModel } from '../types/Request';
import { isHttpMethod, HTTP_METHODS } from '../types/Request';
import { isPlainObject, isString, isBoolean, isNumber } from '../utils/ValidationUtils';
import { generateFolderId, generateItemId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
  warnings: string[];
}

export function validateCollection(raw: unknown): ValidationResult<Collection> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['Collection must be an object.'], warnings };
  }

  if (!isString(raw['id'], 200) || !raw['id']) {
    errors.push('Collection "id" is missing or invalid.');
  }
  if (!isString(raw['name'], 500) || !raw['name']) {
    errors.push('Collection "name" is missing or invalid.');
  }

  const itemsRaw = raw['items'];
  const items: CollectionItem[] = [];
  if (Array.isArray(itemsRaw)) {
    for (const [index, item] of itemsRaw.entries()) {
      const result = validateItem(item, `items[${index}]`, errors, warnings);
      if (result) items.push(result);
    }
  } else if (itemsRaw !== undefined) {
    errors.push('Collection "items" must be an array.');
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const collection: Collection = {
    id: raw['id'] as string,
    name: raw['name'] as string,
    ...(isString(raw['description'], 5000) ? { description: raw['description'] } : {}),
    createdAt: isString(raw['createdAt'], 40) ? raw['createdAt'] : nowIso(),
    updatedAt: isString(raw['updatedAt'], 40) ? raw['updatedAt'] : nowIso(),
    version: isNumber(raw['version']) ? raw['version'] : 2,
    items,
  };
  return { ok: true, value: collection, errors, warnings };
}

function validateItem(
  raw: unknown,
  path: string,
  errors: string[],
  warnings: string[],
): CollectionItem | null {
  if (!isPlainObject(raw)) {
    warnings.push(`${path}: non-object entry skipped.`);
    return null;
  }
  const type = raw['type'];
  if (type === 'folder') {
    const id = isString(raw['id'], 200) && raw['id'] ? raw['id'] : generateFolderId();
    const name = isString(raw['name'], 500) && raw['name'] ? raw['name'] : 'Untitled Folder';
    if (!raw['id']) warnings.push(`${path}: folder id was missing and has been generated.`);
    const children: CollectionItem[] = [];
    if (Array.isArray(raw['items'])) {
      for (const [index, child] of raw['items'].entries()) {
        const result = validateItem(child, `${path}.items[${index}]`, errors, warnings);
        if (result) children.push(result);
      }
    }
    const folder: FolderItem = {
      type: 'folder',
      id,
      name,
      ...(isString(raw['description'], 5000) ? { description: raw['description'] } : {}),
      items: children,
      createdAt: isString(raw['createdAt'], 40) ? raw['createdAt'] : nowIso(),
      updatedAt: isString(raw['updatedAt'], 40) ? raw['updatedAt'] : nowIso(),
    };
    return folder;
  }

  if (type === 'request') {
    const requestRaw = raw['request'];
    const request = validateRequestModel(requestRaw, `${path}.request`, errors, warnings);
    if (!request) return null;
    const item: RequestItem = {
      type: 'request',
      id: isString(raw['id'], 200) && raw['id'] ? raw['id'] : generateItemId(),
      name: isString(raw['name'], 500) && raw['name'] ? raw['name'] : request.name,
      request,
      ...(isString(raw['description'], 5000) ? { description: raw['description'] } : {}),
      createdAt: isString(raw['createdAt'], 40) ? raw['createdAt'] : nowIso(),
      updatedAt: isString(raw['updatedAt'], 40) ? raw['updatedAt'] : nowIso(),
    };
    return item;
  }

  warnings.push(`${path}: unknown item type "${String(type)}" preserved as a request stub.`);
  // Never silently discard unsupported imported data: keep it as a request
  // item whose body retains the original payload for inspection.
  const stub = raw['request'];
  const request =
    validateRequestModel(stub, `${path}.request`, errors, warnings) ?? fallbackRequest();
  const item: RequestItem = {
    type: 'request',
    id: isString(raw['id'], 200) && raw['id'] ? (raw['id'] as string) : generateItemId(),
    name: isString(raw['name'], 500) && raw['name'] ? (raw['name'] as string) : 'Imported item',
    request,
    description: `Preserved unsupported item (${String(type)}): ${JSON.stringify(raw).slice(0, 500)}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return item;
}

export function validateRequestModel(
  raw: unknown,
  path: string,
  errors: string[] = [],
  warnings: string[] = [],
): HttpRequestModel | null {
  if (!isPlainObject(raw)) {
    if (raw !== undefined) warnings.push(`${path}: request is not an object; skipped.`);
    return null;
  }

  const method = raw['method'];
  if (!isHttpMethod(method)) {
    warnings.push(`${path}: unsupported method "${String(method)}" normalized to GET.`);
  }

  const url = isString(raw['url'], 8192) ? raw['url'] : '';
  const id = isString(raw['id'], 200) && raw['id'] ? (raw['id'] as string) : generateItemId();

  const params = normalizeRows(raw['params'], 'params', warnings, path);
  const headers = normalizeRows(raw['headers'], 'headers', warnings, path);

  const bodyRaw = raw['body'];
  let body: HttpRequestModel['body'] = { type: 'none' };
  if (isPlainObject(bodyRaw)) {
    const type =
      typeof bodyRaw['type'] === 'string'
        ? (bodyRaw['type'] as HttpRequestModel['body']['type'])
        : 'none';
    body = {
      type: (['none', 'json', 'text', 'xml', 'formUrlEncoded', 'multipart'] as const).includes(
        type as never,
      )
        ? type
        : 'none',
      ...(isString(bodyRaw['text'], 5_000_000) ? { text: bodyRaw['text'] } : {}),
      ...(Array.isArray(bodyRaw['formParams'])
        ? { formParams: normalizeRows(bodyRaw['formParams'], 'formParams', warnings, path) }
        : {}),
      ...(isString(bodyRaw['contentType'], 500) ? { contentType: bodyRaw['contentType'] } : {}),
    };
    if (
      type !== 'none' &&
      type !== 'json' &&
      type !== 'text' &&
      type !== 'xml' &&
      type !== 'formUrlEncoded' &&
      type !== 'multipart'
    ) {
      warnings.push(`${path}: unknown body type "${type}" normalized to none.`);
    }
  }

  const authRaw = raw['authentication'];
  const authentication = normalizeAuth(authRaw, warnings, path);

  const timeout = isNumber(raw['timeout'])
    ? Math.min(600000, Math.max(100, raw['timeout']))
    : 30000;
  const settingsRaw = isPlainObject(raw['settings']) ? raw['settings'] : {};

  return {
    id,
    name: isString(raw['name'], 500) ? (raw['name'] as string) : 'Untitled Request',
    method: isHttpMethod(method) ? method : 'GET',
    url,
    params,
    headers,
    body,
    authentication,
    timeout,
    ...(isString(raw['environmentId'], 200) ? { environmentId: raw['environmentId'] } : {}),
    settings: {
      followRedirects: isBoolean(settingsRaw['followRedirects'])
        ? settingsRaw['followRedirects']
        : true,
      ...(isNumber(settingsRaw['maxRedirects'])
        ? { maxRedirects: settingsRaw['maxRedirects'] }
        : {}),
      ...(isNumber(settingsRaw['timeout']) ? { timeout: settingsRaw['timeout'] } : {}),
      ...(isBoolean(settingsRaw['removeUserAgent'])
        ? { removeUserAgent: settingsRaw['removeUserAgent'] }
        : {}),
      ...(isBoolean(settingsRaw['validateSsl']) ? { validateSsl: settingsRaw['validateSsl'] } : {}),
    },
    createdAt: isString(raw['createdAt'], 40) ? (raw['createdAt'] as string) : nowIso(),
    updatedAt: isString(raw['updatedAt'], 40) ? (raw['updatedAt'] as string) : nowIso(),
  };
}

function normalizeRows(
  raw: unknown,
  label: string,
  warnings: string[],
  path: string,
): HttpRequestModel['params'] {
  if (!Array.isArray(raw)) return [];
  const rows: HttpRequestModel['params'] = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const key = isString(row['key'], 2000) ? row['key'] : '';
    const value = isString(row['value'], 500_000) ? row['value'] : '';
    if (!key && !value) continue;
    rows.push({
      id:
        isString(row['id'], 200) && row['id']
          ? (row['id'] as string)
          : `${label}_${rows.length}_${Math.random().toString(36).slice(2, 8)}`,
      key,
      value,
      ...(isString(row['description'], 2000) ? { description: row['description'] } : {}),
      enabled: isBoolean(row['enabled']) ? row['enabled'] : true,
    });
  }
  if (rows.length === 0 && Array.isArray(raw) && raw.length > 0) {
    warnings.push(`${path}: some ${label} rows were invalid and skipped.`);
  }
  return rows;
}

function normalizeAuth(
  raw: unknown,
  warnings: string[],
  path: string,
): HttpRequestModel['authentication'] {
  if (!isPlainObject(raw)) return { type: 'none' };
  const type = raw['type'];
  switch (type) {
    case 'bearer':
      return {
        type: 'bearer',
        token: isString(raw['token'], 20000) ? raw['token'] : '',
        ...(isString(raw['secretId'], 200) ? { secretId: raw['secretId'] } : {}),
        ...(isString(raw['prefix'], 100) ? { prefix: raw['prefix'] } : {}),
      };
    case 'basic':
      return {
        type: 'basic',
        username: isString(raw['username'], 500) ? raw['username'] : '',
        password: isString(raw['password'], 5000) ? raw['password'] : '',
        ...(isString(raw['secretId'], 200) ? { secretId: raw['secretId'] } : {}),
      };
    case 'apiKey':
      return {
        type: 'apiKey',
        key: isString(raw['key'], 500) ? raw['key'] : 'X-API-Key',
        value: isString(raw['value'], 20000) ? raw['value'] : '',
        ...(isString(raw['secretId'], 200) ? { secretId: raw['secretId'] } : {}),
        placement:
          raw['placement'] === 'query' || raw['placement'] === 'cookie'
            ? raw['placement']
            : 'header',
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        grant:
          raw['grant'] === 'authorizationCodePkce' ? 'authorizationCodePkce' : 'clientCredentials',
        tokenUrl: isString(raw['tokenUrl'], 2000) ? raw['tokenUrl'] : '',
        ...(isString(raw['authorizationUrl'], 2000)
          ? { authorizationUrl: raw['authorizationUrl'] }
          : {}),
        clientId: isString(raw['clientId'], 500) ? raw['clientId'] : '',
        ...(isString(raw['clientSecret'], 5000) ? { clientSecret: raw['clientSecret'] } : {}),
        ...(isString(raw['clientSecretId'], 200) ? { clientSecretId: raw['clientSecretId'] } : {}),
        ...(isString(raw['scope'], 1000) ? { scope: raw['scope'] } : {}),
        ...(isString(raw['audience'], 1000) ? { audience: raw['audience'] } : {}),
        ...(isString(raw['accessTokenSecretId'], 200)
          ? { accessTokenSecretId: raw['accessTokenSecretId'] }
          : {}),
        ...(isString(raw['refreshTokenSecretId'], 200)
          ? { refreshTokenSecretId: raw['refreshTokenSecretId'] }
          : {}),
      };
    case 'none':
      return { type: 'none' };
    default:
      if (type !== undefined)
        warnings.push(`${path}: unknown auth type "${String(type)}" ignored.`);
      return { type: 'none' };
  }
}

function fallbackRequest(): HttpRequestModel {
  return {
    id: generateItemId(),
    name: 'Imported request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    authentication: { type: 'none' },
    timeout: 30000,
    settings: { followRedirects: true },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export { HTTP_METHODS };
