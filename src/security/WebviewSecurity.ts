/**
 * Webview security helpers: CSP generation with per-load nonces and
 * message origin checks.
 */
import * as vscode from 'vscode';

export interface WebviewSecurityConfig {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  nonce: string;
  cspSource: string;
  /** Stylesheets to link (relative to extension root). */
  styles: string[];
  /** Scripts to include (relative to extension root). */
  scripts: string[];
}

/**
 * Strict CSP for GREEDCON webviews:
 *  - no remote resources at all
 *  - scripts only via nonce (bundled, never `eval`)
 *  - styles from the webview's own resource source
 *  - frames: sandboxed preview uses `srcdoc` with its own sandbox flags
 */
export function buildCsp(nonce: string, cspSource: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${cspSource}`,
    `connect-src ${cspSource}`,
    "frame-src 'self' data:",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

interface RandomSource {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

export function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(32);
  const cryptoRef = (globalThis as { crypto?: RandomSource }).crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    cryptoRef.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let result = '';
  for (const byte of bytes) result += chars[byte % chars.length];
  return result;
}

export function buildWebviewHtml(config: WebviewSecurityConfig): string {
  const { webview, extensionUri, nonce, cspSource, styles, scripts } = config;
  const links = styles
    .map((style) => {
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, style));
      return `<link rel="stylesheet" href="${uri}">`;
    })
    .join('\n    ');
  const scriptTags = scripts
    .map((script) => {
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, script));
      return `<script nonce="${nonce}" src="${uri}"></script>`;
    })
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${buildCsp(nonce, cspSource)}">
  <title>Greedcon</title>
  ${links}
</head>
<body>
  <div id="app" data-nonce="${nonce}"></div>
  ${scriptTags}
</body>
</html>`;
}

/**
 * Guard for messages received from the webview. VS Code delivers messages
 * only from our own webview, but we still enforce shape validation in
 * MessageValidator; this helper rejects non-object payloads early.
 */
export function isWebviewMessage(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}
