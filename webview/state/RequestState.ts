/**
 * RequestState — helpers around the request draft (builder) so page code
 * never mutates state ad hoc.
 */
import type { HttpRequestModel, KeyValueRow, HttpMethod, RequestBody, AuthConfig } from '../../src/types/Request';
import { createEmptyRequest, defaultRequestSettings } from '../../src/types/Request';
import type { HttpResponseModel } from '../../src/types/Response';
import type { TestDefinition } from '../../src/types/Testing';
import { state } from './AppState';

let counter = 0;

export function newRow(key = '', value = '', enabled = true): KeyValueRow {
  counter += 1;
  return {
    id: `row_${Date.now().toString(36)}_${counter}`,
    key,
    value,
    enabled,
  };
}

export function newRequestId(): string {
  counter += 1;
  return `req_${Date.now().toString(36)}_${counter}`;
}

export function ensureDraft(): HttpRequestModel {
  if (!state.draft) {
    state.draft = createEmptyRequest(newRequestId());
  }
  return state.draft;
}

export function updateDraft(mutator: (draft: HttpRequestModel) => void): void {
  const draft = ensureDraft();
  mutator(draft);
  draft.updatedAt = new Date().toISOString();
  state.emit('request');
}

export function setMethod(method: HttpMethod): void {
  updateDraft((draft) => {
    draft.method = method;
  });
}

export function setUrl(url: string): void {
  updateDraft((draft) => {
    draft.url = url;
  });
}

export function setTimeoutValue(timeout: number): void {
  updateDraft((draft) => {
    draft.timeout = timeout;
  });
}

export function addRow(kind: 'params' | 'headers'): void {
  updateDraft((draft) => {
    draft[kind].push(newRow());
  });
}

export function updateRow(
  kind: 'params' | 'headers',
  id: string,
  patch: Partial<KeyValueRow>,
): void {
  updateDraft((draft) => {
    const row = draft[kind].find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  });
}

export function removeRow(kind: 'params' | 'headers', id: string): void {
  updateDraft((draft) => {
    draft[kind] = draft[kind].filter((r) => r.id !== id);
  });
}

export function setBody(body: Partial<RequestBody>): void {
  updateDraft((draft) => {
    draft.body = { ...draft.body, ...body };
  });
}

export function setAuth(auth: AuthConfig): void {
  updateDraft((draft) => {
    draft.authentication = auth;
  });
}

export function setTests(tests: TestDefinition[]): void {
  updateDraft((draft) => {
    draft.tests = tests;
  });
}

export function setRequest(request: HttpRequestModel): void {
  state.draft = request;
  state.activeTests = request.tests ?? [];
  state.response = null;
  state.testRun = null;
  state.emit('request');
  state.emit('response');
  state.emit('tests');
}

export function newRequest(): HttpRequestModel {
  const request = createEmptyRequest(newRequestId());
  setRequest(request);
  return request;
}

export function setResponse(response: HttpResponseModel | null): void {
  state.response = response;
  state.emit('response');
}

export function defaultDraft(): HttpRequestModel {
  return {
    id: newRequestId(),
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    authentication: { type: 'none' },
    timeout: 30000,
    settings: defaultRequestSettings(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
