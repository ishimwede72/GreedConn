/**
 * CodeEditor — textarea-based editor with status line, JSON validation and
 * format-on-demand. Deliberately not a full Monaco integration (keeps the
 * bundle small and dependency-free).
 */
import { h, clear } from './dom';
import { RequestService } from '../services/RequestService';

export interface CodeEditorOptions {
  value: string;
  placeholder?: string;
  language?: 'json' | 'text' | 'xml' | 'html';
  minRows?: number;
  onChange?: (value: string) => void;
  showStatus?: boolean;
}

export class CodeEditor {
  private readonly root: HTMLElement;
  private readonly highlight: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly status: HTMLElement;
  private readonly options: CodeEditorOptions;
  private validateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CodeEditorOptions) {
    this.options = options;

    this.highlight = h('pre', {
      className: 'gc-code-highlight',
      attrs: { 'aria-hidden': 'true' },
    });
    this.textarea = h('textarea', {
      className: 'gc-code',
      attrs: {
        spellcheck: 'false',
        'aria-label': 'Code editor',
        placeholder: options.placeholder ?? '',
      },
      value: options.value,
    }) as HTMLTextAreaElement;
    this.textarea.rows = options.minRows ?? 8;
    const surface = h('div', { className: 'gc-editor-surface' }, this.highlight, this.textarea);

    this.status = h('div', { className: 'gc-editor-status' });

    this.textarea.addEventListener('input', () => {
      this.renderHighlight();
      this.options.onChange?.(this.textarea.value);
      if (this.options.language === 'json' && this.options.showStatus !== false) {
        this.scheduleValidation();
      }
    });

    this.textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        this.insertText('  ');
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        void this.format();
      }
    });
    this.textarea.addEventListener('scroll', () => this.syncHighlightScroll());

    this.root = h('div', { className: 'gc-editor' }, surface);
    this.renderHighlight();
    if (this.options.showStatus !== false) {
      this.root.appendChild(this.status);
      this.renderStatus(null);
    }
  }

  element(): HTMLElement {
    return this.root;
  }

  get value(): string {
    return this.textarea.value;
  }

  setValue(value: string): void {
    if (value !== this.textarea.value) {
      this.textarea.value = value;
      this.renderHighlight();
    }
  }

  focus(): void {
    this.textarea.focus();
  }

  private insertText(text: string): void {
    const { selectionStart, selectionEnd, value } = this.textarea;
    this.textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    const caret = selectionStart + text.length;
    this.textarea.setSelectionRange(caret, caret);
    this.renderHighlight();
    this.options.onChange?.(this.textarea.value);
  }

  private renderHighlight(): void {
    const source = this.textarea.value;
    const language = this.options.language;
    const tokens =
      language === 'json'
        ? highlightJson(source)
        : language === 'xml' ||
            language === 'html' ||
            (language === 'text' && looksLikeMarkup(source))
          ? highlightMarkup(source)
          : [];

    clear(this.highlight);
    if (tokens.length === 0) {
      this.highlight.textContent = source || '\u200b';
    } else {
      let offset = 0;
      for (const token of tokens) {
        if (token.start > offset) {
          this.highlight.appendChild(document.createTextNode(source.slice(offset, token.start)));
        }
        this.highlight.appendChild(
          h('span', { className: token.className, text: source.slice(token.start, token.end) }),
        );
        offset = token.end;
      }
      if (offset < source.length) {
        this.highlight.appendChild(document.createTextNode(source.slice(offset)));
      }
    }
    this.syncHighlightScroll();
  }

  private syncHighlightScroll(): void {
    this.highlight.style.transform = `translate(${-this.textarea.scrollLeft}px, ${-this.textarea.scrollTop}px)`;
  }

  private scheduleValidation(): void {
    if (this.validateTimer) clearTimeout(this.validateTimer);
    this.validateTimer = setTimeout(() => {
      void this.validate();
    }, 400);
  }

  async validate(): Promise<void> {
    if (this.options.language !== 'json') return;
    const text = this.textarea.value;
    if (!text.trim()) {
      this.renderStatus(null);
      return;
    }
    try {
      const result = await RequestService.validateJson(text);
      this.renderStatus(
        result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Invalid JSON' },
      );
    } catch {
      this.renderStatus({ ok: false, error: 'Validation unavailable.' });
    }
  }

  async format(): Promise<void> {
    const text = this.textarea.value;
    if (!text.trim()) return;
    try {
      const result = await RequestService.formatJson(text);
      if (result.ok) {
        this.textarea.value = result.text;
        this.renderHighlight();
        this.options.onChange?.(result.text);
        this.renderStatus({ ok: true });
      } else {
        this.renderStatus({ ok: false, error: result.error ?? 'Could not format JSON.' });
      }
    } catch {
      this.renderStatus({ ok: false, error: 'Formatting unavailable.' });
    }
  }

  private renderStatus(state: { ok: true } | { ok: false; error: string } | null): void {
    clear(this.status);
    if (this.options.language !== 'json') {
      const lines = this.textarea.value.split('\n').length;
      const bytes = new Blob([this.textarea.value]).size;
      this.status.append(
        h('span', { text: `${lines} line(s)` }),
        h('span', { text: formatBytes(bytes) }),
      );
      return;
    }
    if (state === null) {
      this.status.appendChild(h('span', { text: 'JSON — Ctrl+S to format' }));
      return;
    }
    this.status.appendChild(
      h('span', {
        className: state.ok ? 'valid' : 'invalid',
        text: state.ok ? '✓ Valid JSON' : `✗ ${state.error}`,
      }),
    );
  }
}

interface HighlightToken {
  start: number;
  end: number;
  className: string;
}

function highlightJson(source: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const start = index++;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += Math.min(2, source.length - index);
        } else if (source[index++] === '"') {
          break;
        }
      }
      let next = index;
      while (next < source.length && /\s/.test(source[next])) next++;
      tokens.push({
        start,
        end: index,
        className: source[next] === ':' ? 'tok-key' : 'tok-string',
      });
      continue;
    }

    if (char === '-' || /\d/.test(char)) {
      const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (number) {
        tokens.push({ start: index, end: index + number[0].length, className: 'tok-number' });
        index += number[0].length;
        continue;
      }
    }

    if (char === 't' || char === 'f' || char === 'n') {
      const literal = /^(true|false|null)\b/.exec(source.slice(index));
      if (literal) {
        tokens.push({
          start: index,
          end: index + literal[0].length,
          className: literal[0] === 'null' ? 'tok-null' : 'tok-bool',
        });
        index += literal[0].length;
        continue;
      }
    }

    if (
      char === '{' ||
      char === '}' ||
      char === '[' ||
      char === ']' ||
      char === ',' ||
      char === ':'
    ) {
      tokens.push({ start: index, end: index + 1, className: 'tok-punct' });
    }
    index++;
  }

  return tokens;
}

function looksLikeMarkup(source: string): boolean {
  return /^\s*<(?:!--|!doctype\b|\?|\/?[a-z][\w:-]*(?:\s|\/?>))/i.test(source);
}

function highlightMarkup(source: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const marker = source.indexOf('-->', index + 4);
      const end = marker < 0 ? source.length : marker + 3;
      tokens.push({ start: index, end, className: 'tok-comment' });
      index = end;
      continue;
    }
    if (source.startsWith('<![CDATA[', index)) {
      const marker = source.indexOf(']]>', index + 9);
      const end = marker < 0 ? source.length : marker + 3;
      tokens.push({ start: index, end, className: 'tok-meta' });
      index = end;
      continue;
    }
    if (source.startsWith('<!', index) || source.startsWith('<?', index)) {
      const end = findTagEnd(source, index);
      tokens.push({ start: index, end, className: 'tok-meta' });
      index = end;
      continue;
    }
    if (source[index] !== '<' || !/[/?A-Za-z]/.test(source[index + 1] ?? '')) {
      index++;
      continue;
    }

    const end = findTagEnd(source, index);
    let cursor = index;
    tokens.push({ start: cursor, end: cursor + 1, className: 'tok-punct' });
    cursor++;
    if (source[cursor] === '/') {
      tokens.push({ start: cursor, end: cursor + 1, className: 'tok-punct' });
      cursor++;
    }

    const tagName = /^[A-Za-z][\w:.-]*/.exec(source.slice(cursor));
    if (tagName) {
      tokens.push({ start: cursor, end: cursor + tagName[0].length, className: 'tok-tag' });
      cursor += tagName[0].length;
    }

    while (cursor < end) {
      if (/\s/.test(source[cursor])) {
        cursor++;
        continue;
      }
      if (source[cursor] === '>' || source[cursor] === '/') {
        tokens.push({ start: cursor, end: cursor + 1, className: 'tok-punct' });
        cursor++;
        continue;
      }

      const attribute = /^[^\s=/>]+/.exec(source.slice(cursor));
      if (!attribute) {
        cursor++;
        continue;
      }
      tokens.push({ start: cursor, end: cursor + attribute[0].length, className: 'tok-attr' });
      cursor += attribute[0].length;
      while (cursor < end && /\s/.test(source[cursor])) cursor++;
      if (source[cursor] !== '=') continue;

      tokens.push({ start: cursor, end: cursor + 1, className: 'tok-punct' });
      cursor++;
      while (cursor < end && /\s/.test(source[cursor])) cursor++;
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        const valueStart = cursor++;
        while (cursor < end && source[cursor] !== quote) cursor++;
        if (cursor < end) cursor++;
        tokens.push({ start: valueStart, end: cursor, className: 'tok-attr-value' });
      } else {
        const valueStart = cursor;
        while (cursor < end && !/[\s>]/.test(source[cursor])) cursor++;
        if (cursor > valueStart) {
          tokens.push({ start: valueStart, end: cursor, className: 'tok-attr-value' });
        }
      }
    }
    index = end;
  }

  return tokens;
}

function findTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index + 1;
    }
  }
  return source.length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
