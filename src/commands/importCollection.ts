/**
 * importCollection — file-dialog based collection import.
 */
import * as vscode from 'vscode';
import { GreedconServices } from '../services/GreedconServices';

export async function importCollection(services: GreedconServices): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Import',
    filters: { 'Collection files': ['json'] },
  });
  if (!uris || uris.length === 0) return;

  try {
    const bytes = await vscode.workspace.fs.readFile(uris[0]);
    const content = Buffer.from(bytes).toString('utf8');
    const fileName = uris[0].path.split('/').pop() ?? 'collection.json';
    const format = fileName.includes('postman') ? 'postman-v2.1' : undefined;

    const result = await services.collections.importCollection(content, format);
    services.broadcast('collections.changed', {
      collections: await services.collections.summaries(),
    });
    services.broadcast('page.changed', { page: 'collections' });

    const warningSuffix =
      result.warnings.length > 0 ? ` (${result.warnings.length} warning(s) — see logs)` : '';
    void vscode.window.showInformationMessage(
      `Greedcon: imported "${result.collection.name}" via ${result.format}${warningSuffix}.`,
    );
    for (const warning of result.warnings) logger2(warning);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Greedcon: import failed — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function logger2(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[greedcon:import] ${message}`);
}
