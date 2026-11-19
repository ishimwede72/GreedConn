/**
 * WelcomePage — a concise first-run guide for the request workspace.
 */
import { h, clear, icon } from '../components/dom';
import { button, pageHeader } from '../components/ui';
import type { Page } from './types';
import { state } from '../state/AppState';
import { navigate } from '../state/NavigationState';
import { bridge } from '../services/VsCodeBridge';
import { CollectionService } from '../services/CollectionService';
import { EnvironmentService } from '../services/EnvironmentService';
import { HistoryService } from '../services/HistoryService';

export const welcomePage: Page = {
  id: 'welcome',

  render(container: HTMLElement): void {
    container.className = 'gc-page gc-welcome-page';
    clear(container);

    container.append(
      pageHeader(
        'Welcome to Greedcon',
        'A focused workspace for building, sending and checking HTTP requests.',
        [
          button('Load demo data', {
            size: 'sm',
            iconName: 'bolt',
            onClick: () => void seedDemo(),
          }),
        ],
      ),
      h(
        'section',
        { className: 'gc-welcome-hero' },
        h('div', { className: 'gc-welcome-hero-mark', text: 'G', attrs: { 'aria-hidden': 'true' } }),
        h(
          'div',
          null,
          h('h2', { text: 'Send your first request in three steps' }),
          h(
            'p',
            { className: 'gc-muted' },
            'Keep request details on the left, inspect the response on the right, and save repeatable work into collections.',
          ),
        ),
      ),
      h(
        'section',
        { className: 'gc-welcome-guide', attrs: { 'aria-label': 'Getting started guide' } },
        guideStep(
          '1',
          'Create or import',
          'Start with a blank request, or import a Greedcon or Postman collection when you already have an API workspace.',
          button('New request', { size: 'sm', variant: 'primary', iconName: 'send', onClick: () => navigate('requests') }),
          button('Open collections', { size: 'sm', iconName: 'folder', onClick: () => navigate('collections') }),
        ),
        guideStep(
          '2',
          'Configure the request',
          'Choose a method and URL, then use Params, Headers, Body and Auth to describe what the API expects. Use {{variable}} for reusable values.',
          button('Manage environments', { size: 'sm', iconName: 'layers', onClick: () => navigate('environments') }),
        ),
        guideStep(
          '3',
          'Send and verify',
          'Send the request, read the status and body in the response panel, then add declarative tests for status, timing, headers or JSON paths.',
          button('Open requests', { size: 'sm', variant: 'primary', iconName: 'send', onClick: () => navigate('requests') }),
          button('Write tests', { size: 'sm', iconName: 'flask', onClick: () => navigate('tests') }),
        ),
      ),
      h(
        'section',
        { className: 'gc-welcome-note' },
        icon('lock'),
        h(
          'div',
          null,
          h('strong', { text: 'Your workspace stays local' }),
          h(
            'p',
            { className: 'gc-muted gc-small' },
            'Requests run in the extension host. Collections and history stay in VS Code storage, while credentials use SecretStorage.',
          ),
        ),
      ),
    );
  },
};

function guideStep(number: string, title: string, description: string, ...actions: HTMLElement[]): HTMLElement {
  return h(
    'article',
    { className: 'gc-welcome-step' },
    h('div', { className: 'gc-welcome-step-number', text: number }),
    h(
      'div',
      { className: 'gc-welcome-step-content' },
      h('h3', { text: title }),
      h('p', { className: 'gc-muted gc-small', text: description }),
      h('div', { className: 'gc-welcome-step-actions' }, ...actions),
    ),
  );
}

async function seedDemo(): Promise<void> {
  try {
    const result = await bridge.request<{ seeded: boolean }>('demo.seed', {}, 30000);
    state.pushToast(result.seeded ? 'success' : 'info', result.seeded ? 'Demo data created.' : 'Demo data already exists.');
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
