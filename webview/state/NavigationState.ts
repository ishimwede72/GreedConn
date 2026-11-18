/**
 * NavigationState — page routing with persistence via the host settings.
 */
import type { PageId } from '../../src/types/Messages';
import { state } from './AppState';
import { bridge } from '../services/VsCodeBridge';

export const PAGE_LABELS: Record<PageId, string> = {
  welcome: 'Welcome',
  requests: 'Requests',
  collections: 'Collections',
  environments: 'Environments',
  history: 'History',
  tests: 'Tests',
  settings: 'Settings',
};

export const PAGE_ICONS: Record<PageId, string> = {
  welcome: 'home',
  requests: 'send',
  collections: 'folder',
  environments: 'layers',
  history: 'clock',
  tests: 'flask',
  settings: 'gear',
};

let current: PageId = 'welcome';

export function currentPage(): PageId {
  return current;
}

export function navigate(page: PageId, persist = true): void {
  if (current === page) {
    state.emit('page');
    return;
  }
  current = page;
  state.setPage(page);
  if (persist && bridge.isVsCode) {
    void bridge.request('app.navigate', { page }).catch(() => undefined);
  }
  // Update hash so refresh keeps context (works in preview mode too).
  if (typeof location !== 'undefined') {
    history.replaceState(null, '', `#${page}`);
  }
}

export function initNavigation(): void {
  const hash = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  if (hash && PAGE_LABELS[hash as PageId]) {
    current = hash as PageId;
    state.page = current;
  }
}
