/**
 * LoadingIndicator — inline spinner / skeleton / empty-state helpers.
 */
import { h, icon } from './dom';

export function spinner(size: 'sm' | 'lg' = 'sm'): HTMLElement {
  return h('span', { className: `gc-spinner${size === 'lg' ? ' lg' : ''}`, attrs: { 'aria-label': 'Loading' } });
}

export function loadingInline(label: string): HTMLElement {
  return h('span', { className: 'gc-loading-inline' }, spinner(), h('span', { text: label }));
}

export function skeleton(lines = 5): HTMLElement {
  const wrap = h('div', { className: 'gc-response-skeleton', attrs: { 'aria-busy': 'true' } });
  for (let i = 0; i < lines; i += 1) {
    wrap.appendChild(
      h('div', {
        className: 'gc-skeleton-line',
        style: { width: `${Math.max(40, 90 - i * 9)}%` },
      }),
    );
  }
  return wrap;
}

export function emptyState(
  iconName: string,
  title: string,
  message: string,
  action?: HTMLElement,
): HTMLElement {
  return h(
    'div',
    { className: 'gc-empty' },
    icon(iconName),
    h('h3', { text: title }),
    h('p', { text: message }),
    action ?? h('span'),
  );
}
