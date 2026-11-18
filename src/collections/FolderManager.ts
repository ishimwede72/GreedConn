/**
 * FolderManager — pure tree operations on collection items.
 */
import type { Collection, CollectionItem, FolderItem, RequestItem } from '../types/Collection';
import { isFolderItem, isRequestItem } from '../types/Collection';
import { generateFolderId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';

export interface LocatedItem {
  item: CollectionItem;
  parent: FolderItem | null;
  index: number;
}

export class FolderManager {
  /** Depth-first search for an item id anywhere in the tree. */
  findItem(collection: Collection, itemId: string): LocatedItem | null {
    return findInItems(collection.items, itemId, null);
  }

  findFolder(collection: Collection, folderId: string): FolderItem | null {
    if (folderId === '') return null;
    const located = this.findItem(collection, folderId);
    return located && isFolderItem(located.item) ? located.item : null;
  }

  createFolder(collection: Collection, parentFolderId: string, name: string): FolderItem {
    const folder: FolderItem = {
      type: 'folder',
      id: generateFolderId(),
      name: name.trim() || 'New Folder',
      items: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!parentFolderId) {
      collection.items.push(folder);
    } else {
      const parent = this.findFolder(collection, parentFolderId);
      if (!parent) throw new Error('Target folder not found.');
      parent.items.push(folder);
      parent.updatedAt = nowIso();
    }
    collection.updatedAt = nowIso();
    return folder;
  }

  renameFolder(collection: Collection, folderId: string, name: string): boolean {
    const folder = this.findFolder(collection, folderId);
    if (!folder) return false;
    folder.name = name.trim() || folder.name;
    folder.updatedAt = nowIso();
    collection.updatedAt = nowIso();
    return true;
  }

  /**
   * Delete a folder and everything inside it.
   * Returns the number of removed items (requests) for confirmation dialogs.
   */
  deleteFolder(collection: Collection, folderId: string): { removedRequests: number } | null {
    const located = this.findItem(collection, folderId);
    if (!located || !isFolderItem(located.item)) return null;
    const removedRequests = countRequestsIn([located.item]);
    if (located.parent) {
      located.parent.items.splice(located.index, 1);
      located.parent.updatedAt = nowIso();
    } else {
      collection.items.splice(located.index, 1);
    }
    collection.updatedAt = nowIso();
    return { removedRequests };
  }

  /** Move an item (folder or request) to another folder (or root). */
  moveItem(
    collection: Collection,
    itemId: string,
    targetFolderId: string,
    index?: number,
  ): boolean {
    if (itemId === targetFolderId) return false;
    const located = this.findItem(collection, itemId);
    if (!located) return false;

    // Prevent moving a folder into its own descendant.
    if (isFolderItem(located.item) && targetFolderId) {
      if (findInItems([located.item], targetFolderId, null)) return false;
    }

    // Detach
    const [removed] = located.parent
      ? located.parent.items.splice(located.index, 1)
      : collection.items.splice(located.index, 1);
    if (located.parent) located.parent.updatedAt = nowIso();

    // Attach
    if (!targetFolderId) {
      const targetIndex = index ?? collection.items.length;
      collection.items.splice(
        Math.max(0, Math.min(targetIndex, collection.items.length)),
        0,
        removed,
      );
    } else {
      const target = this.findFolder(collection, targetFolderId);
      if (!target) {
        // Put it back where it came from.
        if (located.parent) located.parent.items.splice(located.index, 0, removed);
        else collection.items.splice(located.index, 0, removed);
        return false;
      }
      const targetIndex = index ?? target.items.length;
      target.items.splice(Math.max(0, Math.min(targetIndex, target.items.length)), 0, removed);
      target.updatedAt = nowIso();
    }
    removed.updatedAt = nowIso();
    collection.updatedAt = nowIso();
    return true;
  }

  /** All folders in the tree (breadth-first), for pickers. */
  listFolders(collection: Collection): Array<{ folder: FolderItem; depth: number }> {
    const out: Array<{ folder: FolderItem; depth: number }> = [];
    const walk = (items: CollectionItem[], depth: number): void => {
      for (const item of items) {
        if (isFolderItem(item)) {
          out.push({ folder: item, depth });
          walk(item.items, depth + 1);
        }
      }
    };
    walk(collection.items, 0);
    return out;
  }
}

export function findInItems(
  items: CollectionItem[],
  itemId: string,
  parent: FolderItem | null,
): LocatedItem | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.id === itemId) return { item, parent, index };
    if (isFolderItem(item)) {
      const found = findInItems(item.items, itemId, item);
      if (found) return found;
    }
  }
  return null;
}

export function countRequestsIn(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isRequestItem(item)) count += 1;
    else if (isFolderItem(item)) count += countRequestsIn(item.items);
  }
  return count;
}

/** Flatten all request items (used for search and "run collection"). */
export function flattenRequests(
  items: CollectionItem[],
  folderPath: string[] = [],
): Array<{ item: RequestItem; folderPath: string[] }> {
  const out: Array<{ item: RequestItem; folderPath: string[] }> = [];
  for (const item of items) {
    if (isRequestItem(item)) {
      out.push({ item, folderPath });
    } else if (isFolderItem(item)) {
      out.push(...flattenRequests(item.items, [...folderPath, item.name]));
    }
  }
  return out;
}
