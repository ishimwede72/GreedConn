/**
 * Shared service container wired up in extension.ts and passed to providers,
 * commands and the message layer.
 */
import type * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { CollectionManager } from '../collections/CollectionManager';
import { EnvironmentManager } from '../environments/EnvironmentManager';
import { HistoryManager } from '../history/HistoryManager';
import { TestRunner } from '../testing/TestRunner';
import { RequestExecutor } from '../engine/RequestExecutor';
import { HttpClient } from '../engine/HttpClient';
import { CancellationManager } from '../engine/CancellationManager';
import { AuthenticationManager } from '../authentication/AuthenticationManager';
import { CredentialStore } from '../authentication/CredentialStore';
import { OAuth2Manager } from '../authentication/OAuth2Auth';
import { SecretManager } from '../security/SecretManager';
import { SecurityManager } from '../security/SecurityManager';
import { MessageRouter } from '../messaging/MessageRouter';
import { MessageHandlers } from '../messaging/MessageHandlers';
import type { AnyWebviewMessage, WebviewEventMap, WebviewEventName } from '../types/Messages';

export interface GreedconServices {
  context: vscode.ExtensionContext;
  storage: StorageManager;
  collections: CollectionManager;
  environments: EnvironmentManager;
  history: HistoryManager;
  testRunner: TestRunner;
  executor: RequestExecutor;
  cancellation: CancellationManager;
  auth: AuthenticationManager;
  credentials: CredentialStore;
  oauth2: OAuth2Manager;
  secrets: SecretManager;
  security: SecurityManager;
  router: MessageRouter;
  version: string;
  /** Broadcast an event to every connected webview. */
  broadcast: <N extends WebviewEventName>(name: N, data: WebviewEventMap[N]) => void;
}

export interface CreateServicesOptions {
  context: vscode.ExtensionContext;
  /** Called for storage corruption/migration notices. */
  onNotice?: (message: string) => void;
}

export function createServices(options: CreateServicesOptions): GreedconServices {
  const { context } = options;

  const storage = new StorageManager({
    context,
    ...(options.onNotice ? { onNotice: options.onNotice } : {}),
  });

  const secrets = new SecretManager(context.secrets);
  const credentials = new CredentialStore(secrets);
  const oauth2 = new OAuth2Manager(credentials);
  const auth = new AuthenticationManager(credentials, oauth2);
  const security = new SecurityManager();

  const collections = new CollectionManager(storage.collections);
  const environments = new EnvironmentManager(storage.environments);
  const history = new HistoryManager(storage.history);
  const cancellation = new CancellationManager();
  const executor = new RequestExecutor(
    new HttpClient(),
    cancellation,
    auth,
    environments,
    security,
  );
  const testRunner = new TestRunner();

  // The router is created with a mutable transport so webviews can attach.
  const transports = new Set<(message: AnyWebviewMessage) => void>();
  const router = new MessageRouter({
    post: (message) => {
      for (const transport of transports) {
        try {
          transport(message);
        } catch (error) {
          console.error('[greedcon] failed to post message to webview', error);
        }
      }
    },
  });

  const version = String(context.extension.packageJSON.version ?? '0.0.0');

  const services: GreedconServices = {
    context,
    storage,
    collections,
    environments,
    history,
    testRunner,
    executor,
    cancellation,
    auth,
    credentials,
    oauth2,
    secrets,
    security,
    router,
    version,
    broadcast: (name, data) => router.emit(name, data),
  };

  const handlers = new MessageHandlers({
    collections,
    environments,
    history,
    settings: storage.settings,
    testRuns: storage.testRuns,
    executor,
    cancellation,
    testRunner,
    auth,
    credentials,
    oauth2,
    security,
    emit: (name, data) => router.emit(name, data),
    version,
  });
  handlers.register(router);

  // Attach/detach webview transports.
  (services as GreedconServices & { attachTransport: (fn: (m: AnyWebviewMessage) => void) => () => void }).attachTransport =
    (fn) => {
      transports.add(fn);
      return () => transports.delete(fn);
    };

  return services;
}

export type TransportAttacher = (
  fn: (message: AnyWebviewMessage) => void,
) => () => void;

export function getTransportAttacher(services: GreedconServices): TransportAttacher {
  return (services as GreedconServices & { attachTransport?: TransportAttacher }).attachTransport ?? (() => () => undefined);
}
