/**
 * EnvironmentsTreeProvider — environments and their variables in the sidebar.
 */
import * as vscode from 'vscode';
import { GreedconTreeProvider, TreeItemDescriptor } from './GreedconTreeProvider';
import { GreedconServices } from '../services/GreedconServices';
import type { Environment } from '../types/Environment';

export class EnvironmentsTreeProvider extends GreedconTreeProvider {
  private environments: Environment[] = [];
  private activeId = '';

  constructor(services: GreedconServices) {
    super(services);
    void this.refreshData();
    const interval = setInterval(() => void this.refreshData(), 5000);
    this.disposables.push({ dispose: () => clearInterval(interval) });
    const setActiveCmd = vscode.commands.registerCommand(
      'greedcon.tree.setActiveEnvironment',
      (element: TreeItemDescriptor) => {
        void this.setActive(element);
      },
    );
    this.disposables.push(setActiveCmd);
    services.context.subscriptions.push(setActiveCmd);
  }

  treeId(): string {
    return 'environments';
  }

  private async refreshData(): Promise<void> {
    const [environments, activeId] = await Promise.all([
      this.services.environments.listMasked(),
      this.services.environments.getActiveId(),
    ]);
    const changed =
      JSON.stringify(environments.map((e) => [e.id, e.name, e.variables.length])) !==
        JSON.stringify(this.environments.map((e) => [e.id, e.name, e.variables.length])) ||
      activeId !== this.activeId;
    this.environments = environments;
    this.activeId = activeId;
    if (changed) this.refresh();
  }

  async getChildren(element?: TreeItemDescriptor): Promise<TreeItemDescriptor[]> {
    if (!element) {
      await this.refreshData();
      if (this.environments.length === 0) {
        return [
          {
            id: 'env-empty',
            label: 'No environments',
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            icon: new vscode.ThemeIcon('info'),
          },
        ];
      }
      return this.environments.map((environment) => ({
        id: `env:${environment.id}`,
        label: environment.name,
        description: environment.id === this.activeId ? 'active' : `${environment.variables.length} vars`,
        tooltip: environment.description || environment.name,
        collapsibleState:
          environment.variables.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        contextValue: 'environment',
        icon: new vscode.ThemeIcon(environment.id === this.activeId ? 'eye' : 'eye-closed'),
        command: {
          command: 'greedcon.tree.setActiveEnvironment',
          title: 'Set Active Environment',
          arguments: [{ id: `env:${environment.id}`, label: environment.name }],
        },
      }));
    }

    if (!element.id.startsWith('env:')) return [];
    const environmentId = element.id.slice(4);
    const environment = this.environments.find((e) => e.id === environmentId);
    if (!environment) return [];
    return environment.variables.map((variable) => ({
      id: `var:${variable.id}`,
      label: variable.key,
      description: variable.secret ? '••••••••' : truncate(variable.value, 32),
      tooltip: variable.description || variable.key,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'variable',
      icon: new vscode.ThemeIcon(variable.secret ? 'lock' : 'symbol-variable'),
    }));
  }

  private async setActive(element: TreeItemDescriptor): Promise<void> {
    const environmentId = element.id.startsWith('env:') ? element.id.slice(4) : '';
    if (!environmentId) return;
    await this.services.environments.setActive(environmentId);
    await this.services.storage.settings.update({ activeEnvironmentId: environmentId });
    this.services.broadcast('environments.changed', {
      environments: await this.services.environments.listMasked(),
      activeId: environmentId,
    });
    this.refresh();
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
