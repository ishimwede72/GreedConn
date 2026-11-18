/**
 * EnvironmentsPage — environment list, active selection, global variables
 * and per-environment variable management (with secret masking).
 */
import { h, icon, clear } from '../components/dom';
import { emptyState } from '../components/Loading';
import { button, iconButton, pageHeader, notice } from '../components/ui';
import { confirmDialog, promptDialog } from '../components/Modal';
import type { Page } from './types';
import { state } from '../state/AppState';
import { EnvironmentService } from '../services/EnvironmentService';
import type { Environment, EnvironmentVariable } from '../../src/types/Environment';

const MASK = '••••••••';

type Scope = { kind: 'environment'; id: string } | { kind: 'globals' };

class EnvironmentsPage implements Page {
  readonly id = 'environments' as const;

  private container: HTMLElement | null = null;
  private listRoot: HTMLElement | null = null;
  private detailRoot: HTMLElement | null = null;
  private scope: Scope | null = null;
  private readonly unsub: Array<() => void> = [];

  render(container: HTMLElement): void {
    if (this.container !== container) {
      this.container = container;
      this.build(container);
      this.unsub.push(
        state.on('environments', () => {
          this.refreshList();
          this.refreshDetail();
        }),
      );
    }
    void this.ensureData().finally(() => {
      this.refreshList();
      this.refreshDetail();
    });
  }

  dispose(): void {
    for (const unsub of this.unsub) unsub();
    this.unsub.length = 0;
    this.container = null;
  }

  private async ensureData(): Promise<void> {
    if (state.environments.length > 0 && state.globals) return;
    try {
      const result = await EnvironmentService.list();
      state.setEnvironments(result.environments, result.activeEnvironmentId);
      state.globals = result.globals.variables;
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private build(container: HTMLElement): void {
    container.className = 'gc-page';
    this.listRoot = h('div', { className: 'gc-env-list' });
    this.detailRoot = h('div', { className: 'gc-env-detail' });

    clear(container);
    container.append(
      pageHeader(
        'Environments',
        'Reuse values like base_url and tokens across requests with {{variable}} references.',
        [
          button('Import', { size: 'sm', iconName: 'upload', onClick: () => void this.importEnv() }),
          button('New environment', { size: 'sm', variant: 'primary', iconName: 'plus', onClick: () => void this.createEnv() }),
        ],
      ),
      notice('Secret variables are masked in the UI and never written to collections, history or exports.'),
      h('div', { className: 'gc-env-layout' }, this.listRoot, this.detailRoot),
    );
  }

  // --- list -------------------------------------------------------------

  private refreshList(): void {
    if (!this.listRoot) return;
    clear(this.listRoot);

    if (!this.scope) {
      this.scope = state.activeEnvironmentId
        ? { kind: 'environment', id: state.activeEnvironmentId }
        : state.environments.length > 0
          ? { kind: 'environment', id: state.environments[0].id }
          : { kind: 'globals' };
    }

    // Global variables card first.
    const globalsCount = state.globals?.length ?? 0;
    this.listRoot.appendChild(
      h(
        'div',
        {
          className: `gc-env-card${this.scope.kind === 'globals' ? ' active' : ''}`,
          on: { click: () => { this.scope = { kind: 'globals' }; this.refreshList(); this.refreshDetail(); } },
        },
        h('div', { className: 'name' }, icon('globe'), h('span', { text: 'Global variables' })),
        h('div', { className: 'meta', text: `${globalsCount} variable(s) · available everywhere` }),
      ),
    );

    for (const environment of state.environments) {
      const active = environment.id === state.activeEnvironmentId;
      const selected = this.scope?.kind === 'environment' && this.scope.id === environment.id;
      this.listRoot.appendChild(
        h(
          'div',
          {
            className: `gc-env-card${selected ? ' active' : ''}`,
            on: {
              click: () => {
                this.scope = { kind: 'environment', id: environment.id };
                this.refreshList();
                this.refreshDetail();
              },
            },
          },
          h('div', { className: 'name' },
            active ? h('span', { className: 'active-dot' }) : icon('layers'),
            h('span', { text: environment.name })),
          h('div', { className: 'meta', text: `${environment.variables.length} variable(s)${active ? ' · active' : ''}` }),
          h('div', { className: 'gc-row', style: { marginTop: '8px', gap: '6px' } },
            active
              ? h('span', { className: 'gc-chip success', text: 'Active' })
              : button('Set active', { size: 'sm', onClick: () => void this.setActive(environment.id) }),
            iconButton('trash', 'Delete environment', () => void this.deleteEnv(environment), 'danger')),
        ),
      );
    }

    if (state.environments.length === 0) {
      this.listRoot.appendChild(
        emptyState('layers', 'No environments', 'Create an environment to store base URLs, tokens and other values.'),
      );
    }
  }

  // --- detail -----------------------------------------------------------

  private refreshDetail(): void {
    if (!this.detailRoot) return;
    clear(this.detailRoot);

    if (!this.scope) {
      this.detailRoot.appendChild(emptyState('layers', 'Nothing selected', 'Select an environment on the left.'));
      return;
    }

    const isGlobals = this.scope.kind === 'globals';
    const environment = isGlobals
      ? null
      : state.environments.find((env) => env.id === (this.scope as { id: string }).id) ?? null;

    if (!isGlobals && !environment) {
      this.detailRoot.appendChild(emptyState('layers', 'Environment not found', 'It may have been deleted.'));
      return;
    }

    const variables = (isGlobals ? state.globals : environment?.variables ?? []) as EnvironmentVariable[];
    const title = isGlobals ? 'Global variables' : environment!.name;

    const head = h(
      'div',
      { className: 'gc-pane-head' },
      h('h3', { text: title }),
      !isGlobals && environment
        ? button('Rename', { size: 'sm', iconName: 'code', onClick: () => void this.renameEnv(environment) })
        : h('span'),
      !isGlobals && environment
        ? button('Export', { size: 'sm', iconName: 'download', onClick: () => void this.exportEnv(environment) })
        : h('span'),
      button('Add variable', { size: 'sm', variant: 'primary', iconName: 'plus', onClick: () => void this.addVariable() }),
    );

    const varsRoot = h('div', { className: 'gc-env-vars' });

    if (variables.length === 0) {
      varsRoot.appendChild(
        emptyState('plus', 'No variables', 'Add your first variable — reference it in any request as {{key}}.',
          button('Add variable', { variant: 'primary', iconName: 'plus', onClick: () => void this.addVariable() })),
      );
    } else {
      varsRoot.appendChild(
        h('div', { className: 'gc-var-row', style: { fontSize: '11px', textTransform: 'uppercase', color: 'var(--gc-text-dim)' } },
          h('span', { text: '' }),
          h('span', { text: 'Key' }),
          h('span', { text: 'Value' }),
          h('span', { text: '' })),
      );
      for (const variable of variables) {
        varsRoot.appendChild(this.renderVariableRow(variable, isGlobals, environment));
      }
    }

    this.detailRoot.append(
      head,
      h('div', { style: { padding: '0 12px 10px' } },
        h('p', { className: 'gc-muted gc-small', text: 'Reference variables in URLs, headers and bodies as {{variable_name}}.' })),
      varsRoot,
    );
  }

  private renderVariableRow(variable: EnvironmentVariable, isGlobals: boolean, environment: Environment | null): HTMLElement {
    const scopeId = isGlobals ? 'globals' : environment!.id;
    const secret = variable.secret === true;

    const keyInput = h('input', {
      className: 'gc-input mono',
      attrs: { type: 'text', 'aria-label': 'Variable key', spellcheck: 'false' },
      value: variable.key,
    }) as HTMLInputElement;

    const valueInput = h('input', {
      className: `gc-input mono${secret ? '' : ''}`,
      attrs: {
        type: secret ? 'password' : 'text',
        'aria-label': 'Variable value',
        placeholder: secret ? MASK : 'value',
        spellcheck: 'false',
      },
      value: secret ? MASK : variable.value,
    }) as HTMLInputElement;

    const save = async (): Promise<void> => {
      const key = keyInput.value.trim();
      const value = valueInput.value;
      if (!key) {
        state.pushToast('warning', 'Variable key cannot be empty.');
        return;
      }
      if (value === '' && !secret) {
        state.pushToast('warning', 'Variable value cannot be empty.');
        return;
      }
      try {
        await EnvironmentService.upsertVariable(
          scopeId,
          { id: variable.id, key, value: secret && value === '' ? MASK : value, enabled: variable.enabled },
          isGlobals,
        );
        state.pushToast('success', `Saved {{${key}}}.`);
        await this.reload();
      } catch (error) {
        state.pushToast('error', error instanceof Error ? error.message : String(error));
      }
    };

    keyInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') void save(); });
    valueInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') void save(); });
    valueInput.addEventListener('change', () => void save());

    const toggle = h('input', {
      attrs: { type: 'checkbox', 'aria-label': 'Enabled', title: 'Enabled' },
      checked: variable.enabled,
      on: {
        change: async (event) => {
          const enabled = (event.currentTarget as HTMLInputElement).checked;
          try {
            await EnvironmentService.upsertVariable(
              scopeId,
              { id: variable.id, key: variable.key, value: secret ? MASK : variable.value, enabled },
              isGlobals,
            );
            await this.reload();
          } catch (error) {
            state.pushToast('error', error instanceof Error ? error.message : String(error));
          }
        },
      },
    });

    const row = h(
      'div',
      { className: 'gc-var-row' },
      toggle,
      keyInput,
      valueInput,
      h('div', { className: 'gc-row', style: { justifyContent: 'flex-end', gap: '4px' } },
        secret ? h('span', { className: 'gc-chip warning', title: 'Secret value', text: 'secret' }) : h('span'),
        iconButton('save', 'Save variable', () => void save()),
        iconButton('trash', 'Delete variable', () => void this.deleteVariable(variable, isGlobals, scopeId), 'danger')),
    );
    return row;
  }

  // --- actions ----------------------------------------------------------

  private async createEnv(): Promise<void> {
    const name = await promptDialog('New environment', 'Environment name', '', 'Staging');
    if (!name) return;
    try {
      const result = await EnvironmentService.create(name);
      this.scope = { kind: 'environment', id: result.environment.id };
      state.pushToast('success', `Environment "${name}" created.`);
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async renameEnv(environment: Environment): Promise<void> {
    const name = await promptDialog('Rename environment', 'Environment name', environment.name);
    if (!name || name === environment.name) return;
    try {
      await EnvironmentService.rename(environment.id, name);
      state.pushToast('success', 'Environment renamed.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async deleteEnv(environment: Environment): Promise<void> {
    const confirmed = await confirmDialog(
      'Delete environment',
      `Delete "${environment.name}" and its ${environment.variables.length} variable(s)?`,
      'Delete',
      true,
    );
    if (!confirmed) return;
    try {
      await EnvironmentService.delete(environment.id);
      if (this.scope?.kind === 'environment' && this.scope.id === environment.id) this.scope = null;
      state.pushToast('success', 'Environment deleted.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async setActive(environmentId: string): Promise<void> {
    try {
      const result = await EnvironmentService.setActive(environmentId);
      state.activeEnvironmentId = result.activeEnvironmentId;
      state.pushToast('success', 'Active environment updated.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async addVariable(): Promise<void> {
    if (!this.scope) return;
    const key = await promptDialog('New variable', 'Variable key', '', 'base_url');
    if (!key) return;
    const value = await promptDialog('New variable', 'Value for {{' + key + '}}', '', 'https://api.example.com');
    if (value === null) return;

    const isGlobals = this.scope.kind === 'globals';
    const scopeId = isGlobals ? 'globals' : (this.scope as { id: string }).id;
    try {
      await EnvironmentService.upsertVariable(scopeId, { key, value, enabled: true }, isGlobals);
      state.pushToast('success', `Added {{${key}}}.`);
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async deleteVariable(variable: EnvironmentVariable, isGlobals: boolean, scopeId: string): Promise<void> {
    const confirmed = await confirmDialog(
      'Delete variable',
      `Remove {{${variable.key}}}? Requests referencing it will report an unresolved variable.`,
      'Delete',
      true,
    );
    if (!confirmed) return;
    try {
      await EnvironmentService.deleteVariable(scopeId, variable.id, isGlobals);
      state.pushToast('success', 'Variable deleted.');
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async importEnv(): Promise<void> {
    const content = await promptDialog(
      'Import environment',
      'Paste environment JSON',
      '',
      '{ "environment": { "name": "Staging", "variables": [...] } }',
    );
    if (!content) return;
    try {
      const result = await EnvironmentService.import(content);
      state.pushToast(
        'success',
        `Imported ${result.imported} environment(s)${result.warnings.length ? ` (${result.warnings.length} warning(s))` : ''}.`,
      );
      await this.reload();
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async exportEnv(environment: Environment): Promise<void> {
    try {
      const exported = await EnvironmentService.export(environment.id);
      await copyToClipboard(exported.content);
      state.pushToast('success', `"${environment.name}" JSON copied to clipboard (${exported.fileName}).`);
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }

  private async reload(): Promise<void> {
    try {
      const result = await EnvironmentService.list();
      state.setEnvironments(result.environments, result.activeEnvironmentId);
      state.globals = result.globals.variables;
    } catch (error) {
      state.pushToast('error', error instanceof Error ? error.message : String(error));
    }
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may be unavailable in restricted webview contexts; fall back
    // to a temporary textarea selection.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

export const environmentsPage = new EnvironmentsPage();
