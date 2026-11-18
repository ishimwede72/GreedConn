/**
 * exportCollection — quick-pick + save-dialog based export.
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';

export async function exportCollection(services: GreedconServices): Promise<void> {
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
      saveLabel: 'Export collection',
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(exported.content, 'utf8'));
    void vscode.window.showInformationMessage(`Greedcon: exported to ${uri.fsPath}`);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Greedcon: export failed — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
