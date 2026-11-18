/**
 * KeyValueEditor — editable key/value/description rows with enable toggles.
 * Used for query params and headers in the request builder.
 */
import { h, icon, clear } from './dom';
import type { KeyValueRow } from '../../src/types/Request';

export interface KeyValueEditorOptions {
  kind: 'params' | 'headers';
  rows: KeyValueRow[];
  onChange: () => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  allowDescription?: boolean;
}

export class KeyValueEditor {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly options: KeyValueEditorOptions;

  constructor(options: KeyValueEditorOptions) {
    this.options = options;
    this.root = h('div', { className: 'gc-kv-editor' });
    this.list = h('div', { className: 'gc-kv-list' });
    this.render();
  }

  element(): HTMLElement {
    return this.root;
  }

  update(rows: KeyValueRow[]): void {
    this.options.rows = rows;
    this.render();
  }

  /** Current rows (the editor mutates them in place). */
  getRows(): KeyValueRow[] {
    return this.options.rows;
  }

  private render(): void {
    clear(this.root);

    const head = h(
      'div',
      { className: 'gc-kv-head' },
      h('span', { text: '' }),
      h('span', { text: 'Key' }),
      h('span', { text: 'Value' }),
      h('span', { className: 'desc-col', text: 'Description' }),
      h('span', { text: '' }),
    );
    this.root.appendChild(head);
    clear(this.list);

    for (const row of this.options.rows) {
      this.list.appendChild(this.renderRow(row));
    }
    this.root.appendChild(this.list);

    this.root.appendChild(
      h(
        'div',
        { className: 'gc-row', style: { marginTop: '8px' } },
        h(
          'button',
          {
            className: 'gc-btn sm ghost',
            attrs: { type: 'button' },
            on: {
              click: () => {
                this.options.rows.push(blankRow());
                this.options.onChange();
                this.render();
              },
            },
          },
          icon('plus'),
          h('span', { text: `Add ${this.options.kind === 'params' ? 'parameter' : 'header'}` }),
        ),
        this.options.rows.length > 0
          ? h(
              'button',
              {
                className: 'gc-btn sm ghost',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    this.options.rows.length = 0;
                    this.options.onChange();
                    this.render();
                  },
                },
              },
              icon('trash'),
              h('span', { text: 'Clear all' }),
            )
          : h('span'),
      ),
    );
  }

  private renderRow(row: KeyValueRow): HTMLElement {
    const rowRoot = h('div', { className: `gc-kv-row${row.enabled ? '' : ' disabled'}` });

    const toggle = h('input', {
      attrs: { type: 'checkbox', 'aria-label': 'Enable row' },
      checked: row.enabled,
      on: {
        change: (event) => {
          row.enabled = (event.currentTarget as HTMLInputElement).checked;
          rowRoot.classList.toggle('disabled', !row.enabled);
          this.options.onChange();
        },
      },
    });

    const keyInput = h('input', {
      className: 'gc-input mono',
      attrs: { type: 'text', placeholder: this.options.keyPlaceholder, 'aria-label': 'Key' },
      value: row.key,
      on: {
        input: (event) => {
          row.key = (event.currentTarget as HTMLInputElement).value;
          this.options.onChange();
        },
      },
    });

    const valueInput = h('input', {
      className: 'gc-input mono',
      attrs: { type: 'text', placeholder: this.options.valuePlaceholder, 'aria-label': 'Value' },
      value: row.value,
      on: {
        input: (event) => {
          row.value = (event.currentTarget as HTMLInputElement).value;
          this.options.onChange();
        },
      },
    });

    const descInput = h('input', {
      className: 'gc-input desc-col',
      attrs: { type: 'text', placeholder: 'Description (optional)', 'aria-label': 'Description' },
      value: row.description ?? '',
      on: {
        input: (event) => {
          const value = (event.currentTarget as HTMLInputElement).value;
          if (value) row.description = value;
          else delete row.description;
          this.options.onChange();
        },
      },
    });

    const remove = h(
      'button',
      {
        className: 'gc-btn sm ghost icon-only',
        attrs: { type: 'button', 'aria-label': 'Remove row' },
        on: {
          click: () => {
            const index = this.options.rows.findIndex((r) => r.id === row.id);
            if (index >= 0) this.options.rows.splice(index, 1);
            this.options.onChange();
            this.render();
          },
        },
      },
      icon('x'),
    );

    rowRoot.append(toggle, keyInput, valueInput, descInput, remove);
    return rowRoot;
  }
}

let counter = 0;

export function blankRow(): KeyValueRow {
  counter += 1;
  return {
    id: `row_${Date.now().toString(36)}_${counter}`,
    key: '',
    value: '',
    enabled: true,
  };
}
