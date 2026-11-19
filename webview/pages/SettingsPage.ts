/**
 * SettingsPage — UI preferences, data maintenance, security overview and
 * links to VS Code settings.
 */
import { h, icon, clear } from '../components/dom';
import { button, pageHeader, field, notice, formatTime } from '../components/ui';
import { confirmDialog, promptDialog } from '../components/Modal';
import type { Page } from './types';
import { state } from '../state/AppState';
import { navigate } from '../state/NavigationState';
import { defaultSettings } from '../../src/types/Storage';
import { bridge } from '../services/VsCodeBridge';
import { HistoryService } from '../services/HistoryService';
import { CollectionService } from '../services/CollectionService';
import { EnvironmentService } from '../services/EnvironmentService';
import { TestService } from '../services/TestService';

class SettingsPage implements Page {
  readonly id = 'settings' as const;

  private container: HTMLElement | null = null;
  private readonly unsub: Array<() => void> = [];

  render(container: HTMLElement): void {
    if (this.container !== container) {
      this.container = container;
      this.unsub.push(
        state.on('settings', () => this.build(container)),
        state.on('init', () => this.build(container)),
      );
    }
    this.build(container);
    void this.loadTestHistory(container);
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;
    this.container = null;
  }

  private build(container: HTMLElement): void {
    container.className = 'gc-page';
    clear(container);

    const settings = state.settings;

    container.append(
      pageHeader('Settings', 'Preferences are stored locally alongside your collections.'),
      this.renderAppearance(settings?.ui.responseViewMode ?? 'pretty'),
      this.renderDataSection(),
      this.renderSecuritySection(),
      this.renderAboutSection(),
    );
  }

  // --- appearance -------------------------------------------------------

  private renderAppearance(mode: 'pretty' | 'raw' | 'preview'): HTMLElement {
    const select = h(
      'select',
      {
        className: 'gc-select',
        attrs: { 'aria-label': 'Default response view', style: 'max-width: 220px' },
        on: {
          change: async (event) => {
            const value = (event.currentTarget as HTMLSelectElement).value as
              | 'pretty'
              | 'raw'
              | 'preview';
            try {
              await this.patch({ ui: { responseViewMode: value } });
              state.pushToast('success', 'Preference saved.');
            } catch (error) {
              state.pushToast('error', error instanceof Error ? error.message : String(error));
            }
          },
        },
      },
      h('option', { value: 'pretty', text: 'Pretty (formatted JSON)' }),
      h('option', { value: 'raw', text: 'Raw' }),
      h('option', { value: 'preview', text: 'Preview' }),
    ) as HTMLSelectElement;
    select.value = mode;

    return h(
      'div',
      { className: 'gc-card' },
      h('div', { className: 'gc-card-title', text: 'Appearance & behavior' }),
      field('Default response view', select),
      h('p', { className: 'gc-muted gc-small', style: { marginTop: '8px' } },
        'Greedcon follows your VS Code theme for fonts and adapts its sidebar colors.'),
    );
  }

  // --- data -------------------------------------------------------------

  private renderDataSection(): HTMLElement {
    const historyCount = state.historyTotal;
    const collectionCount = state.collectionSummaries.length;
    const environmentCount = state.environments.length;

    return h(
      'div',
      { className: 'gc-card' },
      h('div', { className: 'gc-card-title', text: 'Data' }),
      h(
        'div',
        { className: 'gc-stats', style: { marginBottom: '12px' } },
        statBox('Collections', String(collectionCount)),
        statBox('Environments', String(environmentCount)),
        statBox('History entries', String(historyCount)),
        statBox('Test runs', String(state.testHistory.length)),
      ),
      h(
        'div',
        { className: 'gc-row', style: { flexWrap: 'wrap', gap: '8px' } },
        button('New request', { size: 'sm', iconName: 'plus', onClick: () => navigate('requests') }),
        button('Open collections', { size: 'sm', iconName: 'folder', onClick: () => navigate('collections') }),
        button('Import collection', { size: 'sm', iconName: 'upload', onClick: () => void this.importCollection() }),
        button('Reset history', {
          size: 'sm',
          variant: 'danger',
          iconName: 'trash',
          onClick: () => void this.clearHistory(),
        }),
        button('Erase everything', {
          size: 'sm',
          variant: 'danger',
          iconName: 'warn',
          onClick: () => void this.eraseAll(),
        }),
      ),
      h('p', { className: 'gc-dim gc-small', style: { marginTop: '10px' },
        text: `Last update: ${settingsTimestamp(state.settings?.updatedAt)}` }),
    );
  }

  // --- security ---------------------------------------------------------

  private renderSecuritySection(): HTMLElement {
    return h(
      'div',
      { className: 'gc-card' },
      h('div', { className: 'gc-card-title', text: 'Security' }),
      notice('Secrets (tokens, passwords, client secrets) are stored in VS Code SecretStorage — never in collections, history or logs.'),
      h(
        'ul',
        { className: 'gc-muted gc-small', style: { margin: '0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('li', { text: 'Webview runs behind a strict CSP: no remote scripts, nonce-only execution.' }),
        h('li', { text: 'Tests are declarative assertions — no arbitrary JavaScript executes on responses.' }),
        h('li', { text: 'URLs and headers are sanitized; private-network access can be disabled in VS Code settings.' }),
        h('li', { text: 'History stores redacted headers and capped bodies only.' }),
      ),
      h('div', { className: 'gc-row', style: { marginTop: '12px' } },
        button('Open VS Code settings', { size: 'sm', iconName: 'gear', onClick: () => void this.openVscodeSettings() })),
    );
  }

  // --- about ------------------------------------------------------------

  private renderAboutSection(): HTMLElement {
    return h(
      'div',
      { className: 'gc-card' },
      h('div', { className: 'gc-card-title', text: 'About' }),
      h(
        'div',
        { className: 'gc-row', style: { gap: '12px', alignItems: 'center' } },
        h('div', { className: 'gc-brand-mark', style: { width: '40px', height: '40px' } }, icon('bolt')),
        h(
          'div',
          null,
          h('strong', { text: 'Greedcon' }),
          h('div', { className: 'gc-muted gc-small', text: `Version ${state.version} · local-first API testing` }),
          h('div', { className: 'gc-dim gc-small', text: 'Test. Build. Scale.' }),
        ),
      ),
      h(
        'div',
        { className: 'gc-row', style: { marginTop: '12px', gap: '8px', flexWrap: 'wrap' } },
        button('Reload webview', {
          size: 'sm',
          iconName: 'refresh',
          onClick: () => window.location.reload(),
        }),
        button('Re-run setup demo', {
          size: 'sm',
          iconName: 'bolt',
          onClick: () => void this.seedDemo(),
        }),
      ),
    );
  }

  // --- actions ----------------------------------------------------------

  private async loadTestHistory(container: HTMLElement): Promise<void> {
    try {
      const result = await TestService.history(100);
      state.testHistory = result.runs;
      state.emit('tests');
      if (this.container === container && state.page === this.id) this.build(container);
    } catch {
      // Keep the page usable in preview mode; the Test runs stat remains at
      // its last known value until the host becomes available.
    }
  }

  private async patch(patch: Record<string, unknown>): Promise<void> {
    await bridge.request('settings.update', { patch });
    const result = await bridge.request<{ settings: typeof state.settings }>('settings.get');
    state.settings = result.settings;
    state.emit('settings');
  }

  private async openVscodeSettings(): Promise<void> {
    try {
      await bridge.request('app.openSettings', {}, 10000);
      state.pushToast('success', 'Opened Greedcon settings in VS Code.');
    } catch {
      state.pushToast('info', 'Open Preferences → Settings and search for "Greedcon".');
    }
  }

  private async importCollection(): Promise<void> {
    try {
      const picked = await CollectionService.pickFile();
      if (!picked) return;
      const result = await CollectionService.import(picked.content, picked.fileName, picked.format);
      state.pushToast('success', `Imported "${result.collection.name}".`);
      const list = await CollectionService.list();
      state.setCollections(list.collections);
      navigate('collections');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async clearHistory(): Promise<void> {
    const confirmed = await confirmDialog(
      'Reset history',
      'Delete all recorded requests? Collections and environments stay untouched.',
      'Reset',
      true,
    );
    if (!confirmed) return;
    try {
      const result = await HistoryService.clear();
      state.history = [];
      state.historyTotal = 0;
      state.emit('history');
      state.pushToast('success', `Removed ${result.removed} entries.`);
      this.build(this.container!);
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async eraseAll(): Promise<void> {
    const typed = await promptDialog(
      'Erase everything',
      'Type ERASE to permanently remove collections, environments, request history, test runs, saved settings and stored credentials.',
      '',
    );
    if (typed !== 'ERASE') {
      if (typed !== null) state.pushToast('warning', 'Confirmation text did not match.');
      return;
    }
    try {
      const result = await bridge.request<{
        collections: number;
        environments: number;
        history: number;
        testRuns: number;
        secrets: number;
      }>('app.eraseData', { confirmation: 'ERASE' }, 60000);
      state.setCollections([]);
      state.setEnvironments([], '');
      state.globals = [];
      state.globalVariables = { variables: [], updatedAt: new Date().toISOString() };
      state.history = [];
      state.historyTotal = 0;
      state.testHistory = [];
      state.draft = null;
      state.activeTests = [];
      state.testRun = null;
      state.settings = defaultSettings();
      state.emit('history');
      state.emit('tests');
      state.emit('settings');
      const total =
        result.collections +
        result.environments +
        result.history +
        result.testRuns +
        result.secrets;
      state.pushToast('success', `All Greedcon data erased (${total} stored items removed).`);
      this.build(this.container!);
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async seedDemo(): Promise<void> {
    try {
      const result = await bridge.request<{ seeded: boolean }>('demo.seed', {}, 30000);
      state.pushToast(
        result.seeded ? 'success' : 'info',
        result.seeded ? 'Demo data created.' : 'Demo data already exists.',
      );
      const [collections, environments] = await Promise.all([
        CollectionService.list(),
        EnvironmentService.list(),
      ]);
      state.setCollections(collections.collections);
      state.setEnvironments(environments.environments, environments.activeEnvironmentId);
      state.globals = environments.globals.variables;
      state.emit('collections');
      state.emit('environments');
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }
}

function statBox(label: string, value: string): HTMLElement {
  return h(
    'div',
    { className: 'gc-stat' },
    h('div', { className: 'label', text: label }),
    h('div', { className: 'value', text: value }),
  );
}

function settingsTimestamp(updatedAt: string | undefined): string {
  if (!updatedAt) return 'never';
  try {
    return formatTime(updatedAt);
  } catch {
    return updatedAt;
  }
}

export const settingsPage = new SettingsPage();
