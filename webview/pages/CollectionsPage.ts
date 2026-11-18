/**
 * CollectionsPage — two-pane collection browser with tree navigation,
 * item management, search and import/export.
 */
import { h, icon, clear } from '../components/dom';
import { emptyState } from '../components/Loading';
import { button, iconButton, methodBadge, pageHeader, formatTime } from '../components/ui';
import { confirmDialog, promptDialog } from '../components/Modal';
import type { Page } from './types';
import { state } from '../state/AppState';
import { navigate } from '../state/NavigationState';
import { CollectionService } from '../services/CollectionService';
import { TestService } from '../services/TestService';
import { setRequest } from '../state/RequestState';
import type { Collection, CollectionItem } from '../../src/types/Collection';
import type { HttpRequestModel } from '../../src/types/Request';

class CollectionsPage implements Page {
  readonly id = 'collections' as const;

  private container: HTMLElement | null = null;
  private treeRoot: HTMLElement | null = null;
  private detailRoot: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private query = '';
  private readonly expanded = new Set<string>();
  private selectedCollectionId: string | null = null;
  private readonly unsub: Array<() => void> = [];

  render(container: HTMLElement): void {
    if (this.container !== container) {
      this.container = container;
      this.build(container);
      this.unsub.push(
        state.on('collections', () => {
          this.refreshTree();
          this.refreshDetail();
        }),
      );
    }
    void this.ensureData().finally(() => {
      this.refreshTree();
      this.refreshDetail();
    });
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;
    this.container = null;
  }

  private async ensureData(): Promise<void> {
    if (state.collections.length > 0) return;
    try {
      const result = await CollectionService.list();
      state.setCollections(result.collections);
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  // --- layout -----------------------------------------------------------

  private build(container: HTMLElement): void {
    container.className = 'gc-page tight';

    this.searchInput = h('input', {
      className: 'gc-input',
      attrs: { type: 'search', placeholder: 'Search collections…', 'aria-label': 'Search collections' },
      on: {
        input: (event) => {
          this.query = (event.currentTarget as HTMLInputElement).value;
          void this.refreshTree();
        },
      },
    }) as HTMLInputElement;

    this.treeRoot = h('div', { className: 'gc-tree' });
    this.detailRoot = h('div', { className: 'gc-collection-detail' });

    const left = h(
      'div',
      { className: 'gc-split-left' },
      h('div', { className: 'gc-pane-head' }, h('h3', { text: 'Collections' }),
        iconButton('plus', 'New collection', () => void this.createCollection())),
      h('div', { style: { padding: '8px 10px' } },
        h('div', { className: 'gc-search' }, icon('search'), this.searchInput)),
      this.treeRoot,
    );

    const right = h(
      'div',
      { className: 'gc-split-right' },
      h(
        'div',
        { className: 'gc-pane-head' },
        h('h3', { text: 'Details' }),
        button('Import', { size: 'sm', iconName: 'upload', onClick: () => void this.importCollection() }),
        button('New', { size: 'sm', iconName: 'plus', variant: 'primary', onClick: () => void this.createCollection() }),
      ),
      this.detailRoot,
    );

    clear(container);
    container.append(
      pageHeader('Collections', 'Organize requests into folders, share and run them as suites.'),
      h('div', { className: 'gc-split' }, left, right),
    );
  }

  // --- tree -------------------------------------------------------------

  private async refreshTree(): Promise<void> {
    if (!this.treeRoot) return;
    clear(this.treeRoot);

    let collections = state.collections;
    if (this.query.trim()) {
      try {
        const result = await CollectionService.search(this.query.trim());
        const ids = new Set(result.results.map((r) => r.collection.id));
        collections = collections.filter((c) => ids.has(c.id));
      } catch {
        // Fall back to local filtering when search is unavailable.
        const q = this.query.trim().toLowerCase();
        collections = collections.filter(
          (c) => c.name.toLowerCase().includes(q) || JSON.stringify(c.items).toLowerCase().includes(q),
        );
      }
    }

    if (collections.length === 0) {
      this.treeRoot.appendChild(
        emptyState(
          'folder',
          this.query ? 'No matches' : 'No collections yet',
          this.query
            ? 'Try a different search term.'
            : 'Create a collection to organize your requests, or import an existing one.',
          this.query
            ? undefined
            : button('Create collection', { variant: 'primary', iconName: 'plus', onClick: () => void this.createCollection() }),
        ),
      );
      return;
    }

    for (const collection of collections) {
      this.treeRoot.appendChild(this.renderCollectionNode(collection));
    }
  }

  private renderCollectionNode(collection: Collection): HTMLElement {
    const isExpanded = this.expanded.has(collection.id);
    const node = h(
      'div',
      {
        className: `gc-tree-item${this.selectedCollectionId === collection.id ? ' selected' : ''}${isExpanded ? ' expanded' : ''}`,
        on: {
          click: () => {
            this.selectedCollectionId = collection.id;
            this.expanded.add(collection.id);
            void this.refreshTree();
            this.refreshDetail();
          },
        },
      },
      icon('chevron', 'icon caret'),
      icon('folder'),
      h('span', { className: 'label', text: collection.name }),
      h('span', { className: 'gc-nav-badge', text: String(countRequests(collection.items)) }),
    );

    if (isExpanded) {
      const children = h('div', { className: 'gc-tree-children' });
      for (const item of collection.items) {
        children.appendChild(this.renderItemNode(collection, item));
      }
      if (collection.items.length === 0) {
        children.appendChild(h('div', { className: 'gc-dim gc-small', style: { padding: '4px 8px' }, text: 'Empty' }));
      }
      return h('div', null, node, children);
    }
    return node;
  }

  private renderItemNode(collection: Collection, item: CollectionItem): HTMLElement {
    if (item.type === 'folder') {
      const isExpanded = this.expanded.has(item.id);
      const node = h(
        'div',
        { className: `gc-tree-item${isExpanded ? ' expanded' : ''}` },
        icon('chevron', 'icon caret'),
        icon('folder'),
        h('span', { className: 'label', text: item.name }),
      );
      node.addEventListener('click', () => {
        if (this.expanded.has(item.id)) this.expanded.delete(item.id);
        else this.expanded.add(item.id);
        void this.refreshTree();
      });
      if (isExpanded) {
        const children = h('div', { className: 'gc-tree-children' });
        for (const child of item.items) {
          children.appendChild(this.renderItemNode(collection, child));
        }
        return h('div', null, node, children);
      }
      return node;
    }

    const node = h(
      'div',
      {
        className: 'gc-tree-item',
        on: {
          click: (event) => {
            event.stopPropagation();
            this.openRequest(item.request);
          },
        },
        title: `${item.request.method} ${item.request.url}`,
      },
      h('span', { style: { width: '14px' } }),
      h('span', { className: `gc-tree-badge gc-method ${item.request.method}`, style: { minWidth: '44px', padding: '1px 4px' }, text: item.request.method }),
      h('span', { className: 'label', text: item.name }),
    );
    return node;
  }

  // --- detail -----------------------------------------------------------

  private refreshDetail(): void {
    if (!this.detailRoot) return;
    clear(this.detailRoot);

    const collection = state.collections.find((c) => c.id === this.selectedCollectionId) ?? state.collections[0];
    if (!collection) {
      this.detailRoot.appendChild(
        emptyState('folder', 'No collection selected', 'Select a collection on the left, or create a new one.'),
      );
      return;
    }
    this.selectedCollectionId = collection.id;

    const actions = h(
      'div',
      { className: 'gc-row', style: { marginBottom: '14px', flexWrap: 'wrap' } },
      button('New folder', { size: 'sm', iconName: 'folder', onClick: () => void this.addFolder(collection) }),
      button('New request', { size: 'sm', iconName: 'send', onClick: () => void this.addRequest(collection) }),
      button('Rename', { size: 'sm', iconName: 'code', onClick: () => void this.renameCollection(collection) }),
      button('Duplicate', { size: 'sm', iconName: 'copy', onClick: () => void this.duplicateCollection(collection) }),
      button('Export', { size: 'sm', iconName: 'download', onClick: () => void this.exportCollection(collection) }),
      button('Run tests', { size: 'sm', iconName: 'play', onClick: () => void this.runTests(collection) }),
      button('Delete', { size: 'sm', variant: 'danger', iconName: 'trash', onClick: () => void this.deleteCollection(collection) }),
    );

    this.detailRoot.append(
      h(
        'div',
        { className: 'gc-card', style: { marginBottom: '14px' } },
        h('div', { className: 'gc-card-title' },
          h('span', { text: collection.name }),
          h('span', { className: 'gc-chip', text: `${countRequests(collection.items)} requests` })),
        collection.description
          ? h('p', { className: 'gc-muted gc-small', text: collection.description })
          : h('span'),
        h('div', { className: 'gc-dim gc-small', style: { marginTop: '6px' }, text: `Updated ${formatTime(collection.updatedAt)}` }),
      ),
      actions,
      this.renderItems(collection.items, collection),
    );
  }

  private renderItems(items: CollectionItem[], collection: Collection): HTMLElement {
    const wrap = h('div');
    if (items.length === 0) {
      wrap.appendChild(
        emptyState('plus', 'Empty collection', 'Add a folder or a request to get started.',
          button('Add request', { variant: 'primary', iconName: 'plus', onClick: () => void this.addRequest(collection) })),
      );
      return wrap;
    }

    for (const item of items) {
      if (item.type === 'folder') {
        wrap.appendChild(
          h('div', { className: 'gc-folder-head' },
            icon('folder'),
            h('span', { text: item.name }),
            h('span', { className: 'gc-spacer' }),
            h('span', { className: 'gc-dim gc-small', text: `${countRequests(item.items)} requests` }),
            iconButton('trash', 'Delete folder', () => void this.deleteItem(collection, item.id), 'danger')),
        );
        wrap.appendChild(h('div', { style: { paddingLeft: '14px' } }, this.renderItems(item.items, collection)));
      } else {
        wrap.appendChild(
          h('div', {
            className: 'gc-item-card',
            on: {
              click: () => this.openRequest(item.request),
            },
          },
            methodBadge(item.request.method),
            h('span', { className: 'name', text: item.name }),
            h('span', { className: 'url', text: item.request.url || '(no url)' }),
            iconButton('copy', 'Duplicate', () => void this.duplicateItem(collection, item.id)),
            iconButton('trash', 'Delete', () => void this.deleteItem(collection, item.id), 'danger')),
        );
      }
    }
    return wrap;
  }

  // --- actions ----------------------------------------------------------

  private openRequest(request: HttpRequestModel): void {
    setRequest(structuredClone(request));
    navigate('requests');
  }

  private async createCollection(): Promise<void> {
    const name = await promptDialog('New collection', 'Collection name', '', 'My API');
    if (!name) return;
    try {
      const result = await CollectionService.create(name);
      this.selectedCollectionId = result.collection.id;
      this.expanded.add(result.collection.id);
      state.pushToast('success', `Collection "${name}" created.`);
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async renameCollection(collection: Collection): Promise<void> {
    const name = await promptDialog('Rename collection', 'Collection name', collection.name);
    if (!name || name === collection.name) return;
    try {
      await CollectionService.rename(collection.id, name);
      state.pushToast('success', 'Collection renamed.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async duplicateCollection(collection: Collection): Promise<void> {
    try {
      await CollectionService.duplicate(collection.id);
      state.pushToast('success', 'Collection duplicated.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async deleteCollection(collection: Collection): Promise<void> {
    const confirmed = await confirmDialog(
      'Delete collection',
      `Delete "${collection.name}" and all of its requests? This cannot be undone.`,
      'Delete',
      true,
    );
    if (!confirmed) return;
    try {
      await CollectionService.delete(collection.id);
      if (this.selectedCollectionId === collection.id) this.selectedCollectionId = null;
      state.pushToast('success', 'Collection deleted.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async addFolder(collection: Collection): Promise<void> {
    const name = await promptDialog('New folder', 'Folder name', '', 'Users');
    if (!name) return;
    try {
      await CollectionService.createFolder(collection.id, '', name);
      this.expanded.add(collection.id);
      state.pushToast('success', 'Folder created.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async addRequest(collection: Collection): Promise<void> {
    try {
      const draft = state.draft ?? null;
      if (!draft) {
        navigate('requests');
        state.pushToast('info', 'Create a request first, then save it here.');
        return;
      }
      await CollectionService.saveRequest(collection.id, '', structuredClone(draft));
      state.pushToast('success', `Saved "${draft.name}" into "${collection.name}".`);
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async deleteItem(collection: Collection, itemId: string): Promise<void> {
    const confirmed = await confirmDialog('Delete item', 'Delete this item?', 'Delete', true);
    if (!confirmed) return;
    try {
      await CollectionService.deleteItem(collection.id, itemId);
      state.pushToast('success', 'Item deleted.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async duplicateItem(collection: Collection, itemId: string): Promise<void> {
    try {
      await CollectionService.duplicateItem(collection.id, itemId);
      state.pushToast('success', 'Item duplicated.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async importCollection(): Promise<void> {
    try {
      const picked = await CollectionService.pickFile();
      if (!picked) return;
      const result = await CollectionService.import(picked.content, picked.fileName, picked.format);
      state.pushToast(
        'success',
        `Imported "${result.collection.name}" via ${result.format}${result.warnings.length ? ` (${result.warnings.length} warning(s))` : ''}.`,
      );
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async exportCollection(collection: Collection): Promise<void> {
    try {
      const exported = await CollectionService.export(collection.id);
      const saved = await CollectionService.saveFile(collection.id, exported.fileName, exported.content);
      state.pushToast(saved.saved ? 'success' : 'info', saved.saved ? `Exported to ${saved.uri}` : 'Export cancelled.');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async runTests(collection: Collection): Promise<void> {
    try {
      const result = await TestService.runCollection(collection.id);
      state.pushToast(
        result.summary.failed > 0 ? 'warning' : 'success',
        `Collection run finished: ${result.summary.passed}/${result.summary.total} assertions passed.`,
      );
      navigate('tests');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async reload(): Promise<void> {
    try {
      const result = await CollectionService.list();
      state.setCollections(result.collections);
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }
}

function countRequests(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === 'request') count += 1;
    else count += countRequests(item.items);
  }
  return count;
}

export const collectionsPage = new CollectionsPage();
