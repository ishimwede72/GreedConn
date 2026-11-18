/**
 * Tabs — generic tab bar with counts and keyboard support.
 */
import { h, icon, clear } from './dom';

export interface TabDefinition {
  id: string;
  label: string;
  count?: number;
  icon?: string;
}

export interface TabsOptions {
  tabs: TabDefinition[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export class Tabs {
  private readonly root: HTMLElement;
  private active: string;
  private readonly options: TabsOptions;

  constructor(options: TabsOptions) {
    this.options = options;
    this.active = options.active;
    this.root = h('div', {
      className: `gc-tabs${options.className ? ` ${options.className}` : ''}`,
      attrs: { role: 'tablist' },
    });
    this.render();
  }

  element(): HTMLElement {
    return this.root;
  }

  setActive(id: string): void {
    this.active = id;
    this.render();
  }

  get selected(): string {
    return this.active;
  }

  private render(): void {
    clear(this.root);
    for (const tab of this.options.tabs) {
      const button = h(
        'button',
        {
          className: `gc-tab${tab.id === this.active ? ' active' : ''}`,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(tab.id === this.active) },
          on: {
            click: () => {
              this.active = tab.id;
              this.render();
              this.options.onChange(tab.id);
            },
            keydown: (event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const index = this.options.tabs.findIndex((t) => t.id === this.active);
                const delta = event.key === 'ArrowRight' ? 1 : -1;
                const next =
                  this.options.tabs[(index + delta + this.options.tabs.length) % this.options.tabs.length];
                this.active = next.id;
                this.render();
                this.options.onChange(next.id);
                (this.root.querySelector('.gc-tab.active') as HTMLElement | null)?.focus();
              }
            },
          },
        },
        tab.icon ? icon(tab.icon) : null,
        h('span', { text: tab.label }),
        typeof tab.count === 'number' ? h('span', { className: 'count', text: String(tab.count) }) : null,
      );
      this.root.appendChild(button);
    }
  }
}
