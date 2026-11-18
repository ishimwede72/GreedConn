/**
 * GreedconPanelProvider — Greedcon in an editor tab.
 * Multiple panels are supported; each gets its own webview instance.
 */
import * as vscode from 'vscode';
import { configureWebview } from './WebviewHost';
import { GreedconServices } from '../services/GreedconServices';
import type { PageId } from '../types/Messages';

export class GreedconPanelProvider {
  private static panels: GreedconPanelProvider[] = [];

  private readonly disposables: vscode.Disposable[] = [];
  private panel: vscode.WebviewPanel | undefined;

  private constructor(
    private readonly services: GreedconServices,
    private readonly extensionUri: vscode.Uri,
  ) {}

  static create(services: GreedconServices, extensionUri: vscode.Uri): GreedconPanelProvider {
    const provider = new GreedconPanelProvider(services, extensionUri);
    provider.panel = vscode.window.createWebviewPanel(
      'greedcon.panel',
      'Greedcon',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      },
    );
    provider.panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'greedcon-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'greedcon-dark.svg'),
    };

    provider.disposables.push(
      configureWebview({
        services,
        extensionUri,
        webview: provider.panel.webview,
      }),
    );

    provider.panel.onDidDispose(() => {
      for (const disposable of provider.disposables.splice(0)) disposable.dispose();
      const index = GreedconPanelProvider.panels.indexOf(provider);
      if (index >= 0) GreedconPanelProvider.panels.splice(index, 1);
    });

    GreedconPanelProvider.panels.push(provider);
    return provider;
  }

  /** Focus an existing panel instead of opening another one. */
  static revealExisting(): boolean {
    const existing = GreedconPanelProvider.panels[0];
    if (existing?.panel) {
      existing.panel.reveal(existing.panel.viewColumn ?? vscode.ViewColumn.Active);
      return true;
    }
    return false;
  }

  navigate(page: PageId): void {
    this.services.broadcast('page.changed', { page });
  }

  static broadcastAll(services: GreedconServices, page: PageId): void {
    services.broadcast('page.changed', { page });
  }
}
