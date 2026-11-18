/**
 * GreedconTreeProvider — shared base for the sidebar tree views.
 * Handles placeholder rendering, focus/refresh events and node lifecycle.
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';

export interface TreeItemDescriptor {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  collapsibleState: vscode.TreeItemCollapsibleState;
  contextValue?: string;
  icon?: vscode.ThemeIcon;
  command?: vscode.Command;
  children?: TreeItemDescriptor[];
}

export abstract class GreedconTreeProvider<T extends TreeItemDescriptor = TreeItemDescriptor>
  implements vscode.TreeDataProvider<T>
{
  protected readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this.emitter.event;
  protected disposables: vscode.Disposable[] = [];

  constructor(protected readonly services: GreedconServices) {
    const command = vscode.commands.registerCommand(`greedcon.refresh.${this.treeId()}`, () =>
      this.refresh(),
    );
    this.disposables.push(command);
    services.context.subscriptions.push(command);
  }

  abstract treeId(): string;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: T): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;
    if (element.description !== undefined) item.description = element.description;
    if (element.tooltip !== undefined) item.tooltip = element.tooltip;
    if (element.contextValue !== undefined) item.contextValue = element.contextValue;
    if (element.icon !== undefined) item.iconPath = element.icon;
    if (element.command !== undefined) item.command = element.command;
    return item;
  }

  abstract getChildren(element?: T): Promise<T[]>;

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.emitter.dispose();
  }
}
