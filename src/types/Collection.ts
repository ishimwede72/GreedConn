/**
 * Collection data model.
 *
 * Collections contain a recursive tree of folders and saved requests so
 * moving a request between folders is a pure tree operation.
 */
import type { HttpRequestModel } from './Request';

export interface CollectionMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  /** Format version of the stored document (see Storage.ts). */
  version: number;
}

export interface RequestItem {
  type: 'request';
  id: string;
  name: string;
  request: HttpRequestModel;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItem {
  type: 'folder';
  id: string;
  name: string;
  description?: string;
  items: CollectionItem[];
  createdAt: string;
  updatedAt: string;
}

export type CollectionItem = FolderItem | RequestItem;

export interface Collection extends CollectionMetadata {
  items: CollectionItem[];
}

export interface CollectionSummary {
  id: string;
  name: string;
  description?: string;
  requestCount: number;
  folderCount: number;
  updatedAt: string;
}

/** Result of a successful import operation. */
export interface ImportResult {
  collection: Collection;
  format: string;
  warnings: string[];
  /** Number of nodes that could not be mapped but were preserved as notes. */
  preservedUnknownFields: number;
}

export function isFolderItem(item: CollectionItem): item is FolderItem {
  return item.type === 'folder';
}

export function isRequestItem(item: CollectionItem): item is RequestItem {
  return item.type === 'request';
}

export function countRequests(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isRequestItem(item)) {
      count += 1;
    } else {
      count += countRequests(item.items);
    }
  }
  return count;
}

export function countFolders(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isFolderItem(item)) {
      count += 1 + countFolders(item.items);
    }
  }
  return count;
}
