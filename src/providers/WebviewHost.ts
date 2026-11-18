/**
 * Shared webview bootstrap: options, HTML, message wiring and CSP.
 */
import * as vscode from 'vscode';
import { buildWebviewHtml, generateNonce } from '../security/WebviewSecurity';
import { getTransportAttacher, GreedconServices } from '../services/GreedconServices';
import { logger } from '../utils/Logger';

export interface WebviewHostOptions {
  services: GreedconServices;
  extensionUri: vscode.Uri;
  webview: vscode.Webview;
}

export function configureWebview(options: WebviewHostOptions): vscode.Disposable {
  const { services, extensionUri, webview } = options;

  webview.options = {
    enableScripts: true,
    localResourceRoots: [extensionUri],
  };

  const nonce = generateNonce();
  webview.html = buildWebviewHtml({
    webview,
    extensionUri,
    nonce,
    cspSource: webview.cspSource,
    styles: ['media/webview.css'],
    scripts: ['media/webview.js'],
  });

  const detach = getTransportAttacher(services)((message) => {
    void webview.postMessage(message);
  });

  const messageSubscription = webview.onDidReceiveMessage((message) => {
    void services.router.handle(message);
  });

  logger.debug('webview configured');
  return vscode.Disposable.from(messageSubscription, { dispose: () => detach() });
}
