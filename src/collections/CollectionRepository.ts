/**
 * CollectionRepository — persistence for collections.json.
 */
import type { Collection, CollectionSummary } from '../types/Collection';
import type { StorageProvider } from '../types/Storage';
import { validateCollection } from './CollectionValidator';
import { countFolders, countRequests } from '../types/Collection';
import { logger } from '../utils/Logger';

const FILE = 'collections.json';

interface CollectionsDocument {
  collections: Collection[];
}

export class CollectionRepository {
  private cache: Collection[] | null = null;
  private loading: Promise<Collection[]> | null = null;
  readonly loadWarnings: string[] = [];

  constructor(private readonly storage: StorageProvider) {}

  private async load(): Promise<Collection[]> {
    if (this.cache) return this.cache;
    if (!this.loading) {
      this.loading = (async () => {
        const result = await this.storage.read<Partial<CollectionsDocument>>(FILE);
        this.loadWarnings.push(...result.messages);
        const raw = result.data;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.collections)
            ? (raw.collections as unknown[])
            : [];
        const collections: Collection[] = [];
        for (const [index, entry] of list.entries()) {
          const validated = validateCollection(entry);
          if (validated.ok && validated.value) {
            collections.push(validated.value);
            this.loadWarnings.push(...validated.warnings);
          } else {
            // Never silently discard: quarantine invalid entries as notes.
            const note = `Collection at index ${index} was rejected: ${validated.errors.join('; ')}`;
            logger.error(note);
            this.loadWarnings.push(note);
          }
        }
        this.cache = collections;
        return collections;
      })();
    }
    return this.loading;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    await this.storage.write(FILE, { collections: this.cache } satisfies CollectionsDocument);
  }

  list(): Promise<Collection[]> {
    return this.load();
  }

  async get(id: string): Promise<Collection | null> {
    const collections = await this.load();
    return collections.find((c) => c.id === id) ?? null;
  }

  /** Get a deep copy so callers can mutate freely then `replace`. */
  async getCopy(id: string): Promise<Collection | null> {
    const collection = await this.get(id);
    return collection ? structuredClone(collection) : null;
  }

  async add(collection: Collection): Promise<void> {
    const collections = await this.load();
    collections.push(collection);
    await this.persist();
  }

  /** Replace an existing collection (by id) with the given version. */
  async replace(collection: Collection): Promise<boolean> {
    const collections = await this.load();
    const index = collections.findIndex((c) => c.id === collection.id);
    if (index === -1) return false;
    collections[index] = collection;
    await this.persist();
    return true;
  }

  async remove(id: string): Promise<boolean> {
    const collections = await this.load();
    const index = collections.findIndex((c) => c.id === id);
    if (index === -1) return false;
    collections.splice(index, 1);
    await this.persist();
    return true;
  }

  async replaceAll(collections: Collection[]): Promise<void> {
    await this.load();
    this.cache = collections;
    await this.persist();
  }

  async summaries(): Promise<CollectionSummary[]> {
    const collections = await this.load();
    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      ...(collection.description ? { description: collection.description } : {}),
      requestCount: countRequests(collection.items),
      folderCount: countFolders(collection.items),
      updatedAt: collection.updatedAt,
    }));
  }

  /** Reload from disk (after import/restore or external modification). */
  invalidate(): void {
    this.cache = null;
    this.loading = null;
  }
}
