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
  language?: 'json' | 'text' | 'xml';
  minRows?: number;
  onChange?: (value: string) => void;
  showStatus?: boolean;
}

export class CodeEditor {
  private readonly root: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly status: HTMLElement;
  private readonly options: CodeEditorOptions;
  private validateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CodeEditorOptions) {
    this.options = options;

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

    this.status = h('div', { className: 'gc-editor-status' });

    this.textarea.addEventListener('input', () => {
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

    this.root = h('div', { className: 'gc-editor' }, this.textarea);
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
    if (value !== this.textarea.value) this.textarea.value = value;
  }

  focus(): void {
    this.textarea.focus();
  }

  private insertText(text: string): void {
    const { selectionStart, selectionEnd, value } = this.textarea;
    this.textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    const caret = selectionStart + text.length;
    this.textarea.setSelectionRange(caret, caret);
    this.options.onChange?.(this.textarea.value);
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
      this.renderStatus(result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Invalid JSON' });
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
