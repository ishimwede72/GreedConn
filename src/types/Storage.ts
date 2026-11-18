/**
 * Storage-layer types: schema versions, persisted documents and provider
 * abstraction contracts.
 */

export const SCHEMA_VERSION = 2;

/** Document envelope stored in every JSON file. */
export interface StorageDocument<T> {
  /** Schema version — drives migrations. */
  version: number;
  /** ISO timestamp of the last write. */
  updatedAt: string;
  data: T;
}

export type StorageFileName =
  'collections.json' | 'environments.json' | 'history.json' | 'settings.json' | 'testRuns.json';

export type StorageStatus = 'ok' | 'corrupted' | 'missing' | 'migrated' | 'error';

export interface StorageLoadResult<T> {
  status: StorageStatus;
  data: T;
  /** Human readable notes (migration applied, corrupted file quarantined...). */
  messages: string[];
}

export interface StorageProvider {
  read<T>(file: StorageFileName): Promise<StorageLoadResult<T>>;
  write<T>(file: StorageFileName, data: T): Promise<void>;
  list(): Promise<string[]>;
  backup(file: StorageFileName): Promise<string | null>;
}

export interface SettingsState {
  version: number;
  /** Last active environment id ('' = no environment). */
  activeEnvironmentId: string;
  /** Last selected navigation page. */
  lastPage?: string;
  /** UI preferences. */
  ui: {
    sidebarCollapsed?: boolean;
    responseViewMode?: 'pretty' | 'raw' | 'preview';
    requestTab?: string;
  };
  /** Recently executed request drafts keyed by tab id. */
  updatedAt: string;
  /** Current request builder draft (restored when the webview reloads). */
  draft?: import('./Request').HttpRequestModel | null;
}

export function defaultSettings(): SettingsState {
  return {
    version: SCHEMA_VERSION,
    activeEnvironmentId: '',
    ui: {},
    updatedAt: new Date().toISOString(),
  };
}
