/**
 * Commands — one module per VS Code command (see package.json contributes).
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';
import { GreedconViewProvider } from '../providers/GreedconViewProvider';
import { GreedconPanelProvider } from '../providers/GreedconPanelProvider';
import type { PageId } from '../types/Messages';
import { createEmptyRequest } from '../types/Request';
import { generateId } from '../utils/IdGenerator';
import { logger } from '../utils/Logger';

export interface CommandContext {
  services: GreedconServices;
  viewProvider: GreedconViewProvider;
}

async function openPage(context: CommandContext, page: PageId): Promise<void> {
  const { viewProvider, services } = context;
  if (viewProvider.isVisible()) {
    viewProvider.reveal();
  } else {
    await vscode.commands.executeCommand(`${GreedconViewProvider.viewType}.focus`);
  }
  services.broadcast('page.changed', { page });
  await services.storage.settings.update({ lastPage: page });
}

export function registerCommands(context: CommandContext): vscode.Disposable[] {
  const { services } = context;
  const disposables: vscode.Disposable[] = [];

  const register = (command: string, handler: (...args: never[]) => unknown): void => {
    disposables.push(
      vscode.commands.registerCommand(command, (...args: never[]) => {
        void Promise.resolve(handler(...args)).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`command ${command} failed: ${message}`);
          void vscode.window.showErrorMessage(`Greedcon: ${message}`);
        });
      }),
    );
  };

  register('greedcon.open', () => openPage(context, 'welcome'));

  register('greedcon.newRequest', async () => {
    const draft = createEmptyRequest(generateId('req'));
    await services.storage.settings.update({ draft });
    await openPage(context, 'requests');
  });

  register('greedcon.openPanel', async () => {
    if (!GreedconPanelProvider.revealExisting()) {
      GreedconPanelProvider.create(services, services.context.extensionUri);
    }
    services.broadcast('page.changed', { page: 'requests' });
  });

  register('greedcon.saveRequest', async () => {
    await openPage(context, 'collections');
    services.broadcast('toast', {
      level: 'info',
      message: 'Choose a collection, then use "Save" in the request builder.',
    });
  });

  register('greedcon.importCollection', async () => {
    await openPage(context, 'collections');
    services.broadcast('toast', { level: 'info', message: 'Use the Import button in Collections.' });
  });

  register('greedcon.exportCollection', async () => {
    const collections = await services.collections.list();
    if (collections.length === 0) {
      void vscode.window.showInformationMessage('Greedcon: no collections to export.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      collections.map((c) => ({ label: c.name, id: c.id })),
      { placeHolder: 'Select a collection to export' },
    );
    if (!picked) return;
    try {
      const exported = await services.collections.exportCollection(picked.id);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(exported.fileName),
        filters: { 'Greedcon collection': ['json'] },
        saveLabel: 'Export',
      });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(exported.content, 'utf8'));
      void vscode.window.showInformationMessage(`Greedcon: exported to ${uri.fsPath}`);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Greedcon: export failed — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  register('greedcon.openHistory', () => openPage(context, 'history'));

  register('greedcon.runTests', () => openPage(context, 'tests'));

  register('greedcon.openSettings', () => openPage(context, 'settings'));

  register('greedcon.clearHistory', async () => {
    const choice = await vscode.window.showWarningMessage(
      'Clear all Greedcon request history?',
      { modal: true },
      'Clear',
    );
    if (choice !== 'Clear') return;
    const removed = await services.history.clear();
    services.broadcast('history.changed', { count: 0 });
    void vscode.window.showInformationMessage(`Greedcon: cleared ${removed} history entries.`);
  });

  return disposables;
}
