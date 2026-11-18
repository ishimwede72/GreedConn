/**
 * RequestRepository — operations specific to saved request items inside a
 * collection tree (save, update, duplicate, delete).
 */
import type { Collection, RequestItem } from '../types/Collection';
import { isFolderItem, isRequestItem } from '../types/Collection';
import type { HttpRequestModel } from '../types/Request';
import { generateItemId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';
import { FolderManager } from './FolderManager';

export class RequestRepository {
  constructor(private readonly folders: FolderManager = new FolderManager()) {}

  getRequest(collection: Collection, itemId: string): RequestItem | null {
    const located = this.folders.findItem(collection, itemId);
    if (located && isRequestItem(located.item)) return located.item;
    return null;
  }

  /** Insert a new request (or update an existing one when itemId is given). */
  saveRequest(
    collection: Collection,
    folderId: string,
    request: HttpRequestModel,
    itemId?: string,
  ): RequestItem {
    const now = nowIso();

    if (itemId) {
      const existing = this.getRequest(collection, itemId);
      if (existing) {
        existing.name = request.name || existing.name;
        existing.request = { ...request, id: existing.request.id, updatedAt: now };
        existing.updatedAt = now;
        collection.updatedAt = now;
        return existing;
      }
    }

    const item: RequestItem = {
      type: 'request',
      id: generateItemId(),
      name: request.name || 'Untitled Request',
      request: { ...request, updatedAt: now },
      createdAt: now,
      updatedAt: now,
    };

    if (!folderId) {
      collection.items.push(item);
    } else {
      const folder = this.folders.findFolder(collection, folderId);
      if (!folder) throw new Error('Target folder not found.');
      folder.items.push(item);
      folder.updatedAt = now;
    }
    collection.updatedAt = now;
    return item;
  }

  deleteRequest(collection: Collection, itemId: string): boolean {
    const located = this.folders.findItem(collection, itemId);
    if (!located || !isRequestItem(located.item)) return false;
    if (located.parent) {
      located.parent.items.splice(located.index, 1);
      located.parent.updatedAt = nowIso();
    } else {
      collection.items.splice(located.index, 1);
    }
    collection.updatedAt = nowIso();
    return true;
  }

  renameRequest(collection: Collection, itemId: string, name: string): boolean {
    const item = this.getRequest(collection, itemId);
    if (!item) return false;
    item.name = name.trim() || item.name;
    item.updatedAt = nowIso();
    collection.updatedAt = nowIso();
    return true;
  }

  duplicateRequest(collection: Collection, itemId: string): RequestItem | null {
    const located = this.folders.findItem(collection, itemId);
    if (!located || !isRequestItem(located.item)) return null;
    const source = located.item;
    const now = nowIso();
    const clone: RequestItem = {
      type: 'request',
      id: generateItemId(),
      name: `${source.name} (copy)`,
      request: {
        ...source.request,
        id: generateItemId(),
        name: `${source.request.name} (copy)`,
        createdAt: now,
        updatedAt: now,
      },
      ...(source.description ? { description: source.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const siblings = located.parent ? located.parent.items : collection.items;
    siblings.splice(located.index + 1, 0, clone);
    collection.updatedAt = now;
    return clone;
  }

  moveRequest(
    collection: Collection,
    itemId: string,
    targetFolderId: string,
    index?: number,
  ): boolean {
    return this.folders.moveItem(collection, itemId, targetFolderId, index);
  }

  /** Search request items by name/url/method. */
  search(collection: Collection, query: string): RequestItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: RequestItem[] = [];
    const walk = (items: Collection['items']): void => {
      for (const item of items) {
        if (isRequestItem(item)) {
          const haystack =
            `${item.name} ${item.request.name} ${item.request.url} ${item.request.method}`.toLowerCase();
          if (haystack.includes(q)) results.push(item);
        } else if (isFolderItem(item)) {
          walk(item.items);
        }
      }
    };
    walk(collection.items);
    return results;
  }

  /** Find a request item by its underlying request id (draft -> saved). */
  findByRequestId(collection: Collection, requestId: string): RequestItem | null {
    const walk = (items: Collection['items']): RequestItem | null => {
      for (const item of items) {
        if (isRequestItem(item)) {
          if (item.request.id === requestId || item.id === requestId) return item;
        } else if (isFolderItem(item)) {
          const found = walk(item.items);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(collection.items);
  }
}
