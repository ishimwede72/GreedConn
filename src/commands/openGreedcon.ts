/**
 * openGreedcon — focus/reveal the Greedcon view.
 */
import * as vscode from 'vscode';
import { GreedconViewProvider } from '../providers/GreedconViewProvider';

export async function openGreedcon(): Promise<void> {
  await vscode.commands.executeCommand(`${GreedconViewProvider.viewType}.focus`);
}
