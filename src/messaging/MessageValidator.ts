/**
 * MessageValidator — schema validation for every inbound webview message.
 *
 * The webview is an untrusted boundary: even though GREEDCON ships its own
 * UI, any script executing in the webview context (or a compromised extension
 * host message) must not be able to inject arbitrary data. Validation here is
 * intentionally strict: unknown message types are rejected, and payloads are
 * checked field by field with size caps.
 */
import { isMessageType, isPageId } from './MessageTypes';
import type { WebviewMessageMap, WebviewMessageType } from '../types/Messages';
import { isPlainObject, isString, isNumber, isBoolean } from '../utils/ValidationUtils';
import { sanitizeText, sanitizeMultiline } from '../security/InputSanitizer';
import { HTTP_METHODS, isHttpMethod } from '../types/Request';
import { isStringArray } from '../utils/ValidationUtils';

export interface ValidatedMessage<T extends WebviewMessageType = WebviewMessageType> {
  type: T;
  payload: WebviewMessageMap[T];
}

export interface ValidationResult {
  ok: boolean;
  message?: ValidatedMessage;
  error?: string;
}

const MAX_ID_LENGTH = 128;

export function validateWebviewMessage(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Message must be an object.' };
  }

  const id = raw['id'];
  const type = raw['type'];
  const rawData = raw['data'];
  const data: Record<string, unknown> =
    rawData !== null && typeof rawData === 'object' && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};

  if (!isString(id, MAX_ID_LENGTH) || id.length === 0) {
    return { ok: false, error: 'Message id is missing or invalid.' };
  }
  if (!isMessageType(type)) {
    return { ok: false, error: `Unknown message type "${String(type)}".` };
  }
  if (rawData !== undefined && rawData !== null && typeof rawData === 'object' && Array.isArray(rawData)) {
    return { ok: false, error: 'Message data must be an object.' };
  }

  const payload = validatePayload(type, data);
  if (!payload.ok) {
    return { ok: false, error: payload.error };
  }
  return { ok: true, message: { type, payload: payload.value as WebviewMessageMap[typeof type] } };
}

interface PayloadResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

function validatePayload(type: WebviewMessageType, data: Record<string, unknown>): PayloadResult {
  const fail = (error: string): PayloadResult => ({ ok: false, error: `${type}: ${error}` });
  const ok = (value: unknown): PayloadResult => ({ ok: true, value });

  switch (type) {
    // --- app ------------------------------------------------------------
    case 'app.init': {
      const page = data['page'];
      if (page !== undefined && !isPageId(page)) return fail('invalid page id');
      return ok({ ...(page ? { page } : {}) });
    }
    case 'app.navigate': {
      if (!isPageId(data['page'])) return fail('invalid page id');
      return ok({ page: data['page'] });
    }
    case 'app.openExternal': {
      const url = data['url'];
      if (!isString(url, 4096)) return fail('url must be a string');
      return ok({ url });
    }
    case 'app.saveDraft': {
      const request = validateRequestDraft(data['request']);
      if (!request.ok) return fail(request.error ?? 'invalid request');
      return ok({ request: request.value });
    }
    case 'app.getState':
    case 'app.openSettings':
    case 'request.cancel':
    case 'collections.list':
    case 'environments.list':
    case 'collections.pickFile':
    case 'settings.get':
    case 'demo.seed':
      return ok({});

    // --- request --------------------------------------------------------
    case 'request.send': {
      const request = validateRequestDraft(data['request']);
      if (!request.ok) return fail(request.error ?? 'invalid request');
      const environmentId = data['environmentId'];
      if (environmentId !== undefined && !isString(environmentId, 200)) {
        return fail('environmentId must be a string');
      }
      return ok({
        request: request.value,
        ...(environmentId ? { environmentId } : {}),
      });
    }
    case 'request.formatJson':
    case 'request.validateJson': {
      if (!isString(data['text'], 5_000_000)) return fail('text must be a string');
      return ok({ text: data['text'] });
    }

    // --- collections ----------------------------------------------------
    case 'collections.get':
    case 'collections.delete':
    case 'collections.duplicate': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      return ok({ collectionId: data['collectionId'] });
    }
    case 'collections.create': {
      if (!isString(data['name'], 500)) return fail('name required');
      const description = data['description'];
      if (description !== undefined && !isString(description, 5000)) return fail('invalid description');
      return ok({ name: data['name'], ...(description ? { description } : {}) });
    }
    case 'collections.rename': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['name'], 500)) return fail('name required');
      const description = data['description'];
      if (description !== undefined && !isString(description, 5000)) return fail('invalid description');
      return ok({
        collectionId: data['collectionId'],
        name: data['name'],
        ...(description !== undefined ? { description } : {}),
      });
    }
    case 'collections.folder.create': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['folderId'], MAX_ID_LENGTH)) return fail('folderId required');
      if (!isString(data['name'], 500)) return fail('name required');
      return ok({ collectionId: data['collectionId'], folderId: data['folderId'], name: data['name'] });
    }
    case 'collections.folder.rename': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['folderId'], MAX_ID_LENGTH)) return fail('folderId required');
      if (!isString(data['name'], 500)) return fail('name required');
      return ok({ collectionId: data['collectionId'], folderId: data['folderId'], name: data['name'] });
    }
    case 'collections.folder.delete': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['folderId'], MAX_ID_LENGTH)) return fail('folderId required');
      return ok({ collectionId: data['collectionId'], folderId: data['folderId'] });
    }
    case 'collections.request.save': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['folderId'], MAX_ID_LENGTH)) return fail('folderId required');
      const request = validateRequestDraft(data['request']);
      if (!request.ok) return fail(request.error ?? 'invalid request');
      const itemId = data['itemId'];
      if (itemId !== undefined && !isString(itemId, MAX_ID_LENGTH)) return fail('invalid itemId');
      return ok({
        collectionId: data['collectionId'],
        folderId: data['folderId'],
        request: request.value,
        ...(itemId ? { itemId } : {}),
      });
    }
    case 'collections.item.delete':
    case 'collections.item.duplicate': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['itemId'], MAX_ID_LENGTH)) return fail('itemId required');
      return ok({ collectionId: data['collectionId'], itemId: data['itemId'] });
    }
    case 'collections.item.rename': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['itemId'], MAX_ID_LENGTH)) return fail('itemId required');
      if (!isString(data['name'], 500)) return fail('name required');
      return ok({ collectionId: data['collectionId'], itemId: data['itemId'], name: data['name'] });
    }
    case 'collections.item.move': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['itemId'], MAX_ID_LENGTH)) return fail('itemId required');
      if (!isString(data['targetFolderId'], MAX_ID_LENGTH)) return fail('targetFolderId required');
      const index = data['index'];
      if (index !== undefined && !isNumber(index)) return fail('index must be a number');
      return ok({
        collectionId: data['collectionId'],
        itemId: data['itemId'],
        targetFolderId: data['targetFolderId'],
        ...(index !== undefined ? { index } : {}),
      });
    }
    case 'collections.import': {
      if (!isString(data['content'], 10_000_000)) return fail('content required');
      const format = data['format'];
      if (format !== undefined && !isString(format, 100)) return fail('invalid format');
      const source = data['source'];
      if (!isString(source, 1000)) return fail('source required');
      return ok({ content: data['content'], ...(format ? { format } : {}), source });
    }
    case 'collections.export': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      return ok({ collectionId: data['collectionId'] });
    }
    case 'collections.search': {
      if (!isString(data['query'], 500)) return fail('query required');
      return ok({ query: data['query'] });
    }
    case 'collections.saveFile': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      if (!isString(data['defaultName'], 300)) return fail('defaultName required');
      if (!isString(data['content'], 20_000_000)) return fail('content required');
      return ok({ collectionId: data['collectionId'], defaultName: data['defaultName'], content: data['content'] });
    }

    // --- environments ---------------------------------------------------
    case 'environments.create': {
      if (!isString(data['name'], 500)) return fail('name required');
      const description = data['description'];
      if (description !== undefined && !isString(description, 5000)) return fail('invalid description');
      return ok({ name: data['name'], ...(description ? { description } : {}) });
    }
    case 'environments.rename': {
      if (!isString(data['environmentId'], MAX_ID_LENGTH)) return fail('environmentId required');
      if (!isString(data['name'], 500)) return fail('name required');
      const description = data['description'];
      if (description !== undefined && !isString(description, 5000)) return fail('invalid description');
      return ok({
        environmentId: data['environmentId'],
        name: data['name'],
        ...(description !== undefined ? { description } : {}),
      });
    }
    case 'environments.delete':
    case 'environments.setActive':
    case 'environments.export': {
      if (!isString(data['environmentId'], MAX_ID_LENGTH)) return fail('environmentId required');
      return ok({ environmentId: data['environmentId'] });
    }
    case 'environments.variable.upsert': {
      if (!isString(data['environmentId'], MAX_ID_LENGTH)) return fail('environmentId required');
      const variable = data['variable'];
      if (!isPlainObject(variable)) return fail('variable required');
      if (!isString(variable['key'], 256)) return fail('variable.key required');
      if (!isString(variable['value'], 100_000)) return fail('variable.value must be a string');
      const global = data['global'];
      if (global !== undefined && !isBoolean(global)) return fail('global must be boolean');
      return ok({
        environmentId: data['environmentId'],
        variable: {
          id: isString(variable['id'], 200) ? variable['id'] : '',
          key: variable['key'],
          value: variable['value'],
          enabled: isBoolean(variable['enabled']) ? variable['enabled'] : true,
          ...(isBoolean(variable['secret']) ? { secret: variable['secret'] } : {}),
          ...(isString(variable['description'], 2000) ? { description: variable['description'] } : {}),
        },
        ...(global !== undefined ? { global } : {}),
      });
    }
    case 'environments.variable.delete': {
      if (!isString(data['environmentId'], MAX_ID_LENGTH)) return fail('environmentId required');
      if (!isString(data['variableId'], MAX_ID_LENGTH)) return fail('variableId required');
      const global = data['global'];
      if (global !== undefined && !isBoolean(global)) return fail('global must be boolean');
      return ok({
        environmentId: data['environmentId'],
        variableId: data['variableId'],
        ...(global !== undefined ? { global } : {}),
      });
    }
    case 'environments.import': {
      if (!isString(data['content'], 5_000_000)) return fail('content required');
      return ok({ content: data['content'] });
    }

    // --- history --------------------------------------------------------
    case 'history.search': {
      const filter = isPlainObject(data) ? data : {};
      const method = filter['method'];
      if (method !== undefined && method !== 'ALL' && !isHttpMethod(method)) return fail('invalid method');
      const statusGroup = filter['statusGroup'];
      const allowedGroups = ['success', 'redirect', 'clientError', 'serverError', 'error', 'ALL'];
      if (statusGroup !== undefined && (typeof statusGroup !== 'string' || !allowedGroups.includes(statusGroup))) {
        return fail('invalid statusGroup');
      }
      return ok({
        ...(isString(filter['search'], 500) ? { search: filter['search'] } : {}),
        ...(method ? { method } : {}),
        ...(statusGroup ? { statusGroup } : {}),
        ...(isString(filter['collectionId'], 200) ? { collectionId: filter['collectionId'] } : {}),
        ...(isString(filter['from'], 40) ? { from: filter['from'] } : {}),
        ...(isString(filter['to'], 40) ? { to: filter['to'] } : {}),
        ...(isNumber(filter['limit']) ? { limit: filter['limit'] } : {}),
      });
    }
    case 'history.delete': {
      if (!isString(data['entryId'], MAX_ID_LENGTH)) return fail('entryId required');
      return ok({ entryId: data['entryId'] });
    }
    case 'history.clear': {
      if (data['confirm'] !== true) return fail('confirm must be true');
      return ok({ confirm: true });
    }
    case 'history.cleanup': {
      if (!isNumber(data['keepLast'])) return fail('keepLast required');
      return ok({ keepLast: data['keepLast'] });
    }
    case 'history.rerun': {
      if (!isString(data['entryId'], MAX_ID_LENGTH)) return fail('entryId required');
      return ok({ entryId: data['entryId'] });
    }

    // --- tests ----------------------------------------------------------
    case 'tests.save': {
      if (!isString(data['requestId'], MAX_ID_LENGTH)) return fail('requestId required');
      if (!Array.isArray(data['tests'])) return fail('tests must be an array');
      if (data['tests'].length > 200) return fail('too many tests');
      return ok({ requestId: data['requestId'], tests: data['tests'] });
    }
    case 'tests.run': {
      if (!isString(data['requestId'], MAX_ID_LENGTH)) return fail('requestId required');
      const request = data['request'];
      let validatedRequest: unknown;
      if (request !== undefined) {
        const result = validateRequestDraft(request);
        if (!result.ok) return fail(result.error ?? 'invalid request');
        validatedRequest = result.value;
      }
      const environmentId = data['environmentId'];
      if (environmentId !== undefined && !isString(environmentId, 200)) return fail('invalid environmentId');
      return ok({
        requestId: data['requestId'],
        ...(validatedRequest ? { request: validatedRequest } : {}),
        ...(environmentId ? { environmentId } : {}),
      });
    }
    case 'tests.runCollection': {
      if (!isString(data['collectionId'], MAX_ID_LENGTH)) return fail('collectionId required');
      const environmentId = data['environmentId'];
      if (environmentId !== undefined && !isString(environmentId, 200)) return fail('invalid environmentId');
      return ok({ collectionId: data['collectionId'], ...(environmentId ? { environmentId } : {}) });
    }
    case 'tests.history': {
      const limit = data['limit'];
      if (limit !== undefined && !isNumber(limit)) return fail('limit must be a number');
      return ok({ ...(limit !== undefined ? { limit } : {}) });
    }

    // --- auth -----------------------------------------------------------
    case 'auth.storeCredential': {
      if (!isString(data['label'], 300)) return fail('label required');
      if (!isString(data['kind'], 50)) return fail('kind required');
      if (!isString(data['value'], 100_000)) return fail('value required');
      const existingSecretId = data['existingSecretId'];
      if (existingSecretId !== undefined && !isString(existingSecretId, 200)) return fail('invalid existingSecretId');
      return ok({
        label: data['label'],
        kind: data['kind'],
        value: data['value'],
        ...(existingSecretId ? { existingSecretId } : {}),
      });
    }
    case 'auth.deleteCredential': {
      if (!isString(data['secretId'], 200)) return fail('secretId required');
      return ok({ secretId: data['secretId'] });
    }
    case 'auth.oauth2Authorize': {
      if (!isString(data['requestId'], MAX_ID_LENGTH)) return fail('requestId required');
      const auth = data['auth'];
      if (!isPlainObject(auth)) return fail('auth required');
      if (auth['type'] !== 'oauth2') return fail('auth.type must be oauth2');
      return ok({ requestId: data['requestId'], auth });
    }
    case 'auth.oauth2Clear': {
      if (!isString(data['requestId'], MAX_ID_LENGTH)) return fail('requestId required');
      const auth = data['auth'];
      if (!isPlainObject(auth)) return fail('auth required');
      if (auth['type'] !== 'oauth2') return fail('auth.type must be oauth2');
      return ok({ requestId: data['requestId'], auth });
    }

    // --- settings -------------------------------------------------------
    case 'settings.update': {
      const patch = data['patch'];
      if (!isPlainObject(patch)) return fail('patch required');
      return ok({ patch });
    }

    default:
      return fail('unhandled message type');
  }
}

interface DraftResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Validate the request draft shape. Lenient about nested detail (rows are
 * re-validated downstream by RequestValidator) but strict about types and
 * sizes so a malicious payload cannot exhaust memory.
 */
export function validateRequestDraft(raw: unknown): DraftResult {
  if (!isPlainObject(raw)) return { ok: false, error: 'request must be an object' };
  if (!isString(raw['id'], MAX_ID_LENGTH) || !raw['id']) return { ok: false, error: 'request.id required' };
  if (!isString(raw['name'], 500)) return { ok: false, error: 'request.name must be a string' };
  const method = raw['method'];
  if (!isHttpMethod(method)) return { ok: false, error: `unsupported method "${String(method)}"` };
  if (!isString(raw['url'], 8192)) return { ok: false, error: 'request.url must be a string' };
  if (!Array.isArray(raw['params'])) return { ok: false, error: 'request.params must be an array' };
  if (!Array.isArray(raw['headers'])) return { ok: false, error: 'request.headers must be an array' };
  if (raw['params'].length > 500 || raw['headers'].length > 500) {
    return { ok: false, error: 'too many params/headers (max 500)' };
  }
  if (!isPlainObject(raw['body'])) return { ok: false, error: 'request.body must be an object' };
  if (!isPlainObject(raw['authentication'])) return { ok: false, error: 'request.authentication must be an object' };
  if (!isPlainObject(raw['settings'])) return { ok: false, error: 'request.settings must be an object' };
  if (!isNumber(raw['timeout'])) return { ok: false, error: 'request.timeout must be a number' };

  const params = raw['params'].map((row: unknown) => normalizeRow(row)).filter(Boolean);
  const headers = raw['headers'].map((row: unknown) => normalizeRow(row)).filter(Boolean);
  const bodyRaw = raw['body'] as Record<string, unknown>;
  const body = {
    type: normalizeBodyType(bodyRaw['type']),
    ...(isString(bodyRaw['text'], 5_000_000) ? { text: bodyRaw['text'] } : {}),
    ...(Array.isArray(bodyRaw['formParams'])
      ? { formParams: bodyRaw['formParams'].map((r: unknown) => normalizeRow(r)).filter(Boolean) }
      : {}),
    ...(Array.isArray(bodyRaw['multipartParts'])
      ? {
          multipartParts: bodyRaw['multipartParts']
            .map((r: unknown) => normalizeMultipartPart(r))
            .filter(Boolean),
        }
      : {}),
    ...(isString(bodyRaw['contentType'], 500) ? { contentType: bodyRaw['contentType'] } : {}),
  };

  const authRaw = raw['authentication'] as Record<string, unknown>;
  const authentication = normalizeAuth(authRaw);

  const settingsRaw = raw['settings'] as Record<string, unknown>;

  return {
    ok: true,
    value: {
      id: raw['id'],
      name: sanitizeText(raw['name'], { maxLength: 500 }),
      method,
      url: sanitizeText(raw['url'], { maxLength: 8192 }),
      params,
      headers,
      body,
      authentication,
      timeout: Math.min(600000, Math.max(100, raw['timeout'])),
      ...(isString(raw['environmentId'], 200) ? { environmentId: raw['environmentId'] } : {}),
      settings: {
        followRedirects: isBoolean(settingsRaw['followRedirects']) ? settingsRaw['followRedirects'] : true,
        ...(isNumber(settingsRaw['maxRedirects']) ? { maxRedirects: settingsRaw['maxRedirects'] } : {}),
        ...(isNumber(settingsRaw['timeout']) ? { timeout: settingsRaw['timeout'] } : {}),
        ...(isBoolean(settingsRaw['removeUserAgent']) ? { removeUserAgent: settingsRaw['removeUserAgent'] } : {}),
        ...(isBoolean(settingsRaw['validateSsl']) ? { validateSsl: settingsRaw['validateSsl'] } : {}),
      },
      ...(isString(raw['createdAt'], 40) ? { createdAt: raw['createdAt'] } : {}),
      ...(isString(raw['updatedAt'], 40) ? { updatedAt: raw['updatedAt'] } : {}),
    },
  };
}

function normalizeRow(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  if (!isString(raw['key'], 5000) || !isString(raw['value'], 500_000)) return null;
  return {
    id: isString(raw['id'], 200) && raw['id'] ? raw['id'] : `row_${Math.random().toString(36).slice(2, 10)}`,
    key: raw['key'],
    value: raw['value'],
    ...(isString(raw['description'], 2000) ? { description: raw['description'] } : {}),
    enabled: isBoolean(raw['enabled']) ? raw['enabled'] : true,
  };
}

function normalizeMultipartPart(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  if (!isString(raw['name'], 500) || !isString(raw['value'], 1_000_000)) return null;
  return {
    id: isString(raw['id'], 200) && raw['id'] ? raw['id'] : `part_${Math.random().toString(36).slice(2, 10)}`,
    name: raw['name'],
    value: raw['value'],
    kind: raw['kind'] === 'file' ? 'file' : 'text',
    ...(isString(raw['fileName'], 500) ? { fileName: raw['fileName'] } : {}),
    ...(isString(raw['contentType'], 200) ? { contentType: raw['contentType'] } : {}),
    enabled: isBoolean(raw['enabled']) ? raw['enabled'] : true,
  };
}

function normalizeBodyType(raw: unknown): 'none' | 'json' | 'text' | 'xml' | 'formUrlEncoded' | 'multipart' {
  const allowed = ['none', 'json', 'text', 'xml', 'formUrlEncoded', 'multipart'];
  return typeof raw === 'string' && allowed.includes(raw)
    ? (raw as 'none' | 'json' | 'text' | 'xml' | 'formUrlEncoded' | 'multipart')
    : 'none';
}

function normalizeAuth(raw: Record<string, unknown>): Record<string, unknown> {
  const type = raw['type'];
  switch (type) {
    case 'bearer':
      return {
        type: 'bearer',
        token: isString(raw['token'], 50_000) ? sanitizeMultiline(raw['token'], 50_000) : '',
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
        key: isString(raw['key'], 500) ? raw['key'] : '',
        value: isString(raw['value'], 50_000) ? raw['value'] : '',
        ...(isString(raw['secretId'], 200) ? { secretId: raw['secretId'] } : {}),
        placement: raw['placement'] === 'query' || raw['placement'] === 'cookie' ? raw['placement'] : 'header',
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        grant: raw['grant'] === 'authorizationCodePkce' ? 'authorizationCodePkce' : 'clientCredentials',
        tokenUrl: isString(raw['tokenUrl'], 2000) ? raw['tokenUrl'] : '',
        ...(isString(raw['authorizationUrl'], 2000) ? { authorizationUrl: raw['authorizationUrl'] } : {}),
        clientId: isString(raw['clientId'], 500) ? raw['clientId'] : '',
        ...(isString(raw['clientSecret'], 5000) ? { clientSecret: raw['clientSecret'] } : {}),
        ...(isString(raw['clientSecretId'], 200) ? { clientSecretId: raw['clientSecretId'] } : {}),
        ...(isString(raw['scope'], 1000) ? { scope: raw['scope'] } : {}),
        ...(isString(raw['audience'], 1000) ? { audience: raw['audience'] } : {}),
        ...(isString(raw['accessTokenSecretId'], 200) ? { accessTokenSecretId: raw['accessTokenSecretId'] } : {}),
        ...(isString(raw['refreshTokenSecretId'], 200) ? { refreshTokenSecretId: raw['refreshTokenSecretId'] } : {}),
        ...(isNumber(raw['expiresAt']) ? { expiresAt: raw['expiresAt'] } : {}),
      };
    default:
      return { type: 'none' };
  }
}

export { HTTP_METHODS, isStringArray };
