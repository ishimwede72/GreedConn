/**
 * HistoryTreeProvider — recent request history in the sidebar.
 * Selecting an entry re-runs it.
 */
import * as vscode from 'vscode';
import { GreedconTreeProvider, TreeItemDescriptor } from './GreedconTreeProvider';
import { GreedconServices } from '../services/GreedconServices';
import type { HistoryEntry } from '../types/History';

export class HistoryTreeProvider extends GreedconTreeProvider {
  private entries: HistoryEntry[] = [];

  constructor(services: GreedconServices) {
    super(services);
    void this.refreshData();
    const interval = setInterval(() => void this.refreshData(), 5000);
    this.disposables.push({ dispose: () => clearInterval(interval) });
    const rerunCmd = vscode.commands.registerCommand(
      'greedcon.tree.rerunHistory',
      (element: TreeItemDescriptor) => {
        void this.rerun(element);
      },
    );
    this.disposables.push(rerunCmd);
    services.context.subscriptions.push(rerunCmd);
  }

  treeId(): string {
    return 'history';
  }

  private async refreshData(): Promise<void> {
    const entries = await this.services.history.search({ limit: 100 });
    if (JSON.stringify(entries.map((e) => [e.id, e.status, e.timestamp])) !==
        JSON.stringify(this.entries.map((e) => [e.id, e.status, e.timestamp]))) {
      this.entries = entries;
      this.refresh();
    } else {
      this.entries = entries;
    }
  }

  async getChildren(element?: TreeItemDescriptor): Promise<TreeItemDescriptor[]> {
    if (element) return [];
    await this.refreshData();
    if (this.entries.length === 0) {
      return [
        {
          id: 'history-empty',
          label: 'No requests yet',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          icon: new vscode.ThemeIcon('info'),
        },
      ];
    }
    return this.entries.slice(0, 50).map((entry) => ({
      id: `h:${entry.id}`,
      label: `${entry.method} ${entry.name}`,
      description: entry.error ? 'error' : String(entry.status ?? ''),
      tooltip: `${entry.url}\n${entry.timestamp}`,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'historyEntry',
      icon: new vscode.ThemeIcon(
        entry.error || (entry.status ?? 0) >= 400 ? 'error' : (entry.status ?? 0) > 0 ? 'check' : 'circle-slash',
      ),
      command: {
        command: 'greedcon.tree.rerunHistory',
        title: 'Re-run Request',
        arguments: [{ id: `h:${entry.id}`, label: entry.name }],
      },
    }));
  }

  private async rerun(element: TreeItemDescriptor): Promise<void> {
    const entryId = element.id.startsWith('h:') ? element.id.slice(2) : '';
    if (!entryId) return;
    const entry = await this.services.history.get(entryId);
    if (!entry) return;
    await vscode.commands.executeCommand('greedcon.open');
    await this.services.storage.settings.update({
      draft: {
        id: `req_${Date.now().toString(36)}`,
        name: entry.name,
        method: entry.method,
        url: entry.url,
        params: [],
        headers: [],
        body: { type: 'none' },
        authentication: { type: 'none' },
        timeout: 30000,
        settings: { followRedirects: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    this.services.broadcast('page.changed', { page: 'requests' });
  }
}
