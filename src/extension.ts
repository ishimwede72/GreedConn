/**
 * GREEDCON extension entry point: activation, service wiring, providers,
 * commands and tree views.
 */
import * as vscode from 'vscode';
import { createServices, getTransportAttacher } from './services/GreedconServices';
import { GreedconViewProvider } from './providers/GreedconViewProvider';
import { CollectionsTreeProvider } from './providers/CollectionsTreeProvider';
import { EnvironmentsTreeProvider } from './providers/EnvironmentsTreeProvider';
import { HistoryTreeProvider } from './providers/HistoryTreeProvider';
import { registerCommands } from './commands';
import { logger, LogLevel } from './utils/Logger';
import { EXTENSION_ID, OUTPUT_CHANNEL_NAME } from './constants';
import { applyConfiguration } from './configuration';

let outputChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const startedAt = Date.now();
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  logger.setSink({
    write: (level, message) => outputChannel?.appendLine(`[${level}] ${message}`),
  });
  logger.setLevel(readLogLevel());
  applyConfiguration();

  const services = createServices({
    context,
    onNotice: (message) => {
      outputChannel?.appendLine(`[notice] ${message}`);
      void vscode.window.showWarningMessage(message, 'Open output').then((choice) => {
        if (choice === 'Open output') outputChannel?.show(true);
      });
    },
  });
  const syncHistoryConfiguration = (): void => {
    const historyConfig = vscode.workspace.getConfiguration('greedcon');
    services.history.configure({
      enabled: historyConfig.get<boolean>('history.enabled', true),
      limit: historyConfig.get<number>('history.limit', 200),
      storeResponseBody: historyConfig.get<boolean>('history.storeResponseBody', true),
    });
  };

  try {
    await services.storage.initialize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('storage initialization failed', message);
    void vscode.window.showErrorMessage(`Greedcon: storage initialization failed — ${message}`);
  }

  for (const notice of services.storage.takeNotices()) {
    outputChannel.appendLine(`[notice] ${notice}`);
  }

  // Webview view (sidebar)
  const viewProvider = new GreedconViewProvider(services, context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GreedconViewProvider.viewType, viewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Tree views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'greedcon.views.collections',
      new CollectionsTreeProvider(services),
    ),
    vscode.window.registerTreeDataProvider(
      'greedcon.views.environments',
      new EnvironmentsTreeProvider(services),
    ),
    vscode.window.registerTreeDataProvider(
      'greedcon.views.history',
      new HistoryTreeProvider(services),
    ),
  );

  // Commands
  context.subscriptions.push(...registerCommands({ services, viewProvider }));

  // React to configuration changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('greedcon')) {
        applyConfiguration();
        logger.setLevel(readLogLevel());
        if (event.affectsConfiguration('greedcon.history')) {
          syncHistoryConfiguration();
        }
      }
    }),
  );

  syncHistoryConfiguration();

  logger.info(`${EXTENSION_ID} activated in ${Date.now() - startedAt}ms`);
  outputChannel.appendLine(`Greedcon is ready. Storage: ${services.storage.directory}`);
}

export function deactivate(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}

function readLogLevel(): LogLevel {
  const value = vscode.workspace
    .getConfiguration('greedcon')
    .get<string>('logging.level', 'info');
  const allowed: LogLevel[] = ['error', 'warn', 'info', 'debug', 'off'];
  return allowed.includes(value as LogLevel) ? (value as LogLevel) : 'info';
}

export { getTransportAttacher };
