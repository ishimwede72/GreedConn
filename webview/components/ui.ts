/**
 * Shared UI primitives used across pages (badges, page headers, toolbars).
 */
import { h, icon } from './dom';
import type { HttpMethod } from '../../src/types/Request';

export function methodBadge(method: HttpMethod | string): HTMLElement {
  const normalized = String(method).toUpperCase();
  return h('span', { className: `gc-method ${normalized}`, text: normalized });
}

export function statusBadge(status: number | undefined, error?: boolean): HTMLElement {
  if (error || !status || status === 0) {
    return h('span', { className: 'gc-status neutral', text: 'ERR' });
  }
  const cls =
    status < 300 ? 'ok' : status < 400 ? 'redirect' : status < 500 ? 'client-error' : 'server-error';
  return h('span', { className: `gc-status ${cls}`, text: `${status}` });
}

export function pageHeader(title: string, subtitle?: string, actions?: HTMLElement[]): HTMLElement {
  return h(
    'div',
    { className: 'gc-page-header' },
    h(
      'div',
      null,
      h('h1', { text: title }),
      subtitle ? h('div', { className: 'subtitle', text: subtitle }) : h('span'),
    ),
    actions && actions.length > 0
      ? h('div', { className: 'gc-row' }, ...actions)
      : h('span'),
  );
}

export function button(
  label: string,
  options: {
    variant?: 'primary' | 'danger' | 'ghost' | 'default' | 'success';
    size?: 'sm' | 'md';
    iconName?: string;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
  },
): HTMLButtonElement {
  const className = [
    'gc-btn',
    options.variant && options.variant !== 'default' ? options.variant : '',
    options.size === 'sm' ? 'sm' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return h(
    'button',
    {
      className,
      attrs: { type: 'button', ...(options.title ? { title: options.title } : {}) },
      disabled: options.disabled ?? false,
      on: { click: options.onClick },
    },
    options.iconName ? icon(options.iconName) : null,
    label ? h('span', { text: label }) : null,
  );
}

export function iconButton(
  iconName: string,
  label: string,
  onClick: () => void,
  variant: 'ghost' | 'danger' = 'ghost',
): HTMLButtonElement {
  return h(
    'button',
    {
      className: `gc-btn sm ${variant} icon-only`,
      attrs: { type: 'button', 'aria-label': label, title: label },
      on: { click: onClick },
    },
    icon(iconName),
  );
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleString();
}

export function field(label: string, control: HTMLElement): HTMLElement {
  return h(
    'div',
    { className: 'gc-field' },
    h('label', { className: 'gc-label', text: label }),
    control,
  );
}

export function checkbox(
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const input = h('input', {
    attrs: { type: 'checkbox' },
    checked,
    on: {
      change: (event) => onChange((event.currentTarget as HTMLInputElement).checked),
    },
  });
  return h('label', { className: 'gc-check' }, input, h('span', { text: label }));
}

export function notice(
  message: string,
  variant: 'info' | 'warning' = 'info',
): HTMLElement {
  return h(
    'div',
    { className: `gc-notice${variant === 'warning' ? ' warning' : ''}` },
    icon(variant === 'warning' ? 'warn' : 'info'),
    h('span', { text: message }),
  );
}
