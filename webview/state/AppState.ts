/**
 * AppState — single source of truth for the webview UI.
 *
 * Kept intentionally small: page routing, loaded domain data and the current
 * request/response pair. Components subscribe to named change channels so a
 * small update does not force a full-page rerender.
 */
import type {
  AppInitData,
  CollectionSummary,
  PageId,
} from '../../src/types/Messages';
import type { Collection } from '../../src/types/Collection';
import type { Environment, EnvironmentVariable, GlobalVariables } from '../../src/types/Environment';
import type { HistoryEntry } from '../../src/types/History';
import type { HttpRequestModel } from '../../src/types/Request';
import type { HttpResponseModel } from '../../src/types/Response';
import type { SettingsState } from '../../src/types/Storage';
import type { TestRunHistoryEntry, TestRunResult, TestDefinition } from '../../src/types/Testing';

export interface ToastItem {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface RequestRunState {
  running: boolean;
  phase?: string;
  startedAt?: number;
}

type Listener = (payload?: unknown) => void;

const CHANNELS = [
  'page',
  'request',
  'response',
  'collections',
  'environments',
  'history',
  'tests',
  'settings',
  'toast',
  'init',
] as const;

export type Channel = (typeof CHANNELS)[number];

export class AppState {
  page: PageId = 'welcome';
  initialized = false;
  version = '0.0.0';

  draft: HttpRequestModel | null = null;
  response: HttpResponseModel | null = null;
  runState: RequestRunState = { running: false };
  lastWarnings: string[] = [];
  testRun: TestRunResult | null = null;

  collections: Collection[] = [];
  collectionSummaries: CollectionSummary[] = [];
  selectedCollectionId: string | null = null;

  environments: Environment[] = [];
  globals: EnvironmentVariable[] = [];
  activeEnvironmentId = '';

  history: HistoryEntry[] = [];
  historyTotal = 0;
  historyFilter: { search?: string; method?: string; statusGroup?: string } = {};

  testHistory: TestRunHistoryEntry[] = [];
  activeTests: TestDefinition[] = [];

  settings: SettingsState | null = null;
  globalVariables: GlobalVariables | null = null;

  toasts: ToastItem[] = [];
  private toastCounter = 0;

  private listeners = new Map<Channel | '*', Set<Listener>>();

  on(channel: Channel | '*', listener: Listener): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(channel: Channel, payload?: unknown): void {
    const set = this.listeners.get(channel);
    if (set) {
      for (const listener of set) {
        try {
          listener(payload);
        } catch (error) {
          console.error(`[greedcon] listener for "${channel}" failed`, error);
        }
      }
    }
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const listener of wildcard) listener({ channel, payload });
    }
  }

  applyInit(data: AppInitData): void {
    this.page = data.page;
    this.version = data.version;
    this.collectionSummaries = data.collections;
    this.environments = data.environments;
    this.activeEnvironmentId = data.activeEnvironmentId;
    this.settings = data.settings;
    this.draft = data.draft;
    this.globalVariables = data.globalVariables;
    this.initialized = true;
    this.activeTests = data.draft?.tests ?? [];
    this.emit('init');
    this.emit('page');
  }

  setPage(page: PageId): void {
    if (this.page === page) return;
    this.page = page;
    this.emit('page');
  }

  pushToast(level: ToastItem['level'], message: string): ToastItem {
    this.toastCounter += 1;
    const item: ToastItem = { id: this.toastCounter, level, message };
    this.toasts = [...this.toasts, item];
    this.emit('toast', item);
    return item;
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.emit('toast');
  }

  setCollections(collections: Collection[]): void {
    this.collections = collections;
    this.collectionSummaries = collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      ...(collection.description ? { description: collection.description } : {}),
      requestCount: countItems(collection.items, 'request'),
      folderCount: countItems(collection.items, 'folder'),
      updatedAt: collection.updatedAt,
    }));
    this.emit('collections');
  }

  setEnvironments(environments: Environment[], activeId?: string): void {
    this.environments = environments;
    if (activeId !== undefined) this.activeEnvironmentId = activeId;
    this.emit('environments');
  }
}

export const state = new AppState();

function countItems(items: Collection['items'], kind: 'request' | 'folder'): number {
  let count = 0;
  for (const item of items) {
    if (item.type === kind) count += 1;
    if (item.type === 'folder') count += countItems(item.items, kind);
  }
  return count;
}
