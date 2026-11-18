/**
 * saveRequest — quick-pick flow to save the current draft into a collection.
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';

export async function saveRequest(services: GreedconServices): Promise<void> {
  const settings = await services.storage.settings.get();
  const draft = settings.draft;
  if (!draft) {
    void vscode.window.showInformationMessage('Greedcon: there is no request to save yet.');
    return;
  }

  const collections = await services.collections.list();
  if (collections.length === 0) {
    const create = await vscode.window.showInformationMessage(
      'Greedcon: you need a collection first.',
      'Create collection',
    );
    if (create === 'Create collection') {
      const name = await vscode.window.showInputBox({ prompt: 'Collection name' });
      if (name) await services.collections.create(name);
    }
    return;
  }

  const picked = await vscode.window.showQuickPick(
    collections.map((c) => ({ label: c.name, id: c.id })),
    { placeHolder: 'Save request into collection…' },
  );
  if (!picked) return;

  try {
    const prepared = await services.auth.prepareForStorage(draft.authentication);
    const result = await services.collections.saveRequest(
      picked.id,
      '',
      { ...draft, authentication: prepared },
    );
    services.broadcast('collections.changed', {
      collections: await services.collections.summaries(),
    });
    void vscode.window.showInformationMessage(
      `Greedcon: saved "${result.collection.items[result.collection.items.length - 1]?.name ?? draft.name}".`,
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Greedcon: save failed — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
