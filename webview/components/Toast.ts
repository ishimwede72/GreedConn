/**
 * ToastHost — floating notifications driven by AppState.toasts.
 */
import { h, icon, clear } from './dom';
import { state, type ToastItem } from '../state/AppState';

const TOAST_LIFETIME_MS = 4500;

export class ToastHost {
  private readonly root: HTMLElement;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly unsub: Array<() => void> = [];

  constructor() {
    this.root = h('div', { className: 'gc-toasts', attrs: { 'aria-live': 'polite' } });
    this.unsub.push(
      state.on('toast', (payload) => {
        const item = payload as ToastItem | undefined;
        if (item) {
          this.show(item);
        } else {
          this.render();
        }
      }),
    );
  }

  element(): HTMLElement {
    return this.root;
  }

  private show(item: ToastItem): void {
    const timer = setTimeout(() => {
      this.timers.delete(item.id);
      state.dismissToast(item.id);
    }, TOAST_LIFETIME_MS);
    this.timers.set(item.id, timer);
    this.render();
  }

  private render(): void {
    clear(this.root);
    for (const toast of state.toasts) {
      const node = h(
        'div',
        { className: `gc-toast ${toast.level}`, attrs: { role: 'status' } },
        icon(toast.level === 'success' ? 'check' : toast.level === 'error' ? 'warn' : toast.level === 'warning' ? 'warn' : 'info'),
        h('span', { text: toast.message }),
        h(
          'button',
          {
            className: 'gc-toast-close',
            attrs: { type: 'button', 'aria-label': 'Dismiss' },
            on: {
              click: () => {
                const timer = this.timers.get(toast.id);
                if (timer) clearTimeout(timer);
                this.timers.delete(toast.id);
                state.dismissToast(toast.id);
              },
            },
          },
          icon('x'),
        ),
      );
      this.root.appendChild(node);
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const unsub of this.unsub) unsub();
  }
}
