/**
 * runTests — execute tests for the draft request or a chosen collection.
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';
import type { HttpRequestModel } from '../types/Request';
import type { Collection } from '../types/Collection';

export async function runTests(services: GreedconServices): Promise<void> {
  const settings = await services.storage.settings.get();
  const draft = settings.draft;

  if (draft && Array.isArray(draft.tests) && draft.tests.length > 0) {
    await runRequestTests(services, draft);
    return;
  }

  // Offer a collection run when the draft has no tests.
  const collections = await services.collections.list();
  const withTests = collections.filter((collection) => collectionHasTests(collection));
  if (withTests.length > 0) {
    const picked = await vscode.window.showQuickPick(
      withTests.map((c) => ({ label: c.name, id: c.id })),
      { placeHolder: 'Run tests for a collection' },
    );
    if (!picked) return;
    const response = await services.router.handle({
      id: `cmd_${Date.now().toString(36)}`,
      type: 'tests.runCollection',
      data: { collectionId: picked.id },
    });
    void response;
    void vscode.window.showInformationMessage('Greedcon: collection test run finished.');
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    'Greedcon: no tests are defined yet. Open the Tests tab of a request to add assertions.',
    'Open Tests',
  );
  if (choice === 'Open Tests') {
    await vscode.commands.executeCommand('greedcon.open');
    services.broadcast('page.changed', { page: 'tests' });
  }
}

async function runRequestTests(services: GreedconServices, request: HttpRequestModel): Promise<void> {
  const response = await services.router.handle({
    id: `cmd_${Date.now().toString(36)}`,
    type: 'tests.run',
    data: { requestId: request.id, request },
  });
  void response;
  services.broadcast('page.changed', { page: 'tests' });
}

function collectionHasTests(collection: Collection): boolean {
  const walk = (items: Collection['items']): boolean => {
    for (const item of items) {
      if (item.type === 'request') {
        if (Array.isArray(item.request.tests) && item.request.tests.length > 0) return true;
      } else if (walk(item.items)) {
        return true;
      }
    }
    return false;
  };
  return walk(collection.items);
}
