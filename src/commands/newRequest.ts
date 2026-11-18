/**
 * newRequest — create a fresh draft request and open the builder.
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';
import { createEmptyRequest } from '../types/Request';
import { generateId } from '../utils/IdGenerator';

export async function newRequest(services: GreedconServices): Promise<void> {
  await services.storage.settings.update({ draft: createEmptyRequest(generateId('req')) });
  await vscode.commands.executeCommand(`${'greedcon.views.main'}.focus`);
  services.broadcast('page.changed', { page: 'requests' });
}
