/**
 * CollectionManager — application-facing service for collection operations.
 * All mutations validate input, update timestamps and persist atomically.
 */
import type {
  Collection,
  CollectionItem,
  CollectionSummary,
  ImportResult,
} from '../types/Collection';
import type { HttpRequestModel } from '../types/Request';
import { CollectionRepository } from './CollectionRepository';
import { CollectionImporter } from './CollectionImporter';
import { CollectionExporter } from './CollectionExporter';
import { FolderManager } from './FolderManager';
import { RequestRepository } from './RequestRepository';
import { countFolders, countRequests } from '../types/Collection';
import { generateCollectionId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';
import { sanitizeText } from '../security/InputSanitizer';
import { logger } from '../utils/Logger';

export class CollectionManager {
  private readonly folders = new FolderManager();
  private readonly requests: RequestRepository;

  constructor(
    private readonly repository: CollectionRepository,
    private readonly importer = new CollectionImporter(),
    private readonly exporter = new CollectionExporter(),
  ) {
    this.requests = new RequestRepository(this.folders);
  }

  list(): Promise<Collection[]> {
    return this.repository.list();
  }

  summaries(): Promise<CollectionSummary[]> {
    return this.repository.summaries();
  }

  get(id: string): Promise<Collection | null> {
    return this.repository.get(id);
  }

  async replace(collection: Collection): Promise<void> {
    if (!(await this.repository.replace(collection))) {
      throw new Error('Collection not found.');
    }
  }

  get loadWarnings(): string[] {
    return this.repository.loadWarnings;
  }

  async create(name: string, description?: string): Promise<Collection> {
    const now = nowIso();
    const collection: Collection = {
      id: generateCollectionId(),
      name: sanitizeText(name, { maxLength: 200, trim: true }) || 'New Collection',
      ...(description ? { description: sanitizeText(description, { maxLength: 2000, trim: true }) } : {}),
      items: [],
      createdAt: now,
      updatedAt: now,
      version: 2,
    };
    await this.repository.add(collection);
    logger.info(`created collection "${collection.name}"`);
    return collection;
  }

  async rename(id: string, name: string, description?: string): Promise<Collection> {
    const collection = await this.require(id);
    const trimmed = sanitizeText(name, { maxLength: 200, trim: true });
    if (trimmed) collection.name = trimmed;
    if (description !== undefined) {
      const value = sanitizeText(description, { maxLength: 2000, trim: true });
      if (value) collection.description = value;
      else delete collection.description;
    }
    collection.updatedAt = nowIso();
    await this.repository.replace(collection);
    return collection;
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.remove(id);
  }

  async duplicate(id: string): Promise<Collection> {
    const source = await this.require(id);
    const now = nowIso();
    const clone = structuredClone(source);
    clone.id = generateCollectionId();
    clone.name = `${source.name} (copy)`;
    clone.createdAt = now;
    clone.updatedAt = now;
    // Re-key all item ids so they are unique across collections.
    rekeyItems(clone.items);
    await this.repository.add(clone);
    return clone;
  }

  // --- folders ---------------------------------------------------------

  async createFolder(collectionId: string, parentFolderId: string, name: string): Promise<Collection> {
    const collection = await this.require(collectionId);
    this.folders.createFolder(collection, parentFolderId, name);
    await this.repository.replace(collection);
    return collection;
  }

  async renameFolder(collectionId: string, folderId: string, name: string): Promise<Collection> {
    const collection = await this.require(collectionId);
    if (!this.folders.renameFolder(collection, folderId, name)) {
      throw new Error('Folder not found.');
    }
    await this.repository.replace(collection);
    return collection;
  }

  async deleteFolder(collectionId: string, folderId: string): Promise<Collection> {
    const collection = await this.require(collectionId);
    const result = this.folders.deleteFolder(collection, folderId);
    if (!result) throw new Error('Folder not found.');
    await this.repository.replace(collection);
    return collection;
  }

  // --- requests --------------------------------------------------------

  async saveRequest(
    collectionId: string,
    folderId: string,
    request: HttpRequestModel,
    itemId?: string,
  ): Promise<{ collection: Collection; itemId: string }> {
    const collection = await this.require(collectionId);
    const sanitized: HttpRequestModel = {
      ...request,
      name: sanitizeText(request.name, { maxLength: 200, trim: true }) || 'Untitled Request',
      url: sanitizeText(request.url, { maxLength: 8192 }),
      updatedAt: nowIso(),
    };
    const item = this.requests.saveRequest(collection, folderId, sanitized, itemId);
    await this.repository.replace(collection);
    return { collection, itemId: item.id };
  }

  async deleteItem(collectionId: string, itemId: string): Promise<Collection> {
    const collection = await this.require(collectionId);
    const located = this.folders.findItem(collection, itemId);
    if (!located) throw new Error('Item not found.');
    if (located.item.type === 'folder') {
      this.folders.deleteFolder(collection, itemId);
    } else {
      this.requests.deleteRequest(collection, itemId);
    }
    await this.repository.replace(collection);
    return collection;
  }

  async renameItem(collectionId: string, itemId: string, name: string): Promise<Collection> {
    const collection = await this.require(collectionId);
    const located = this.folders.findItem(collection, itemId);
    if (!located) throw new Error('Item not found.');
    const trimmed = sanitizeText(name, { maxLength: 200, trim: true });
    if (!trimmed) throw new Error('Name cannot be empty.');
    if (located.item.type === 'folder') {
      this.folders.renameFolder(collection, itemId, trimmed);
    } else {
      this.requests.renameRequest(collection, itemId, trimmed);
    }
    await this.repository.replace(collection);
    return collection;
  }

  async duplicateItem(collectionId: string, itemId: string): Promise<Collection> {
    const collection = await this.require(collectionId);
    const located = this.folders.findItem(collection, itemId);
    if (!located) throw new Error('Item not found.');
    if (located.item.type === 'folder') {
      const clone = structuredClone(located.item);
      clone.id = `fld_${Math.random().toString(36).slice(2, 12)}`;
      clone.name = `${clone.name} (copy)`;
      clone.updatedAt = nowIso();
      rekeyItems(clone.items);
      const siblings = located.parent ? located.parent.items : collection.items;
      siblings.splice(located.index + 1, 0, clone);
      collection.updatedAt = nowIso();
    } else {
      const duplicated = this.requests.duplicateRequest(collection, itemId);
      if (!duplicated) throw new Error('Request not found.');
    }
    await this.repository.replace(collection);
    return collection;
  }

  async moveItem(
    collectionId: string,
    itemId: string,
    targetFolderId: string,
    index?: number,
  ): Promise<Collection> {
    const collection = await this.require(collectionId);
    if (!this.folders.moveItem(collection, itemId, targetFolderId, index)) {
      throw new Error('Could not move item (target may be inside the item itself).');
    }
    await this.repository.replace(collection);
    return collection;
  }

  // --- search ----------------------------------------------------------

  async search(query: string): Promise<Array<{ collection: Collection; items: ReturnType<RequestRepository['search']> }>> {
    const collections = await this.repository.list();
    const results: Array<{ collection: Collection; items: ReturnType<RequestRepository['search']> }> = [];
    for (const collection of collections) {
      const items = this.requests.search(collection, query);
      if (items.length > 0 || collection.name.toLowerCase().includes(query.trim().toLowerCase())) {
        results.push({ collection, items });
      }
    }
    return results;
  }

  // --- import / export -------------------------------------------------

  importRaw(content: string, formatId?: string): ImportResult {
    return this.importer.import(content, formatId ? { formatId } : {});
  }

  async importCollection(content: string, formatId?: string): Promise<ImportResult> {
    const result = this.importRaw(content, formatId);
    // Guarantee a unique id against existing collections.
    const existing = await this.repository.list();
    while (existing.some((c) => c.id === result.collection.id)) {
      result.collection.id = generateCollectionId();
    }
    await this.repository.add(result.collection);
    logger.info(`imported collection "${result.collection.name}" via ${result.format}`);
    return result;
  }

  async exportCollection(collectionId: string, format?: string): Promise<{ fileName: string; content: string; format: string }> {
    const collection = await this.require(collectionId);
    return this.exporter.export(collection, format);
  }

  // --- helpers ---------------------------------------------------------

  private async require(id: string): Promise<Collection> {
    const collection = await this.repository.get(id);
    if (!collection) throw new Error('Collection not found.');
    return collection;
  }
}

function rekeyItems(items: CollectionItem[]): void {
  for (const item of items) {
    item.id = item.type === 'folder'
      ? `fld_${Math.random().toString(36).slice(2, 12)}`
      : `itm_${Math.random().toString(36).slice(2, 12)}`;
    if (item.type === 'request') {
      item.request = { ...item.request, id: `req_${Math.random().toString(36).slice(2, 12)}` };
    } else {
      rekeyItems(item.items);
    }
  }
}

export { countFolders, countRequests };
