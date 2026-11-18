/**
 * WelcomePage — quick-start cards, recent activity and demo-data seeding.
 */
import { h, icon } from '../components/dom';
import { emptyState } from '../components/Loading';
import { button, formatTime, pageHeader, statusBadge, methodBadge } from '../components/ui';
import type { Page } from './types';
import { state } from '../state/AppState';
import { navigate } from '../state/NavigationState';
import { bridge } from '../services/VsCodeBridge';
import { CollectionService } from '../services/CollectionService';
import { EnvironmentService } from '../services/EnvironmentService';
import { HistoryService } from '../services/HistoryService';

interface QuickAction {
  title: string;
  description: string;
  iconName: string;
  action: () => void;
}

export const welcomePage: Page = {
  id: 'welcome',

  render(container: HTMLElement): void {
    container.className = 'gc-page';

    const actions: QuickAction[] = [
      {
        title: 'New Request',
        description: 'Build and send an HTTP request with params, headers, body and auth.',
        iconName: 'send',
        action: () => navigate('requests'),
      },
      {
        title: 'Import Collection',
        description: 'Bring in a Greedcon or Postman collection to organize your API tests.',
        iconName: 'upload',
        action: () => navigate('collections'),
      },
      {
        title: 'Create Environment',
        description: 'Define variables like base_url and reuse them across requests.',
        iconName: 'layers',
        action: () => navigate('environments'),
      },
      {
        title: 'Write Tests',
        description: 'Add declarative assertions — status, JSON path, headers, timing.',
        iconName: 'flask',
        action: () => navigate('tests'),
      },
    ];

    const quickStart = h(
      'div',
      { className: 'gc-grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' } },
      ...actions.map((entry) =>
        h(
          'div',
          {
            className: 'gc-card',
            style: { cursor: 'pointer' },
            attrs: { role: 'button', tabindex: '0' },
            on: {
              click: entry.action,
              keydown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  entry.action();
                }
              },
            },
          },
          h(
            'div',
            { className: 'gc-row', style: { marginBottom: '8px', gap: '10px' } },
            h(
              'div',
              {
                className: 'gc-brand-mark',
                style: { width: '32px', height: '32px' },
              },
              icon(entry.iconName),
            ),
            h('h3', { text: entry.title }),
          ),
          h('p', { className: 'gc-muted gc-small', text: entry.description }),
        ),
      ),
    );

    const stats = renderStats();
    const recent = renderRecent();

    const seedButton = button('Load demo data', {
      iconName: 'bolt',
      variant: 'ghost',
      size: 'sm',
      onClick: () => void seedDemo(),
    });

    container.append(
      pageHeader(
        `Welcome to Greedcon`,
        'A local-first API testing workspace — requests, collections, environments and tests.',
        [seedButton],
      ),
      renderHero(),
      stats,
      h('div', { className: 'gc-card' }, h('div', { className: 'gc-card-title', text: 'Quick start' }), quickStart),
      recent,
      h(
        'div',
        { className: 'gc-card' },
        h('div', { className: 'gc-card-title', text: 'About' }),
        h(
          'p',
          { className: 'gc-muted gc-small' },
          'Greedcon runs entirely on your machine. Requests are executed by the extension host using ',
          h('code', { text: 'node:http/https' }),
          ', secrets are stored in VS Code SecretStorage, and tests are declarative assertions — no scripts ever execute.',
        ),
      ),
    );
  },
};

function renderHero(): HTMLElement {
  return h(
    'div',
    {
      className: 'gc-card',
      style: {
        background:
          'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(124,92,255,0.04) 60%), var(--gc-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '16px',
      },
    },
    h(
      'div',
      { className: 'gc-brand-mark', style: { width: '46px', height: '46px', borderRadius: '12px' } },
      icon('bolt'),
    ),
    h(
      'div',
      null,
      h('h2', { text: 'Test. Build. Scale.' }),
      h('p', { className: 'gc-muted', style: { marginTop: '4px' } },
        'Send requests, organize collections, manage environments and assert responses — without leaving VS Code.'),
    ),
  );
}

function renderStats(): HTMLElement {
  const collectionCount = state.collectionSummaries.length;
  const environmentCount = state.environments.length;
  const historyCount = state.historyTotal;

  return h(
    'div',
    { className: 'gc-stats' },
    stat('Collections', String(collectionCount), 'accent', () => navigate('collections')),
    stat('Environments', String(environmentCount), '', () => navigate('environments')),
    stat('Requests sent', String(historyCount), '', () => navigate('history')),
    stat(
      'Test runs',
      String(state.testHistory.length),
      state.testHistory.some((run) => run.summary.failed > 0) ? 'err' : 'ok',
      () => navigate('tests'),
    ),
  );
}

function stat(label: string, value: string, tone: string, onClick: () => void): HTMLElement {
  return h(
    'div',
    {
      className: 'gc-stat',
      style: { cursor: 'pointer' },
      on: { click: onClick },
    },
    h('div', { className: 'label', text: label }),
    h('div', { className: `value ${tone}`, text: value }),
  );
}

function renderRecent(): HTMLElement {
  const entries = state.history.slice(0, 5);
  const body =
    entries.length === 0
      ? emptyState(
          'clock',
          'No requests yet',
          'Send your first request from the Requests page — it will show up here.',
          button('Open Requests', { variant: 'primary', iconName: 'send', onClick: () => navigate('requests') }),
        )
      : h(
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
                h('th', { text: 'Method' }),
                h('th', { text: 'Name' }),
                h('th', { text: 'Status' }),
                h('th', { text: 'When' }),
              ),
            ),
            h(
              'tbody',
              null,
              ...entries.map((entry) =>
                h(
                  'tr',
                  { className: 'clickable', on: { click: () => navigate('history') } },
                  h('td', null, methodBadge(entry.method)),
                  h('td', { className: 'cell-ellipsis', text: entry.name }),
                  h('td', null, statusBadge(entry.status, !!entry.error)),
                  h('td', { className: 'cell-muted', text: formatTime(entry.timestamp) }),
                ),
              ),
            ),
          ),
        );

  return h(
    'div',
    { className: 'gc-card' },
    h(
      'div',
      { className: 'gc-card-title' },
      h('span', { text: 'Recent activity' }),
      h(
        'button',
        {
          className: 'gc-btn sm ghost',
          attrs: { type: 'button' },
          on: { click: () => navigate('history') },
        },
        h('span', { text: 'View all' }),
      ),
    ),
    body,
  );
}

async function seedDemo(): Promise<void> {
  try {
    const result = await bridge.request<{ seeded: boolean }>('demo.seed', {}, 30000);
    if (result.seeded) {
      state.pushToast('success', 'Demo collection and environment created.');
    } else {
      state.pushToast('info', 'Demo data already exists.');
    }
    const [collections, environments, history] = await Promise.all([
      CollectionService.list(),
      EnvironmentService.list(),
      HistoryService.search({ limit: 50 }),
    ]);
    state.setCollections(collections.collections);
    state.setEnvironments(environments.environments, environments.activeEnvironmentId);
    state.globals = environments.globals.variables;
    state.history = history.entries;
    state.historyTotal = history.total;
    state.emit('environments');
    state.emit('history');
  } catch (error) {
    state.pushToast('error', error instanceof Error ? error.message : String(error));
  }
}
