/**
 * In-memory `StorageProvider` used by the history unit tests.
 *
 * Mirrors the async contract of the real JSON storage without touching the
 * file system: reads report `missing` for unknown files, writes deep-clone
 * the payload so tests observe what was actually persisted.
 */
import type {
  StorageFileName,
  StorageLoadResult,
  StorageProvider,
} from '../../../src/types/Storage';

export class MemoryStorage implements StorageProvider {
  private readonly files = new Map<string, unknown>();

  async read<T>(file: StorageFileName): Promise<StorageLoadResult<T>> {
    if (!this.files.has(file)) {
      return { status: 'missing', data: undefined as unknown as T, messages: [] };
    }
    return {
      status: 'ok',
      data: structuredClone(this.files.get(file)) as T,
      messages: [],
    };
  }

  async write<T>(file: StorageFileName, data: T): Promise<void> {
    this.files.set(file, structuredClone(data));
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async backup(file: StorageFileName): Promise<string | null> {
    const content = this.files.get(file);
    if (content === undefined) return null;
    const backupFile = `${file}.backup`;
    this.files.set(backupFile, structuredClone(content));
    return backupFile;
  }

  /** Raw persisted payload for assertions (not cloned). */
  raw(file: string): unknown {
    return this.files.get(file);
  }

  has(file: string): boolean {
    return this.files.has(file);
  }
}
