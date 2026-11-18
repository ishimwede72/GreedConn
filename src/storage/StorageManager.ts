/**
 * StorageManager — composition root for the storage layer.
 *
 * Responsibilities:
 *  - resolve the data directory under `context.globalStorageUri`
 *  - construct the JSON provider with migrations
 *  - expose repositories through a single object graph
 *  - surface corruption/migration notices to the UI
 */
import * as path from 'path';
import type * as vscode from 'vscode';
import { JsonStorage } from './JsonStorage';
import { BackupManager } from './BackupManager';
import { migrations } from './StorageMigration';
import { CollectionRepository } from '../collections/CollectionRepository';
import { EnvironmentRepository } from '../environments/EnvironmentRepository';
import { HistoryRepository } from '../history/HistoryRepository';
import { SettingsStorage } from './repositories/SettingsStorage';
import { TestRunsRepository } from './repositories/TestRunsStorage';
import { SCHEMA_VERSION } from '../types/Storage';
import { logger } from '../utils/Logger';

export interface StorageManagerOptions {
  context: vscode.ExtensionContext;
  onNotice?: (message: string) => void;
}

export class StorageManager {
  readonly provider: JsonStorage;
  readonly collections: CollectionRepository;
  readonly environments: EnvironmentRepository;
  readonly history: HistoryRepository;
  readonly settings: SettingsStorage;
  readonly testRuns: TestRunsRepository;
  readonly backups: BackupManager;
  readonly directory: string;
  readonly notices: string[] = [];

  constructor(options: StorageManagerOptions) {
    const storageUri = options.context.globalStorageUri;
    this.directory = storageUri.fsPath;

    this.provider = new JsonStorage({
      directory: this.directory,
      version: SCHEMA_VERSION,
      migrations,
      backups: 3,
      onCorrupted: (file, quarantinePath) => {
        const message = `Greedcon: "${file}" was corrupted. A copy was kept at ${quarantinePath} and the last good backup was restored.`;
        this.notices.push(message);
        logger.error(message);
        options.onNotice?.(message);
      },
    });

    this.collections = new CollectionRepository(this.provider);
    this.environments = new EnvironmentRepository(this.provider);
    this.history = new HistoryRepository(this.provider);
    this.settings = new SettingsStorage(this.provider);
    this.testRuns = new TestRunsRepository(this.provider);
    this.backups = new BackupManager(this.directory);
  }

  /** Create the storage directory and take a startup snapshot. */
  async initialize(): Promise<void> {
    await this.provider.ensureDirectory();
    // Load all documents eagerly so migration/corruption notices surface once.
    await Promise.all([
      this.collections.list(),
      this.environments.list(),
      this.history.list(),
      this.settings.get(),
      this.testRuns.list(1),
    ]);
    for (const message of this.collections.loadWarnings) {
      this.notices.push(message);
    }
    logger.info(`storage initialized at ${path.basename(this.directory)} (schema v${SCHEMA_VERSION})`);
  }

  takeNotices(): string[] {
    return [...this.notices];
  }
}
