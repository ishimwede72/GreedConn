/**
 * Webview <-> extension message contract.
 *
 * Every webview message is `{ id, type, data }` (a request expecting a reply).
 * The extension answers with `{ id, ok, data | error }` and may additionally
 * push unsolicited `{ type: 'event', name, data }` messages.
 *
 * Validation happens on both sides:
 *  - webview: `webview/services/VsCodeBridge.ts` validates outbound shapes
 *  - host:    `src/messaging/MessageValidator.ts` validates inbound shapes
 */
import type { Collection, CollectionSummary, ImportResult } from './Collection';
import type { Environment, EnvironmentVariable, GlobalVariables } from './Environment';
import type { HistoryEntry, HistoryFilter } from './History';
import type { AuthConfig, HttpMethod, HttpRequestModel, KeyValueRow, OAuth2Auth, RequestBody } from './Request';
import type { HttpResponseModel } from './Response';
import type { SettingsState } from './Storage';
import type { TestDefinition, TestRunHistoryEntry, TestRunResult } from './Testing';

export type PageId =
  'welcome' | 'requests' | 'collections' | 'environments' | 'history' | 'tests' | 'settings';

export const PAGE_IDS: readonly PageId[] = [
  'welcome',
  'requests',
  'collections',
  'environments',
  'history',
  'tests',
  'settings',
];

/** --- inbound (webview -> host) ------------------------------------- */

export interface WebviewRequestMessage<T = unknown> {
  id: string;
  type: string;
  data: T;
}

export interface InitPayload {
  page?: PageId;
}

export interface SendRequestPayload {
  /** The request as currently edited in the builder. */
  request: HttpRequestModel;
  /** Optional environment override (defaults to active environment). */
  environmentId?: string;
}

export interface SaveRequestPayload {
  collectionId: string;
  /** Folder id or '' for the collection root. */
  folderId: string;
  request: HttpRequestModel;
  itemId?: string;
}

export interface CollectionMutations {
  createCollection: { name: string; description?: string };
  renameCollection: { collectionId: string; name: string; description?: string };
  deleteCollection: { collectionId: string };
  duplicateCollection: { collectionId: string };
  createFolder: { collectionId: string; folderId: string; name: string };
  renameFolder: { collectionId: string; folderId: string; name: string };
  deleteFolder: { collectionId: string; folderId: string };
  saveRequest: SaveRequestPayload;
  deleteItem: { collectionId: string; itemId: string };
  renameItem: { collectionId: string; itemId: string; name: string };
  duplicateItem: { collectionId: string; itemId: string };
  moveItem: { collectionId: string; itemId: string; targetFolderId: string; index?: number };
  importCollection: { content: string; format?: string; source: string };
  exportCollection: { collectionId: string };
  searchCollections: { query: string };
}

export interface EnvironmentMutations {
  createEnvironment: { name: string; description?: string };
  renameEnvironment: { environmentId: string; name: string; description?: string };
  deleteEnvironment: { environmentId: string };
  setActiveEnvironment: { environmentId: string };
  upsertVariable: {
    environmentId: string;
    variable: EnvironmentVariable;
    /** When true the variable is written to global scope instead. */
    global?: boolean;
  };
  deleteVariable: { environmentId: string; variableId: string; global?: boolean };
}

export interface HistoryMutations {
  searchHistory: HistoryFilter;
  deleteHistoryEntry: { entryId: string };
  clearHistory: { confirm: true };
  cleanupHistory: { keepLast: number };
}

export interface TestMutations {
  saveTests: { requestId: string; tests: TestDefinition[] };
  runTests: { requestId: string; request?: HttpRequestModel; environmentId?: string };
  runCollectionTests: { collectionId: string; environmentId?: string };
  getTestHistory: { limit?: number };
}

export interface AuthMutations {
  /** Persist a secret credential, returns the opaque secret id. */
  storeCredential: { label: string; kind: string; value: string; existingSecretId?: string };
  deleteCredential: { secretId: string };
  /** Trigger the OAuth2 flow and store the resulting token set. */
  oauth2Authorize: { requestId: string; auth: AuthConfig };
  oauth2Clear: { requestId: string; auth: OAuth2Auth };
}

/** Map of message type -> payload for compile-time checks. */
export interface WebviewMessageMap {
  'app.init': InitPayload;
  'app.navigate': { page: PageId };
  'app.getState': Record<string, never>;
  'app.openSettings': Record<string, never>;
  'app.openExternal': { url: string };
  'app.saveDraft': { request: HttpRequestModel };
  'request.send': SendRequestPayload;
  'request.cancel': Record<string, never>;
  'request.formatJson': { text: string };
  'request.validateJson': { text: string };
  'collections.list': Record<string, never>;
  'collections.get': { collectionId: string };
  'collections.create': CollectionMutations['createCollection'];
  'collections.rename': CollectionMutations['renameCollection'];
  'collections.delete': CollectionMutations['deleteCollection'];
  'collections.duplicate': CollectionMutations['duplicateCollection'];
  'collections.folder.create': CollectionMutations['createFolder'];
  'collections.folder.rename': CollectionMutations['renameFolder'];
  'collections.folder.delete': CollectionMutations['deleteFolder'];
  'collections.request.save': CollectionMutations['saveRequest'];
  'collections.item.delete': CollectionMutations['deleteItem'];
  'collections.item.rename': CollectionMutations['renameItem'];
  'collections.item.duplicate': CollectionMutations['duplicateItem'];
  'collections.item.move': CollectionMutations['moveItem'];
  'collections.import': CollectionMutations['importCollection'];
  'collections.export': CollectionMutations['exportCollection'];
  'collections.search': CollectionMutations['searchCollections'];
  'collections.pickFile': Record<string, never>;
  'collections.saveFile': { collectionId: string; defaultName: string; content: string };
  'environments.list': Record<string, never>;
  'environments.create': EnvironmentMutations['createEnvironment'];
  'environments.rename': EnvironmentMutations['renameEnvironment'];
  'environments.delete': EnvironmentMutations['deleteEnvironment'];
  'environments.setActive': EnvironmentMutations['setActiveEnvironment'];
  'environments.variable.upsert': EnvironmentMutations['upsertVariable'];
  'environments.variable.delete': EnvironmentMutations['deleteVariable'];
  'environments.import': { content: string };
  'environments.export': { environmentId: string };
  'history.search': HistoryMutations['searchHistory'];
  'history.delete': HistoryMutations['deleteHistoryEntry'];
  'history.clear': HistoryMutations['clearHistory'];
  'history.cleanup': HistoryMutations['cleanupHistory'];
  'history.rerun': { entryId: string };
  'tests.save': TestMutations['saveTests'];
  'tests.run': TestMutations['runTests'];
  'tests.runCollection': TestMutations['runCollectionTests'];
  'tests.history': TestMutations['getTestHistory'];
  'auth.storeCredential': AuthMutations['storeCredential'];
  'auth.deleteCredential': AuthMutations['deleteCredential'];
  'auth.oauth2Authorize': AuthMutations['oauth2Authorize'];
  'auth.oauth2Clear': AuthMutations['oauth2Clear'];
  'settings.get': Record<string, never>;
  'settings.update': { patch: Partial<SettingsState> };
  'demo.seed': Record<string, never>;
}

export type WebviewMessageType = keyof WebviewMessageMap;

/** --- outbound (host -> webview) ------------------------------------ */

export interface WebviewResponseMessage<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface WebviewEventMap {
  /** A request started / finished. */
  'request.started': { requestId: string };
  'request.progress': { requestId: string; phase: string; detail?: string };
  'request.completed': {
    requestId: string;
    response: HttpResponseModel | null;
    error?: { code: string; message: string };
    testRun?: TestRunResult;
  };
  'request.cancelled': { requestId: string };
  'collections.changed': { collections: CollectionSummary[] };
  'environments.changed': { environments: Environment[]; activeId: string };
  'history.changed': { count: number };
  'settings.changed': { settings: SettingsState };
  /** Ask the webview to switch pages (used by commands/tree views). */
  'page.changed': { page: PageId };
  toast: { level: 'info' | 'success' | 'warning' | 'error'; message: string };
  log: { level: 'info' | 'warn' | 'error'; message: string };
}

export type WebviewEventName = keyof WebviewEventMap;

export interface WebviewEventMessage<N extends WebviewEventName = WebviewEventName> {
  type: 'event';
  name: N;
  data: WebviewEventMap[N];
}

export type AnyWebviewMessage = WebviewResponseMessage | WebviewEventMessage;

/** --- payload shapes for replies (documented for the webview) -------- */

export interface AppInitData {
  page: PageId;
  version: string;
  collections: CollectionSummary[];
  environments: Environment[];
  activeEnvironmentId: string;
  settings: SettingsState;
  historyCount: number;
  /** The current draft request (restores the builder after reload). */
  draft: HttpRequestModel | null;
  globalVariables: GlobalVariables;
  /** Capabilities the host supports (used to feature-gate the UI). */
  capabilities: { oauth2: boolean; multipart: boolean; testRuns: boolean };
}

export interface CollectionsListData {
  collections: Collection[];
}

export interface HistoryListData {
  entries: HistoryEntry[];
  total: number;
}

export interface TestHistoryData {
  runs: TestRunHistoryEntry[];
}

export type { Collection, CollectionSummary, ImportResult, KeyValueRow, RequestBody, HttpMethod };
