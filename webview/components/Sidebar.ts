/**
 * Sidebar — brand, 7-item navigation and version footer.
 */
import { h, icon, mount, clear } from './dom';
import type { PageId } from '../../src/types/Messages';
import { PAGE_LABELS, PAGE_ICONS, navigate } from '../state/NavigationState';
import { state } from '../state/AppState';

const ORDER: PageId[] = [
  'welcome',
  'requests',
  'collections',
  'environments',
  'history',
  'tests',
  'settings',
];

export class Sidebar {
  private readonly root: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly unsub: Array<() => void> = [];

  constructor() {
    this.nav = h('nav', { className: 'gc-nav', attrs: { 'aria-label': 'Greedcon navigation' } });
    this.footer = h('div', { className: 'gc-sidebar-footer' });

    const brand = h(
      'div',
      {
        className: 'gc-brand',
        on: { click: () => navigate('welcome') },
        attrs: { role: 'button', tabindex: '0' },
      },
      h('div', { className: 'gc-brand-mark' }, icon('bolt')),
      h(
        'div',
        null,
        h('div', { className: 'gc-brand-name', text: 'Greedcon' }),
        h('div', { className: 'gc-brand-tagline', text: 'Test. Build. Scale.' }),
      ),
    );

    this.root = h('aside', { className: 'gc-sidebar' }, brand, this.nav, this.footer);
    this.renderNav();
    this.renderFooter();

    this.unsub.push(
      state.on('page', () => this.renderNav()),
      state.on('init', () => this.renderFooter()),
      state.on('history', () => this.renderNav()),
    );
  }

  element(): HTMLElement {
    return this.root;
  }

  private renderNav(): void {
    clear(this.nav);
    for (const page of ORDER) {
      const item = h(
        'button',
        {
          className: `gc-nav-item${state.page === page ? ' active' : ''}`,
          attrs: { type: 'button', 'data-page': page },
          on: { click: () => navigate(page) },
        },
        icon(PAGE_ICONS[page]),
        h('span', { text: PAGE_LABELS[page] }),
        this.badgeFor(page),
      );
      this.nav.appendChild(item);
    }
  }

  private badgeFor(page: PageId): HTMLElement | null {
    if (page === 'history' && state.historyTotal > 0) {
      return h('span', { className: 'gc-nav-badge', text: String(state.historyTotal) });
    }
    if (page === 'collections' && state.collectionSummaries.length > 0) {
      return h('span', { className: 'gc-nav-badge', text: String(state.collectionSummaries.length) });
    }
    if (page === 'tests' && state.testHistory.length > 0) {
      return h('span', { className: 'gc-nav-badge', text: String(state.testHistory.length) });
    }
    return null;
  }

  private renderFooter(): void {
    mount(
      this.footer,
      h(
        'span',
        { className: 'gc-version-pill' },
        icon('bolt'),
        h('span', { text: `v${state.version}` }),
      ),
      h('span', { className: 'gc-dim', text: 'Local-first API testing' }),
    );
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
  }
}
