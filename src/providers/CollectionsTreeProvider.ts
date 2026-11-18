/**
 * CollectionsTreeProvider — sidebar tree of collections / folders / requests.
 * Selecting a request opens it in the Greedcon request builder.
 */
import * as vscode from 'vscode';
import { GreedconTreeProvider, TreeItemDescriptor } from './GreedconTreeProvider';
import { GreedconServices } from '../services/GreedconServices';
import type { Collection, CollectionItem } from '../types/Collection';
import { countRequests } from '../types/Collection';

export class CollectionsTreeProvider extends GreedconTreeProvider {
  constructor(services: GreedconServices) {
    super(services);
    const openRequestCmd = vscode.commands.registerCommand(
      'greedcon.tree.openRequest',
      (element: TreeItemDescriptor) => {
        void this.openRequest(element);
      },
    );
    const openCollectionCmd = vscode.commands.registerCommand(
      'greedcon.tree.openCollection',
      (element: TreeItemDescriptor) => {
        void this.openCollection(element);
      },
    );
    this.disposables.push(openRequestCmd, openCollectionCmd);
    services.context.subscriptions.push(openRequestCmd, openCollectionCmd);
    this.disposables.push(this.watchCollections());
  }

  treeId(): string {
    return 'collections';
  }

  private watchCollections(): vscode.Disposable {
    const interval = setInterval(() => this.refresh(), 5000);
    return { dispose: () => clearInterval(interval) };
  }

  async getChildren(element?: TreeItemDescriptor): Promise<TreeItemDescriptor[]> {
    if (!element) {
      const collections = await this.services.collections.list();
      if (collections.length === 0) {
        return [
          {
            id: 'empty',
            label: 'No collections yet',
            description: '',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            icon: new vscode.ThemeIcon('info'),
          },
        ];
      }
      return collections.map((collection) => this.toCollectionNode(collection));
    }

    const [collectionId, itemId] = parseNodeId(element.id);
    if (!collectionId) return [];
    const collection = await this.services.collections.get(collectionId);
    if (!collection) return [];

    if (!itemId) return collection.items.map((item) => this.toItemNode(collection, item));

    const located = findItem(collection, itemId);
    if (located && located.type === 'folder' && Array.isArray(located.items)) {
      return located.items.map((item) => this.toItemNode(collection, item));
    }
    return [];
  }

  private toCollectionNode(collection: Collection): TreeItemDescriptor {
    const requests = countRequests(collection.items);
    return {
      id: nodeId(collection.id),
      label: collection.name,
      description: `${requests}`,
      tooltip: collection.description || collection.name,
      collapsibleState:
        collection.items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
      contextValue: 'collection',
      icon: new vscode.ThemeIcon('folder-library'),
      command: {
        command: 'greedcon.tree.openCollection',
        title: 'Open Collection',
        arguments: [{ id: nodeId(collection.id), label: collection.name }],
      },
    };
  }

  private toItemNode(collection: Collection, item: CollectionItem): TreeItemDescriptor {
    if (item.type === 'folder') {
      return {
        id: nodeId(collection.id, item.id),
        label: item.name,
        description: `${countRequests(item.items)}`,
        collapsibleState:
          item.items.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        contextValue: 'folder',
        icon: new vscode.ThemeIcon('folder'),
      };
    }
    return {
      id: nodeId(collection.id, item.id),
      label: item.name,
      description: item.request.method,
      tooltip: `${item.request.method} ${item.request.url}`,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'request',
      icon: new vscode.ThemeIcon('send'),
      command: {
        command: 'greedcon.tree.openRequest',
        title: 'Open Request',
        arguments: [{ id: nodeId(collection.id, item.id), label: item.name }],
      },
    };
  }

  private async openRequest(element: TreeItemDescriptor): Promise<void> {
    const [collectionId, itemId] = parseNodeId(element.id);
    if (!collectionId || !itemId) return;
    const collection = await this.services.collections.get(collectionId);
    if (!collection) return;
    const found = findItem(collection, itemId);
    if (!found || found.type !== 'request' || !found.item || found.item.type !== 'request') return;
    const item = found.item;

    // Persist as draft then open the request page.
    await this.services.storage.settings.update({ draft: item.request });
    await vscode.commands.executeCommand('greedcon.open');
    this.services.broadcast('page.changed', { page: 'requests' });
    this.services.broadcast('toast', { level: 'info', message: `Opened "${item.name}"` });
  }

  private async openCollection(element: TreeItemDescriptor): Promise<void> {
    void element;
    await vscode.commands.executeCommand('greedcon.open');
    this.services.broadcast('page.changed', { page: 'collections' });
  }
}

function nodeId(collectionId: string, itemId?: string): string {
  return itemId ? `${collectionId}::${itemId}` : collectionId;
}

function parseNodeId(id: string): [string, string | null] {
  const index = id.indexOf('::');
  if (index === -1) return [id, null];
  return [id.slice(0, index), id.slice(index + 2)];
}

function findItem(
  collection: Collection,
  itemId: string,
): { type: 'folder'; items: CollectionItem[] } | { type: 'request'; item: CollectionItem } | null {
  const walk = (
    items: CollectionItem[],
  ): { type: 'folder'; items: CollectionItem[] } | { type: 'request'; item: CollectionItem } | null => {
    for (const item of items) {
      if (item.id === itemId) {
        return item.type === 'folder'
          ? { type: 'folder', items: item.items }
          : { type: 'request', item };
      }
      if (item.type === 'folder') {
        const found = walk(item.items);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(collection.items);
}
