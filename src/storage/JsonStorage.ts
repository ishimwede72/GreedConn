/**
 * JsonStorage — file-backed StorageProvider with:
 *  - atomic writes (tmp + rename)
 *  - schema versioning and migration hooks
 *  - corruption quarantine (never silently overwrites user data)
 *  - rotating backups
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  StorageDocument,
  StorageFileName,
  StorageLoadResult,
  StorageProvider,
} from '../types/Storage';
import {
  copyIfExists,
  pathExists,
  readTextIfExists,
  rotateBackups,
  writeJsonAtomic,
} from '../utils/FileUtils';
import { logger } from '../utils/Logger';

export type MigrationFn = (
  doc: StorageDocument<unknown>,
  messages: string[],
) => StorageDocument<unknown>;

export interface JsonStorageOptions {
  directory: string;
  /** Current schema version written into every document. */
  version: number;
  /** Migrations keyed by the version they upgrade *from*. */
  migrations?: Record<number, MigrationFn>;
  /** Number of rotating backups to keep per file (0 disables). */
  backups?: number;
  /** Called when a file is corrupted so the app can notify the user. */
  onCorrupted?: (file: StorageFileName, quarantinePath: string) => void;
}

export class JsonStorage implements StorageProvider {
  private readonly directory: string;
  private readonly version: number;
  private readonly migrations: Record<number, MigrationFn>;
  private readonly backups: number;
  private readonly onCorrupted?: (file: StorageFileName, quarantinePath: string) => void;

  constructor(options: JsonStorageOptions) {
    this.directory = options.directory;
    this.version = options.version;
    this.migrations = options.migrations ?? {};
    this.backups = options.backups ?? 3;
    this.onCorrupted = options.onCorrupted;
  }

  resolve(file: StorageFileName): string {
    // Only known file names are accepted (prevents path traversal).
    const base = path.basename(file);
    if (base !== file || !file.endsWith('.json')) {
      throw new Error(`Invalid storage file name: ${file}`);
    }
    return path.join(this.directory, file);
  }

  async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
  }

  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.directory);
      return entries.filter((name) => name.endsWith('.json'));
    } catch {
      return [];
    }
  }

  async read<T>(file: StorageFileName): Promise<StorageLoadResult<T>> {
    await this.ensureDirectory();
    const filePath = this.resolve(file);
    const messages: string[] = [];

    const raw = await readTextIfExists(filePath);
    if (raw === null) {
      // Attempt recovery from a backup when the primary file is missing.
      const recovered = await this.recoverFromBackup(filePath, messages);
      if (recovered === null) {
        return { status: 'missing', data: undefined as T, messages };
      }
      return this.finalize(file, recovered, messages, filePath);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Corrupted file: quarantine it, try backups, never overwrite in place.
      const quarantine = await this.quarantine(filePath, raw, messages);
      this.onCorrupted?.(file, quarantine);
      const recovered = await this.recoverFromBackup(filePath, messages);
      if (recovered !== null) {
        return this.finalize(file, recovered, messages, filePath);
      }
      logger.error(`storage file ${file} is corrupted and no backup was recoverable`, error);
      return { status: 'corrupted', data: undefined as T, messages };
    }

    if (!isStorageDocument(parsed)) {
      // Legacy/unwrapped payload: wrap it and migrate forward.
      const wrapped: StorageDocument<unknown> = {
        version: 1,
        updatedAt: new Date().toISOString(),
        data: parsed,
      };
      messages.push(`Legacy format detected in ${file}; migrating to version ${this.version}.`);
      return this.finalize(file, wrapped, messages, filePath);
    }

    return this.finalize(file, parsed as StorageDocument<T>, messages, filePath);
  }

  private async finalize<T>(
    file: StorageFileName,
    doc: StorageDocument<unknown>,
    messages: string[],
    filePath: string,
  ): Promise<StorageLoadResult<T>> {
    let current: StorageDocument<unknown> = doc;
    let migrated = false;

    while (current.version < this.version) {
      const migrate = this.migrations[current.version];
      if (!migrate) {
        messages.push(`No migration available from version ${current.version}; loading as-is.`);
        break;
      }
      const next = migrate(current, messages);
      current = { ...next, version: current.version + 1 };
      migrated = true;
      messages.push(`Migrated ${file} to schema version ${current.version}.`);
    }

    if (current.version > this.version) {
      messages.push(
        `${file} was written by a newer version of Greedcon (schema ${current.version} > ${this.version}); loading best-effort.`,
      );
    }

    if (migrated) {
      try {
        await writeJsonAtomic(filePath, current);
        await this.backupFile(filePath);
      } catch (error) {
        logger.error(`failed to persist migration for ${file}`, error);
        messages.push(`Warning: could not persist migration for ${file}.`);
      }
    }

    return {
      status: migrated ? 'migrated' : 'ok',
      data: current.data as T,
      messages,
    };
  }

  async write<T>(file: StorageFileName, data: T): Promise<void> {
    await this.ensureDirectory();
    const filePath = this.resolve(file);
    const doc: StorageDocument<T> = {
      version: this.version,
      updatedAt: new Date().toISOString(),
      data,
    };
    if (this.backups > 0 && (await pathExists(filePath))) {
      await this.backupFile(filePath);
    }
    await writeJsonAtomic(filePath, doc);
  }

  /** Keep a single pre-write snapshot plus rotated history. */
  private async backupFile(filePath: string): Promise<void> {
    try {
      await rotateBackups(filePath, this.backups);
    } catch (error) {
      logger.warn('backup rotation failed', error);
    }
  }

  async backup(file: StorageFileName): Promise<string | null> {
    const filePath = this.resolve(file);
    if (!(await pathExists(filePath))) return null;
    const destination = `${filePath}.manual.${Date.now()}.bak`;
    await copyIfExists(filePath, destination);
    return destination;
  }

  private async quarantine(filePath: string, raw: string, messages: string[]): Promise<string> {
    const quarantinePath = `${filePath}.corrupt.${Date.now()}`;
    try {
      await fs.writeFile(quarantinePath, raw, 'utf8');
      messages.push(`Corrupted file quarantined to ${path.basename(quarantinePath)}.`);
      return quarantinePath;
    } catch (error) {
      logger.error('failed to quarantine corrupted file', error);
      messages.push('Corrupted file could not be quarantined.');
      return filePath;
    }
  }

  private async recoverFromBackup(
    filePath: string,
    messages: string[],
  ): Promise<StorageDocument<unknown> | null> {
    const candidates: string[] = [];
    for (let i = 1; i <= this.backups + 1; i += 1) {
      candidates.push(`${filePath}.bak.${i}`);
    }
    candidates.push(`${filePath}.manual.bak`);

    for (const candidate of candidates) {
      const raw = await readTextIfExists(candidate);
      if (raw === null) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isStorageDocument(parsed)) {
          messages.push(`Recovered data from backup ${path.basename(candidate)}.`);
          return parsed;
        }
        if (parsed !== null && typeof parsed === 'object') {
          messages.push(`Recovered legacy data from backup ${path.basename(candidate)}.`);
          return { version: 1, updatedAt: new Date().toISOString(), data: parsed };
        }
      } catch {
        /* try next candidate */
      }
    }
    return null;
  }
}

export function isStorageDocument(value: unknown): value is StorageDocument<unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const doc = value as Partial<StorageDocument<unknown>>;
  return typeof doc.version === 'number' && 'data' in doc;
}
