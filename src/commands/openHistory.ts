/**
 * openHistory — reveal the Greedcon history page.
 */
import * as vscode from 'vscode';
import { GreedconViewProvider } from '../providers/GreedconViewProvider';
import type { GreedconServices } from '../services/GreedconServices';

export async function openHistory(services: GreedconServices): Promise<void> {
  await vscode.commands.executeCommand(`${GreedconViewProvider.viewType}.focus`);
  services.broadcast('page.changed', { page: 'history' });
}
