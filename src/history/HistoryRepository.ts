/**
 * HistoryRepository — persistence for history.json.
 */
import type { HistoryEntry, HistoryFilter } from '../types/History';
import type { StorageProvider } from '../types/Storage';
import { logger } from '../utils/Logger';

const FILE = 'history.json';

interface HistoryDocument {
  entries: HistoryEntry[];
}

export class HistoryRepository {
  private cache: HistoryEntry[] | null = null;
  private loading: Promise<HistoryEntry[]> | null = null;

  constructor(private readonly storage: StorageProvider) {}

  private async load(): Promise<HistoryEntry[]> {
    if (this.cache) return this.cache;
    if (!this.loading) {
      this.loading = (async () => {
        const result = await this.storage.read<Partial<HistoryDocument>>(FILE);
        const raw = result.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
        const entries: HistoryEntry[] = [];
        for (const entry of list) {
          if (
            entry &&
            typeof entry === 'object' &&
            typeof (entry as HistoryEntry).id === 'string' &&
            typeof (entry as HistoryEntry).url === 'string'
          ) {
            entries.push(entry as HistoryEntry);
          }
        }
        // Newest first ordering guarantee.
        entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        this.cache = entries;
        return entries;
      })();
    }
    return this.loading;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    await this.storage.write(FILE, { entries: this.cache } satisfies HistoryDocument);
  }

  async list(): Promise<HistoryEntry[]> {
    return this.load();
  }

  async add(entry: HistoryEntry, limit: number): Promise<void> {
    const entries = await this.load();
    entries.unshift(entry);
    if (entries.length > limit) {
      entries.length = limit;
    }
    await this.persist();
  }

  async get(id: string): Promise<HistoryEntry | null> {
    const entries = await this.load();
    return entries.find((e) => e.id === id) ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const entries = await this.load();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return false;
    entries.splice(index, 1);
    await this.persist();
    return true;
  }

  async clear(): Promise<number> {
    const entries = await this.load();
    const count = entries.length;
    this.cache = [];
    await this.persist();
    return count;
  }

  /** Keep only the newest `keepLast` entries. Returns removed count. */
  async cleanup(keepLast: number): Promise<number> {
    const entries = await this.load();
    if (entries.length <= keepLast) return 0;
    const removed = entries.length - keepLast;
    entries.length = keepLast;
    await this.persist();
    return removed;
  }

  async replaceAll(entries: HistoryEntry[]): Promise<void> {
    await this.load();
    this.cache = entries;
    await this.persist();
  }

  invalidate(): void {
    this.cache = null;
    this.loading = null;
  }
}
