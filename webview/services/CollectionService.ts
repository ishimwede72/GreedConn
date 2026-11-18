/**
 * CollectionService — collection/folder/request CRUD + import/export.
 */
import { bridge } from './VsCodeBridge';
import type { Collection, CollectionSummary, ImportResult } from '../../src/types/Collection';
import type { HttpRequestModel } from '../../src/types/Request';

export const CollectionService = {
  list(): Promise<{ collections: Collection[] }> {
    return bridge.request('collections.list');
  },

  get(collectionId: string): Promise<{ collection: Collection | null }> {
    return bridge.request('collections.get', { collectionId });
  },

  create(name: string, description?: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.create', { name, ...(description ? { description } : {}) });
  },

  rename(collectionId: string, name: string, description?: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.rename', { collectionId, name, ...(description !== undefined ? { description } : {}) });
  },

  delete(collectionId: string): Promise<{ deleted: boolean }> {
    return bridge.request('collections.delete', { collectionId });
  },

  duplicate(collectionId: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.duplicate', { collectionId });
  },

  createFolder(collectionId: string, folderId: string, name: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.folder.create', { collectionId, folderId, name });
  },

  renameFolder(collectionId: string, folderId: string, name: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.folder.rename', { collectionId, folderId, name });
  },

  deleteFolder(collectionId: string, folderId: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.folder.delete', { collectionId, folderId });
  },

  saveRequest(
    collectionId: string,
    folderId: string,
    request: HttpRequestModel,
    itemId?: string,
  ): Promise<{ itemId: string; collection: Collection }> {
    return bridge.request('collections.request.save', {
      collectionId,
      folderId,
      request,
      ...(itemId ? { itemId } : {}),
    });
  },

  deleteItem(collectionId: string, itemId: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.item.delete', { collectionId, itemId });
  },

  renameItem(collectionId: string, itemId: string, name: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.item.rename', { collectionId, itemId, name });
  },

  duplicateItem(collectionId: string, itemId: string): Promise<{ collection: Collection }> {
    return bridge.request('collections.item.duplicate', { collectionId, itemId });
  },

  moveItem(
    collectionId: string,
    itemId: string,
    targetFolderId: string,
    index?: number,
  ): Promise<{ collection: Collection }> {
    return bridge.request('collections.item.move', {
      collectionId,
      itemId,
      targetFolderId,
      ...(index !== undefined ? { index } : {}),
    });
  },

  import(
    content: string,
    source: string,
    format?: string,
  ): Promise<ImportResult & { collection: Collection }> {
    return bridge.request('collections.import', { content, source, ...(format ? { format } : {}) }, 30000);
  },

  export(collectionId: string): Promise<{ fileName: string; content: string; format: string }> {
    return bridge.request('collections.export', { collectionId }, 30000);
  },

  search(query: string): Promise<{
    results: Array<{
      collection: { id: string; name: string };
      items: Array<{ id: string; name: string; method: string; url: string }>;
    }>;
  }> {
    return bridge.request('collections.search', { query });
  },

  pickFile(): Promise<{ content: string; fileName: string; format?: string } | null> {
    return bridge.request('collections.pickFile', {}, 60000);
  },

  saveFile(
    collectionId: string,
    defaultName: string,
    content: string,
  ): Promise<{ saved: boolean; uri?: string }> {
    return bridge.request('collections.saveFile', { collectionId, defaultName, content }, 60000);
  },

  summaries(): Promise<{ summaries: CollectionSummary[] }> {
    return bridge.request<{ collections: Collection[] }>('collections.list').then((result) => ({
      summaries: result.collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        requestCount: countRequests(collection.items),
        folderCount: 0,
        updatedAt: collection.updatedAt,
      })),
    }));
  },
};

function countRequests(items: Collection['items']): number {
  let count = 0;
  for (const item of items) {
    if (item.type === 'request') count += 1;
    else count += countRequests(item.items);
  }
  return count;
}
