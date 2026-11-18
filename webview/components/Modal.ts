/**
 * Modal — accessible dialog with backdrop, escape-to-close and focus trap.
 */
import { h, icon, clear } from './dom';

export interface ModalOptions {
  title: string;
  body: HTMLElement | HTMLElement[];
  footer?: HTMLElement[];
  wide?: boolean;
  onClose?: () => void;
}

export class Modal {
  private readonly backdrop: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly previousFocus: HTMLElement | null;
  private closed = false;

  constructor(private readonly options: ModalOptions) {
    this.dialog = h('div', { className: `gc-modal${options.wide ? ' wide' : ''}` });
    this.backdrop = h('div', { className: 'gc-modal-backdrop' });
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const header = h(
      'div',
      { className: 'gc-modal-header' },
      h('h2', { text: options.title }),
      h(
        'button',
        {
          className: 'gc-btn ghost icon-only',
          attrs: { type: 'button', 'aria-label': 'Close dialog' },
          on: { click: () => this.close() },
        },
        icon('x'),
      ),
    );

    const bodyWrap = h('div', { className: 'gc-modal-body' });
    for (const child of Array.isArray(options.body) ? options.body : [options.body]) {
      bodyWrap.appendChild(child);
    }

    this.dialog.appendChild(header);
    this.dialog.appendChild(bodyWrap);

    if (options.footer && options.footer.length > 0) {
      const footer = h('div', { className: 'gc-modal-footer' });
      for (const child of options.footer) footer.appendChild(child);
      this.dialog.appendChild(footer);
    }

    this.backdrop.appendChild(this.dialog);
    this.backdrop.addEventListener('mousedown', (event) => {
      if (event.target === this.backdrop) this.close();
    });
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  };

  private trapFocus(event: KeyboardEvent): void {
    const focusable = this.dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  open(): void {
    document.body.appendChild(this.backdrop);
    const focusable = this.dialog.querySelector<HTMLElement>('input, textarea, select, button');
    focusable?.focus();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.backdrop.remove();
    this.previousFocus?.focus();
    this.options.onClose?.();
  }

  get isOpen(): boolean {
    return !this.closed;
  }
}

/** Convenience: confirm dialog resolving to a boolean. */
export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
  danger = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };

    const cancel = h('button', {
      className: 'gc-btn',
      attrs: { type: 'button' },
      text: 'Cancel',
      on: { click: () => finish(false) },
    });
    const confirm = h('button', {
      className: `gc-btn ${danger ? 'danger' : 'primary'}`,
      attrs: { type: 'button' },
      text: confirmLabel,
      on: { click: () => finish(true) },
    });

    const modal = new Modal({
      title,
      body: h('p', { className: 'gc-muted', text: message }),
      footer: [cancel, confirm],
      onClose: () => finish(false),
    });
    modal.open();
    confirm.focus();
  });
}

/** Convenience: prompt dialog with a single text input. */
export function promptDialog(
  title: string,
  label: string,
  initial = '',
  placeholder = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const input = h('input', {
      className: 'gc-input',
      attrs: { type: 'text', placeholder, 'aria-label': label },
      value: initial,
    });

    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(input.value.trim());
    });

    const cancel = h('button', {
      className: 'gc-btn',
      attrs: { type: 'button' },
      text: 'Cancel',
      on: { click: () => finish(null) },
    });
    const submit = h('button', {
      className: 'gc-btn primary',
      attrs: { type: 'button' },
      text: 'Save',
      on: { click: () => finish(input.value.trim()) },
    });

    const modal = new Modal({
      title,
      body: [
        h('div', { className: 'gc-field' }, h('label', { className: 'gc-label', text: label }), input),
      ],
      footer: [cancel, submit],
      onClose: () => finish(null),
    });
    modal.open();
    input.select();
  });
}

/** Replace modal body contents (used by dynamic dialogs). */
export function setModalBody(modal: Modal, content: HTMLElement): void {
  const body = modal['dialog']?.querySelector?.('.gc-modal-body');
  if (body) {
    clear(body as HTMLElement);
    body.appendChild(content);
  }
}
