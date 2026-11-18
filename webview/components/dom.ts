/**
 * Minimal hyperscript-style DOM helpers.
 *
 * All text content is set via `textContent` (never innerHTML) so untrusted
 * values (response bodies, imported collection names) cannot inject markup.
 */

export type Child = Node | string | number | null | undefined | false;

type Props = {
  className?: string;
  text?: string | number;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  ariaLabel?: string;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration> | string;
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: Partial<{
    [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void;
  }>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) applyProps(element, props);
  appendChildren(element, children);
  return element;
}

export function applyProps(element: HTMLElement, props: Props): void {
  if (props.className) element.className = props.className;
  if (props.text !== undefined) element.textContent = String(props.text);
  if (props.title !== undefined) element.title = props.title;
  if (props.id !== undefined) element.id = props.id;
  if (props.name !== undefined) element.setAttribute('name', props.name);
  if (props.href !== undefined) element.setAttribute('href', props.href);
  if (props.ariaLabel !== undefined) element.setAttribute('aria-label', props.ariaLabel);

  const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (props.value !== undefined) input.value = props.value;
  if (props.type !== undefined && input instanceof HTMLInputElement) input.type = props.type;
  if (props.placeholder !== undefined && 'placeholder' in input) {
    (input as HTMLInputElement | HTMLTextAreaElement).placeholder = props.placeholder;
  }
  if (props.disabled !== undefined) input.disabled = props.disabled;
  if (props.readOnly !== undefined && 'readOnly' in input) input.readOnly = props.readOnly;
  if (props.checked !== undefined && 'checked' in input) {
    (input as HTMLInputElement).checked = props.checked;
  }
  if (props.selected !== undefined && element instanceof HTMLOptionElement) {
    element.selected = props.selected;
  }

  if (props.dataset) {
    for (const [key, value] of Object.entries(props.dataset)) element.dataset[key] = value;
  }

  if (props.style) {
    if (typeof props.style === 'string') {
      element.setAttribute('style', props.style);
    } else {
      Object.assign(element.style, props.style);
    }
  }

  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === undefined || value === false) element.removeAttribute(key);
      else element.setAttribute(key, String(value));
    }
  }

  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      element.addEventListener(event, handler as EventListener);
    }
  }
}

export function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function clear(element: HTMLElement): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

export function mount(parent: HTMLElement, ...children: Child[]): void {
  clear(parent);
  appendChildren(parent, children);
}

export function icon(name: string, className = 'icon'): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] ?? ICON_PATHS['circle']);
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

const ICON_PATHS: Record<string, string> = {
  bolt: 'M13 2L4.5 13.5h5L9 22l9.5-12.5h-5.5L13 2z',
  home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z',
  send: 'M3 11l18-8-8 18-2-7-8-3z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm0 8l9 5-9 5-9-5 9-5z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10V6h-2v7l5 3 1-1.7-4-2.3z',
  flask: 'M9 3h6v2h-1v5.3l5 9.4a2 2 0 0 1-1.8 3H6.8a2 2 0 0 1-1.8-3l5-9.4V5H9V3zm2.2 7L8 18h8l-3.2-6h-3.6z',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4l-2-1.5.3-2.5-2.4-.7-1-2.3-2.4.6L12 2l-1.5 1.6-2.4-.6-1 2.3-2.4.7.3 2.5L3 12l2 1.5-.3 2.5 2.4.7 1 2.3 2.4-.6L12 22l1.5-1.6 2.4.6 1-2.3 2.4-.7-.3-2.5L21 12z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z',
  copy: 'M8 4h10a2 2 0 0 1 2 2v10h-2V6H8V4zM4 8h10a2 2 0 0 1 2 2v10H4V8z',
  check: 'M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z',
  x: 'M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z',
  search: 'M10 4a6 6 0 1 0 3.6 10.8l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  upload: 'M12 3l5 5h-3v6h-4V8H7l5-5zM5 18h14v2H5v-2z',
  download: 'M12 15l-5-5h3V4h4v6h3l-5 5zM5 18h14v2H5v-2z',
  play: 'M8 5v14l11-7L8 5z',
  stop: 'M6 6h12v12H6V6z',
  refresh: 'M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  eye: 'M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  save: 'M5 3h11l3 3v15H5V3zm2 2v5h8V5H7zm0 8v6h10v-6H7z',
  chevron: 'M9 6l6 6-6 6-1.4-1.4L12.2 12 7.6 7.4 9 6z',
  warn: 'M12 2L1 21h22L12 2zm-1 7h2v5h-2V9zm0 6h2v2h-2v-2z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v2h-2V7zm0 4h2v6h-2v-6z',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  external: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z',
  import: 'M12 3l5 5h-3v6h-4V8H7l5-5zM5 18h14v2H5v-2z',
  menu: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z',
  dots: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  lock: 'M12 2a5 5 0 0 0-5 5v3H6v12h12V10h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z',
  key: 'M14 3a7 7 0 1 0-6.9 8L8 12v2H6v2H4v2H2v-4l5.1-5.1A7 7 0 0 0 14 3zm2 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.9 9h-3.2a15.7 15.7 0 0 0-1.4-6.1A8 8 0 0 1 19.9 11zM12 4.1c.9 1.3 1.7 3.5 2 6.9h-4c.3-3.4 1.1-5.6 2-6.9zM8.7 4.9A15.7 15.7 0 0 0 7.3 11H4.1a8 8 0 0 1 4.6-6.1zM4.1 13h3.2c.1 2.3.6 4.4 1.4 6.1A8 8 0 0 1 4.1 13zm5.2 0h5.4c-.3 3.4-1.1 5.6-2 6.9-.9-1.3-1.7-3.5-2-6.9h1.4zm7.4 6.1c.8-1.7 1.3-3.8 1.4-6.1h3.2a8 8 0 0 1-4.6 6.1z',
  table: 'M3 5h18v14H3V5zm2 2v3h6V7H5zm8 0v3h6V7h-6zM5 12v3h6v-3H5zm8 0v3h6v-3h-6z',
};
