/**
 * JsonViewer — pretty/pretty-printed JSON rendering with collapsible nodes
 * and lightweight syntax tinting. Never uses innerHTML with raw content:
 * tokens are built as text nodes / spans.
 */
import { h, icon, clear } from './dom';

export type JsonViewMode = 'pretty' | 'raw' | 'preview';

function parse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Highlight a JSON string into span tokens (safe: text nodes only). */
export function highlightJson(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const pattern =
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const [whole, key, str, num, bool, nul, punct] = match;
    const className = key
      ? 'tok-key'
      : str
        ? 'tok-string'
        : num
          ? 'tok-number'
          : bool
            ? 'tok-bool'
            : nul
              ? 'tok-null'
              : 'tok-punct';
    const span = document.createElement('span');
    span.className = className;
    span.textContent = whole;
    fragment.appendChild(span);
    lastIndex = match.index + whole.length;
  }
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  return fragment;
}

export interface JsonViewerOptions {
  text: string;
  mode: JsonViewMode;
  onChangeMode?: (mode: JsonViewMode) => void;
  emptyLabel?: string;
}

export class JsonViewer {
  private readonly root: HTMLElement;
  private options: JsonViewerOptions;

  constructor(options: JsonViewerOptions) {
    this.options = options;
    this.root = h('div', { className: 'gc-json-viewer' });
    this.render();
  }

  element(): HTMLElement {
    return this.root;
  }

  update(options: Partial<JsonViewerOptions>): void {
    this.options = { ...this.options, ...options };
    this.render();
  }

  private render(): void {
    clear(this.root);
    const { text, mode } = this.options;

    if (!text || text.trim().length === 0) {
      this.root.appendChild(
        h('pre', { className: 'gc-pre empty', text: this.options.emptyLabel ?? 'No content yet.' }),
      );
      return;
    }

    if (mode === 'raw') {
      this.root.appendChild(h('pre', { className: 'gc-pre', text }));
      return;
    }

    const parsed = parse(text);
    if (!parsed.ok) {
      const pre = h('pre', { className: 'gc-pre' });
      pre.appendChild(highlightJson(text));
      this.root.appendChild(pre);
      this.root.appendChild(
        h(
          'div',
          { className: 'gc-editor-status' },
          h('span', { className: 'invalid', text: `Invalid JSON: ${parsed.error}` }),
        ),
      );
      return;
    }

    if (mode === 'preview') {
      this.root.appendChild(renderPreview(parsed.value));
      return;
    }

    const formatted = JSON.stringify(parsed.value, null, 2);
    const pre = h('pre', { className: 'gc-pre' });
    pre.appendChild(highlightJson(formatted));
    this.root.appendChild(pre);
  }
}

function renderPreview(value: unknown): HTMLElement {
  if (typeof value === 'string') {
    return h('div', { className: 'gc-preview-content', style: { padding: '14px' } }, h('p', { text: value }));
  }
  const pre = h('pre', { className: 'gc-pre' });
  pre.appendChild(highlightJson(JSON.stringify(value, null, 2)));
  return pre;
}

/** Expandable tree node for large JSON (used for very big payloads). */
export function collapsibleJson(label: string, content: HTMLElement, depth = 0): HTMLElement {
  const body = h('div', { className: 'gc-json-children' });
  body.style.display = depth < 2 ? 'block' : 'none';
  const caret = icon('chevron');
  caret.style.transform = depth < 2 ? 'rotate(90deg)' : 'none';

  const head = h(
    'div',
    {
      className: 'gc-json-node-head',
      style: { cursor: 'pointer', padding: '3px 0', display: 'flex', gap: '6px', alignItems: 'center' },
      on: {
        click: () => {
          const open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          caret.style.transform = open ? 'none' : 'rotate(90deg)';
        },
      },
    },
    caret,
    h('span', { className: 'mono', text: label }),
  );

  const wrap = h('div', null, head, body);
  body.appendChild(content);
  return wrap;
}
