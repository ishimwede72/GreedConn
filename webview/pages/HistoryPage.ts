/**
 * HistoryPage — searchable request history with filters, detail inspection,
 * re-run and maintenance actions.
 */
import { h, icon, clear } from '../components/dom';
import { emptyState, loadingInline } from '../components/Loading';
import {
  button,
  iconButton,
  methodBadge,
  statusBadge,
  pageHeader,
  formatTime,
  formatDuration,
  formatSize,
} from '../components/ui';
import { Modal, confirmDialog } from '../components/Modal';
import type { Page } from './types';
import { state } from '../state/AppState';
import { HistoryService } from '../services/HistoryService';
import { setRequest, newRow } from '../state/RequestState';
import { navigate } from '../state/NavigationState';
import type { HistoryEntry, HistoryFilter } from '../../src/types/History';
import type { HttpMethod } from '../../src/types/Request';

const METHODS: Array<HttpMethod | 'ALL'> = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const STATUS_GROUPS: Array<{ id: NonNullable<HistoryFilter['statusGroup']>; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'success', label: '2xx' },
  { id: 'redirect', label: '3xx' },
  { id: 'clientError', label: '4xx' },
  { id: 'serverError', label: '5xx' },
  { id: 'error', label: 'Errors' },
];

class HistoryPage implements Page {
  readonly id = 'history' as const;

  private container: HTMLElement | null = null;
  private tableRoot: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private method: HttpMethod | 'ALL' = 'ALL';
  private statusGroup: NonNullable<HistoryFilter['statusGroup']> = 'ALL';
  private search = '';
  private loading = false;
  private readonly unsub: Array<() => void> = [];

  render(container: HTMLElement): void {
    if (this.container !== container) {
      this.container = container;
      this.build(container);
      this.unsub.push(
        state.on('history', () => void this.refresh()),
        state.on('init', () => void this.refresh()),
      );
    }
    void this.refresh();
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;
    this.container = null;
  }

  private build(container: HTMLElement): void {
    container.className = 'gc-page';

    this.searchInput = h('input', {
      className: 'gc-input',
      attrs: { type: 'search', placeholder: 'Search by name, URL or status…', 'aria-label': 'Search history' },
      on: {
        input: (event) => {
          this.search = (event.currentTarget as HTMLInputElement).value;
          void this.refresh();
        },
      },
    }) as HTMLInputElement;

    const methodSelect = h(
      'select',
      {
        className: 'gc-select',
        attrs: { 'aria-label': 'Filter by method', style: 'width: auto' },
        on: {
          change: (event) => {
            this.method = (event.currentTarget as HTMLSelectElement).value as HttpMethod | 'ALL';
            void this.refresh();
          },
        },
      },
      ...METHODS.map((method) => h('option', { value: method, text: method })),
    ) as HTMLSelectElement;
    methodSelect.value = this.method;

    const statusFilters = h(
      'div',
      { className: 'gc-filters' },
      ...STATUS_GROUPS.map((group) =>
        h(
          'button',
          {
            className: `gc-filter-pill${this.statusGroup === group.id ? ' active' : ''}`,
            attrs: { type: 'button', 'data-group': group.id },
            on: {
              click: (event) => {
                this.statusGroup = group.id;
                for (const node of statusFilters.querySelectorAll('.gc-filter-pill')) {
                  node.classList.toggle('active', (node as HTMLElement).dataset['group'] === group.id);
                }
                void this.refresh();
              },
            },
          },
          group.label,
        ),
      ),
    );

    const toolbar = h(
      'div',
      { className: 'gc-toolbar' },
      h('div', { className: 'gc-search' }, icon('search'), this.searchInput),
      methodSelect,
      statusFilters,
      h('span', { className: 'gc-spacer' }),
      button('Cleanup', {
        size: 'sm',
        iconName: 'trash',
        title: 'Keep only the newest 50 entries',
        onClick: () => void this.cleanup(),
      }),
      button('Clear all', {
        size: 'sm',
        variant: 'danger',
        iconName: 'x',
        onClick: () => void this.clearAll(),
      }),
    );

    this.tableRoot = h('div');

    clear(container);
    container.append(
      pageHeader('History', 'Every request you send is recorded locally with redacted headers.'),
      toolbar,
      this.tableRoot,
    );
  }

  private async refresh(): Promise<void> {
    if (!this.tableRoot || this.loading) return;
    this.loading = true;
    clear(this.tableRoot);
    this.tableRoot.appendChild(loadingInline('Loading history…'));

    try {
      const filter: HistoryFilter = {
        ...(this.search.trim() ? { search: this.search.trim() } : {}),
        ...(this.method !== 'ALL' ? { method: this.method } : {}),
        ...(this.statusGroup !== 'ALL' ? { statusGroup: this.statusGroup } : {}),
        limit: 200,
      };
      const result = await HistoryService.search(filter);
      state.history = result.entries;
      state.historyTotal = result.total;
      this.renderTable(result.entries, result.total);
    } catch (error) {
      clear(this.tableRoot);
      this.tableRoot.appendChild(
        emptyState('warn', 'Could not load history', error instanceof Error ? error.message : String(error)),
      );
    } finally {
      this.loading = false;
    }
  }

  private renderTable(entries: HistoryEntry[], total: number): void {
    if (!this.tableRoot) return;
    clear(this.tableRoot);

    if (entries.length === 0) {
      this.tableRoot.appendChild(
        emptyState(
          'clock',
          total === 0 ? 'No history yet' : 'No matches',
          total === 0
            ? 'Requests you send are recorded here automatically.'
            : 'Try clearing the search or filters.',
          total === 0
            ? button('Open Requests', { variant: 'primary', iconName: 'send', onClick: () => navigate('requests') })
            : undefined,
        ),
      );
      return;
    }

    this.tableRoot.append(
      h(
        'div',
        { className: 'gc-table-wrap' },
        h(
          'table',
          { className: 'gc-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { text: 'When' }),
              h('th', { text: 'Method' }),
              h('th', { text: 'Name' }),
              h('th', { text: 'URL' }),
              h('th', { text: 'Status' }),
              h('th', { text: 'Time' }),
              h('th', { text: 'Size' }),
              h('th', { text: 'Tests' }),
              h('th', { text: '' }),
            ),
          ),
          h('tbody', null, ...entries.map((entry) => this.renderRow(entry))),
        ),
      ),
      h('div', { className: 'gc-dim gc-small', style: { marginTop: '8px' }, text: `Showing ${entries.length} of ${total}` }),
    );
  }

  private renderRow(entry: HistoryEntry): HTMLElement {
    const tests = entry.testSummary
      ? h('span', {
          className: `gc-chip ${entry.testSummary.failed > 0 ? 'error' : 'success'}`,
          text: `${entry.testSummary.passed}/${entry.testSummary.total}`,
        })
      : h('span', { className: 'gc-dim', text: '—' });

    return h(
      'tr',
      {
        className: 'clickable',
        on: { click: () => this.showDetail(entry) },
        title: entry.url,
      },
      h('td', { className: 'cell-muted cell-nowrap', text: formatTime(entry.timestamp) }),
      h('td', null, methodBadge(entry.method)),
      h('td', { className: 'cell-ellipsis', text: entry.name }),
      h('td', { className: 'cell-ellipsis cell-mono cell-muted', text: entry.url }),
      h('td', null, statusBadge(entry.status, !!entry.error)),
      h('td', { className: 'cell-mono', text: formatDuration(entry.responseTime) }),
      h('td', { className: 'cell-mono cell-muted', text: formatSize(entry.responseSize) }),
      h('td', null, tests),
      h(
        'td',
        { className: 'actions' },
        iconButton('refresh', 'Re-run', () => void this.rerun(entry)),
        iconButton('trash', 'Delete', () => void this.deleteEntry(entry), 'danger'),
      ),
    );
  }

  private showDetail(entry: HistoryEntry): void {
    const body = h('div');

    body.appendChild(
      h(
        'div',
        { className: 'gc-card', style: { marginBottom: '12px' } },
        h('div', { className: 'gc-row', style: { gap: '10px', flexWrap: 'wrap' } },
          methodBadge(entry.method),
          statusBadge(entry.status, !!entry.error),
          h('span', { className: 'gc-mono gc-small', text: entry.url })),
        h('div', { className: 'gc-dim gc-small', style: { marginTop: '8px' },
          text: `${entry.timestamp} · ${formatDuration(entry.responseTime)} · ${formatSize(entry.responseSize)}${entry.environmentName ? ` · ${entry.environmentName}` : ''}` }),
        entry.finalUrl && entry.finalUrl !== entry.url
          ? h('div', { className: 'gc-dim gc-small', text: `Final URL: ${entry.finalUrl}` })
          : h('span'),
      ),
    );

    if (entry.error) {
      body.appendChild(
        h('div', { className: 'gc-response-error', style: { margin: '0 0 12px' } },
          h('h4', { text: entry.error.message }),
          h('div', { className: 'code', text: entry.error.code })),
      );
    }

    if (entry.headers && Object.keys(entry.headers).length > 0) {
      const list = h('div', { className: 'gc-headers-list', style: { padding: '0' } });
      for (const [name, value] of Object.entries(entry.headers)) {
        list.appendChild(
          h('div', { className: 'gc-header-row' },
            h('span', { className: 'name', text: name }),
            h('span', { className: 'value', text: value })),
        );
      }
      body.appendChild(h('div', { className: 'gc-card' },
        h('div', { className: 'gc-card-title', text: 'Response headers' }), list));
    }

    if (entry.body) {
      body.appendChild(h('div', { className: 'gc-card', style: { marginTop: '12px' } },
        h('div', { className: 'gc-card-title', text: 'Response body' }),
        h('pre', { className: 'gc-pre', text: entry.body })));
    }

    const modal = new Modal({
      title: entry.name,
      body,
      wide: true,
      footer: [
        button('Close', { onClick: () => modal.close() }),
        button('Re-run', { variant: 'primary', iconName: 'refresh', onClick: () => { modal.close(); void this.rerun(entry); } }),
      ],
    });
    modal.open();
  }

  private async rerun(entry: HistoryEntry): Promise<void> {
    try {
      setRequest({
        id: `req_${Date.now().toString(36)}`,
        name: entry.name,
        method: entry.method,
        url: entry.url,
        params: [],
        headers: [],
        body: { type: 'none' },
        authentication: { type: 'none' },
        timeout: 30000,
        settings: { followRedirects: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      navigate('requests');
      state.pushToast('info', `Loaded "${entry.name}" — press Send to re-run.`);
      void newRow;
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async deleteEntry(entry: HistoryEntry): Promise<void> {
    try {
      await HistoryService.delete(entry.id);
      state.pushToast('success', 'Entry deleted.');
      state.historyTotal = Math.max(0, state.historyTotal - 1);
      state.emit('history');
      await this.refresh();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async clearAll(): Promise<void> {
    const confirmed = await confirmDialog(
      'Clear history',
      'Delete every recorded request? Collections and environments are not affected.',
      'Clear',
      true,
    );
    if (!confirmed) return;
    try {
      const result = await HistoryService.clear();
      state.pushToast('success', `Cleared ${result.removed} entr${result.removed === 1 ? 'y' : 'ies'}.`);
      state.historyTotal = 0;
      state.history = [];
      state.emit('history');
      await this.refresh();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const result = await HistoryService.cleanup(50);
      state.pushToast('success', `Removed ${result.removed} old entr${result.removed === 1 ? 'y' : 'ies'}.`);
      state.emit('history');
      await this.refresh();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }
}

export const historyPage = new HistoryPage();
