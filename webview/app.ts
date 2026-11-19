/**
 * GREEDCON webview entry point.
 *
 * Bootstraps the layout (sidebar + page host + toasts), performs the initial
 * `app.init` handshake with the extension host, wires host-pushed events and
 * renders the active page.
 */
import './styles/app.css';
import { h, clear } from './components/dom';
import { Sidebar } from './components/Sidebar';
import { ToastHost } from './components/Toast';
import { state } from './state/AppState';
import { navigate, initNavigation, PAGE_LABELS } from './state/NavigationState';
import { bridge } from './services/VsCodeBridge';
import { welcomePage } from './pages/WelcomePage';
import { requestPage } from './pages/RequestPage';
import { collectionsPage } from './pages/CollectionsPage';
import { environmentsPage } from './pages/EnvironmentsPage';
import { historyPage } from './pages/HistoryPage';
import { testsPage } from './pages/TestsPage';
import { settingsPage } from './pages/SettingsPage';
import type { Page } from './pages/types';
import type {
  AppInitData,
  CollectionSummary,
  PageId,
} from '../src/types/Messages';
import type { Environment } from '../src/types/Environment';
import type { SettingsState } from '../src/types/Storage';
import { defaultSettings } from '../src/types/Storage';

const PAGES: Record<PageId, Page> = {
  welcome: welcomePage,
  requests: requestPage,
  collections: collectionsPage,
  environments: environmentsPage,
  history: historyPage,
  tests: testsPage,
  settings: settingsPage,
};

let activePage: Page | null = null;
let pageHost: HTMLElement | null = null;

/** True when the user is typing — re-rendering then would steal focus. */
function isEditing(): boolean {
  const element = document.activeElement;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function renderPage(force = false): void {
  if (!pageHost) return;
  const next = PAGES[state.page];
  if (!next) return;
  if (next === activePage && isEditing() && !force) return;
  const changingPage = activePage !== next;
  if (activePage && changingPage) activePage.dispose?.();
  if (changingPage) clear(pageHost);
  activePage = next;
  next.render(pageHost);
}

function wireHostEvents(): void {
  bridge.on('toast', (data) => {
    const payload = data as { level: 'info' | 'success' | 'warning' | 'error'; message: string };
    if (payload && typeof payload.message === 'string') {
      state.pushToast(payload.level ?? 'info', payload.message);
    }
  });

  bridge.on('page.changed', (data) => {
    const payload = data as { page: PageId };
    if (payload && PAGE_LABELS[payload.page]) navigate(payload.page, false);
  });

  bridge.on('collections.changed', (data) => {
    const payload = data as { collections: CollectionSummary[] };
    if (Array.isArray(payload?.collections)) {
      state.collectionSummaries = payload.collections;
      renderPage();
    }
  });

  bridge.on('environments.changed', (data) => {
    const payload = data as { environments: Environment[]; activeId: string };
    if (Array.isArray(payload?.environments)) {
      state.setEnvironments(payload.environments, payload.activeId ?? '');
      renderPage();
    }
  });

  bridge.on('history.changed', (data) => {
    const payload = data as { count: number };
    if (typeof payload?.count === 'number') {
      state.historyTotal = payload.count;
      renderPage();
    }
  });

  bridge.on('settings.changed', (data) => {
    const payload = data as { settings: SettingsState };
    if (payload?.settings) {
      state.settings = payload.settings;
      renderPage();
    }
  });

  bridge.on('request.progress', (data) => {
    const payload = data as { phase: string; detail?: string };
    if (state.runState.running) {
      state.runState = {
        running: true,
        phase: payload.detail ? `${payload.phase} — ${payload.detail}` : payload.phase,
      };
      renderPage(true);
    }
  });

  bridge.on('request.completed', () => {
    state.runState = { running: false };
  });

  bridge.on('request.cancelled', () => {
    state.runState = { running: false };
    renderPage(true);
  });

  bridge.on('log', (data) => {
    const payload = data as { level: string; message: string };
    // Surface host logs in the dev console for debugging (never secrets).
    console.log(`[greedcon:${payload?.level ?? 'info'}] ${payload?.message ?? ''}`);
  });
}

function fallbackInit(): AppInitData {
  return {
    page: 'welcome',
    version: '0.0.0',
    collections: [],
    environments: [],
    activeEnvironmentId: '',
    settings: defaultSettings(),
    historyCount: 0,
    draft: null,
    globalVariables: { variables: [], updatedAt: new Date().toISOString() },
    capabilities: { oauth2: true, multipart: true, testRuns: true },
  };
}

async function init(): Promise<void> {
  initNavigation();

  const root = document.getElementById('app');
  if (!root) {
    console.error('[greedcon] #app root element is missing');
    return;
  }

  const sidebar = new Sidebar();
  const toasts = new ToastHost();
  pageHost = h('div', { className: 'gc-page' });
  const main = h('div', { className: 'gc-main' }, pageHost);

  clear(root);
  root.append(sidebar.element(), main, toasts.element());

  // Re-render when the page changes through state.
  state.on('page', () => renderPage());

  wireHostEvents();

  try {
    const data = await bridge.request<AppInitData>('app.init', {}, 20000);
    state.applyInit(data);
    state.historyTotal = data.historyCount;
    state.globals = data.globalVariables.variables;
    if (data.draft) state.activeTests = data.draft.tests ?? [];
    if (PAGE_LABELS[data.page]) navigate(data.page, false);
  } catch (error) {
    console.warn('[greedcon] init failed — running in preview mode', error);
    state.applyInit(fallbackInit());
    state.pushToast(
      'warning',
      bridge.isVsCode
        ? `Initialization failed: ${error instanceof Error ? error.message : String(error)}`
        : 'Preview mode: the extension host is not connected.',
    );
  }

  renderPage(true);
}

void init();

// Hot-reload friendly: expose the state for debugging in the webview console.
declare global {
  interface Window {
    greedconState?: typeof state;
  }
}
window.greedconState = state;
