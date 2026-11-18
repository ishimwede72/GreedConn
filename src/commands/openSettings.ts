/**
 * openSettings — open VS Code settings filtered to Greedcon.
 */
import * as vscode from 'vscode';

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:greedcon.greedcon');
}
