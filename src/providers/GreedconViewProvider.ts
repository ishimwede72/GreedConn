/**
 * GreedconViewProvider — the activity-bar webview view (sidebar).
 */
import * as vscode from 'vscode';
import { configureWebview } from './WebviewHost';
import { GreedconServices } from '../services/GreedconServices';
import type { PageId } from '../types/Messages';

export class GreedconViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'greedcon.views.main';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly services: GreedconServices,
    private readonly extensionUri: vscode.Uri,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };

    this.disposables.push(
      configureWebview({
        services: this.services,
        extensionUri: this.extensionUri,
        webview: webviewView.webview,
      }),
    );

    webviewView.onDidDispose(() => {
      for (const disposable of this.disposables.splice(0)) disposable.dispose();
      this.view = undefined;
    });
  }

  reveal(): void {
    void vscode.commands.executeCommand(`${GreedconViewProvider.viewType}.focus`);
  }

  isVisible(): boolean {
    return this.view?.visible === true;
  }

  /** Ask the webview to switch pages (no-op when the view is not resolved). */
  navigate(page: PageId): void {
    if (!this.view) return;
    this.services.broadcast('page.changed', { page });
  }

  /** Post an arbitrary event (used by tree views to open specific records). */
  postEvent(name: 'page.changed', data: { page: PageId }): void {
    this.services.broadcast(name, data);
  }
}
