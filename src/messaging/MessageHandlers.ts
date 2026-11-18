/**
 * MessageHandlers — the application service layer behind the message router.
 *
 * Every handler:
 *  - receives a validated payload
 *  - performs the operation against domain services
 *  - returns plain serializable data (never secrets)
 */
import * as vscode from 'vscode';
import type {
  AppInitData,
  CollectionsListData,
  HistoryListData,
  PageId,
  TestHistoryData,
  WebviewEventMap,
  WebviewEventName,
} from '../types/Messages';
import type { HttpRequestModel, KeyValueRow, OAuth2Auth } from '../types/Request';
import type { Collection, CollectionItem } from '../types/Collection';
import type { TestDefinition, TestRunResult } from '../types/Testing';
import type { SettingsState } from '../types/Storage';
import { MessageRouter } from './MessageRouter';
import { CollectionManager } from '../collections/CollectionManager';
import { EnvironmentManager } from '../environments/EnvironmentManager';
import { HistoryManager } from '../history/HistoryManager';
import { SettingsStorage } from '../storage/repositories/SettingsStorage';
import { TestRunsRepository } from '../storage/repositories/TestRunsStorage';
import { RequestExecutor } from '../engine/RequestExecutor';
import { CancellationManager } from '../engine/CancellationManager';
import { TestRunner } from '../testing/TestRunner';
import { parseTests } from '../testing/TestParser';
import { renderRun } from '../testing/TestReporter';
import { AuthenticationManager } from '../authentication/AuthenticationManager';
import { CredentialStore } from '../authentication/CredentialStore';
import { OAuth2Manager } from '../authentication/OAuth2Auth';
import { SecurityManager } from '../security/SecurityManager';
import { createEmptyRequest, isHttpMethod } from '../types/Request';
import { generateId } from '../utils/IdGenerator';
import { logger, redactUrl } from '../utils/Logger';
import { redactHeadersForDisplay, redactQuerySecrets } from '../security/RedactionManager';
import { parseJson, formatJson } from '../utils/JsonUtils';
import { validateVariable } from '../environments/VariableMasker';

export interface HandlerServices {
  collections: CollectionManager;
  environments: EnvironmentManager;
  history: HistoryManager;
  settings: SettingsStorage;
  testRuns: TestRunsRepository;
  executor: RequestExecutor;
  cancellation: CancellationManager;
  testRunner: TestRunner;
  auth: AuthenticationManager;
  credentials: CredentialStore;
  oauth2: OAuth2Manager;
  security: SecurityManager;
  emit: <N extends WebviewEventName>(name: N, data: WebviewEventMap[N]) => void;
  version: string;
}

export class MessageHandlers {
  constructor(private readonly services: HandlerServices) {}

  register(router: MessageRouter): void {
    const r = router;
    const s = this.services;

    // --- app ------------------------------------------------------------
    r.register('app.init', () => this.buildInitData());
    r.register('app.navigate', async (payload: { page: PageId }) => {
      await s.settings.update({ lastPage: payload.page });
      return { page: payload.page };
    });
    r.register('app.getState', () => this.buildInitData());
    r.register('app.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'greedcon');
      return { opened: true };
    });
    r.register('app.openExternal', async (payload: { url: string }) => {
      const result = await this.openExternal(payload.url);
      return { opened: result };
    });
    r.register('app.saveDraft', async (payload: { request: HttpRequestModel }) => {
      await this.persistDraft(payload.request);
      return { saved: true };
    });

    // --- request --------------------------------------------------------
    r.register('request.send', (payload: { request: HttpRequestModel; environmentId?: string }) =>
      this.sendRequest(payload.request, payload.environmentId),
    );
    r.register('request.cancel', () => {
      const cancelled = s.cancellation.cancelAll();
      s.emit('request.cancelled', { requestId: '' });
      return { cancelled };
    });
    r.register('request.formatJson', (payload: { text: string }) => {
      try {
        return { text: formatJson(payload.text, 2), ok: true };
      } catch (error) {
        return {
          text: payload.text,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    r.register('request.validateJson', (payload: { text: string }) => {
      const parsed = parseJson(payload.text);
      return { ok: parsed.ok, ...(parsed.error ? { error: parsed.error } : {}) };
    });

    // --- collections ----------------------------------------------------
    r.register('collections.list', async (): Promise<CollectionsListData> => ({
      collections: await Promise.all(
        (await s.collections.list()).map((collection) =>
          this.prepareCollectionForStorage(collection),
        ),
      ),
    }));
    r.register('collections.get', async (payload: { collectionId: string }) => {
      const collection = await s.collections.get(payload.collectionId);
      return { collection: collection ? await this.prepareCollectionForStorage(collection) : null };
    });
    r.register('collections.create', async (payload: { name: string; description?: string }) => {
      const collection = await s.collections.create(payload.name, payload.description);
      this.notifyCollections();
      return { collection: await this.prepareCollectionForStorage(collection) };
    });
    r.register(
      'collections.rename',
      async (payload: { collectionId: string; name: string; description?: string }) => {
        const collection = await s.collections.rename(
          payload.collectionId,
          payload.name,
          payload.description,
        );
        this.notifyCollections();
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register('collections.delete', async (payload: { collectionId: string }) => {
      await s.collections.delete(payload.collectionId);
      this.notifyCollections();
      return { deleted: true };
    });
    r.register('collections.duplicate', async (payload: { collectionId: string }) => {
      const collection = await s.collections.duplicate(payload.collectionId);
      this.notifyCollections();
      return { collection: await this.prepareCollectionForStorage(collection) };
    });
    r.register(
      'collections.folder.create',
      async (payload: { collectionId: string; folderId: string; name: string }) => {
        const collection = await s.collections.createFolder(
          payload.collectionId,
          payload.folderId,
          payload.name,
        );
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.folder.rename',
      async (payload: { collectionId: string; folderId: string; name: string }) => {
        const collection = await s.collections.renameFolder(
          payload.collectionId,
          payload.folderId,
          payload.name,
        );
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.folder.delete',
      async (payload: { collectionId: string; folderId: string }) => {
        const collection = await s.collections.deleteFolder(payload.collectionId, payload.folderId);
        this.notifyCollections();
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.request.save',
      async (payload: {
        collectionId: string;
        folderId: string;
        request: HttpRequestModel;
        itemId?: string;
      }) => {
        const prepared = await s.auth.prepareForStorage(payload.request.authentication);
        const request = { ...payload.request, authentication: prepared };
        const result = await s.collections.saveRequest(
          payload.collectionId,
          payload.folderId,
          request,
          payload.itemId,
        );
        this.notifyCollections();
        return {
          itemId: result.itemId,
          collection: await this.prepareCollectionForStorage(result.collection),
        };
      },
    );
    r.register(
      'collections.item.delete',
      async (payload: { collectionId: string; itemId: string }) => {
        const collection = await s.collections.deleteItem(payload.collectionId, payload.itemId);
        this.notifyCollections();
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.item.rename',
      async (payload: { collectionId: string; itemId: string; name: string }) => {
        const collection = await s.collections.renameItem(
          payload.collectionId,
          payload.itemId,
          payload.name,
        );
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.item.duplicate',
      async (payload: { collectionId: string; itemId: string }) => {
        const collection = await s.collections.duplicateItem(payload.collectionId, payload.itemId);
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.item.move',
      async (payload: {
        collectionId: string;
        itemId: string;
        targetFolderId: string;
        index?: number;
      }) => {
        const collection = await s.collections.moveItem(
          payload.collectionId,
          payload.itemId,
          payload.targetFolderId,
          payload.index,
        );
        return { collection: await this.prepareCollectionForStorage(collection) };
      },
    );
    r.register(
      'collections.import',
      async (payload: { content: string; format?: string; source: string }) => {
        const result = await s.collections.importCollection(payload.content, payload.format);
        const collection = await this.prepareCollectionForStorage(result.collection);
        this.notifyCollections();
        return {
          collection,
          format: result.format,
          warnings: result.warnings,
          preservedUnknownFields: result.preservedUnknownFields,
        };
      },
    );
    r.register('collections.export', async (payload: { collectionId: string }) => {
      const exported = await s.collections.exportCollection(payload.collectionId);
      return exported;
    });
    r.register('collections.search', async (payload: { query: string }) => {
      const results = await s.collections.search(payload.query);
      return {
        results: results.map((entry) => ({
          collection: { id: entry.collection.id, name: entry.collection.name },
          items: entry.items.map((item) => ({
            id: item.id,
            name: item.name,
            method: item.request.method,
            url: item.request.url,
          })),
        })),
      };
    });
    r.register('collections.pickFile', () => this.pickImportFile());
    r.register(
      'collections.saveFile',
      async (payload: { collectionId: string; defaultName: string; content: string }) => {
        const saved = await this.saveExportFile(payload.defaultName, payload.content);
        return { saved, ...(saved ? { uri: saved } : {}) };
      },
    );

    // --- environments ---------------------------------------------------
    r.register('environments.list', async () => {
      const [environments, globals, activeEnvironmentId] = await Promise.all([
        s.environments.listMasked(),
        s.environments.getGlobals(),
        s.environments.getActiveId(),
      ]);
      return {
        environments,
        globals: { ...globals, variables: globals.variables },
        activeEnvironmentId,
      };
    });
    r.register('environments.create', async (payload: { name: string; description?: string }) => {
      const environment = await s.environments.create(payload.name, payload.description);
      s.emit('environments.changed', {
        environments: await s.environments.listMasked(),
        activeId: await s.environments.getActiveId(),
      });
      return { environment };
    });
    r.register(
      'environments.rename',
      async (payload: { environmentId: string; name: string; description?: string }) => {
        const environment = await s.environments.rename(
          payload.environmentId,
          payload.name,
          payload.description,
        );
        s.emit('environments.changed', {
          environments: await s.environments.listMasked(),
          activeId: await s.environments.getActiveId(),
        });
        return { environment };
      },
    );
    r.register('environments.delete', async (payload: { environmentId: string }) => {
      await s.environments.delete(payload.environmentId);
      s.emit('environments.changed', {
        environments: await s.environments.listMasked(),
        activeId: await s.environments.getActiveId(),
      });
      return { deleted: true };
    });
    r.register('environments.setActive', async (payload: { environmentId: string }) => {
      const activeId = await s.environments.setActive(payload.environmentId);
      await s.settings.update({ activeEnvironmentId: activeId });
      s.emit('environments.changed', {
        environments: await s.environments.listMasked(),
        activeId,
      });
      return { activeEnvironmentId: activeId };
    });
    r.register(
      'environments.variable.upsert',
      async (payload: {
        environmentId: string;
        variable: {
          id?: string;
          key: string;
          value: string;
          enabled?: boolean;
          secret?: boolean;
          description?: string;
        };
        global?: boolean;
      }) => {
        const issue = validateVariable({
          id: payload.variable.id ?? '',
          key: payload.variable.key,
          value: payload.variable.value,
          enabled: payload.variable.enabled ?? true,
        });
        if (issue) throw new Error(issue.message);
        // Never let the display mask overwrite a stored secret: when the UI
        // sends back the masked placeholder, keep the existing value.
        let value = payload.variable.value;
        if (payload.variable.id && value === '••••••••') {
          const targetId = payload.global ? '' : payload.environmentId;
          const existing = payload.global
            ? (await s.environments.getGlobals()).variables
            : ((await s.environments.get(targetId))?.variables ?? []);
          const current = existing.find((v) => v.id === payload.variable.id);
          if (current && current.value !== '••••••••') value = current.value;
        }
        const saved = await s.environments.upsertVariable(
          payload.environmentId,
          {
            id: payload.variable.id ?? generateId('var'),
            key: payload.variable.key,
            value,
            enabled: payload.variable.enabled ?? true,
            ...(payload.variable.secret !== undefined ? { secret: payload.variable.secret } : {}),
            ...(payload.variable.description ? { description: payload.variable.description } : {}),
          },
          { global: payload.global === true },
        );
        s.emit('environments.changed', {
          environments: await s.environments.listMasked(),
          activeId: await s.environments.getActiveId(),
        });
        return { variable: saved };
      },
    );
    r.register(
      'environments.variable.delete',
      async (payload: { environmentId: string; variableId: string; global?: boolean }) => {
        await s.environments.deleteVariable(payload.environmentId, payload.variableId, {
          global: payload.global === true,
        });
        s.emit('environments.changed', {
          environments: await s.environments.listMasked(),
          activeId: await s.environments.getActiveId(),
        });
        return { deleted: true };
      },
    );
    r.register('environments.import', async (payload: { content: string }) => {
      const imported = await this.importEnvironments(payload.content);
      s.emit('environments.changed', {
        environments: await s.environments.listMasked(),
        activeId: await s.environments.getActiveId(),
      });
      return imported;
    });
    r.register('environments.export', async (payload: { environmentId: string }) => {
      const environment = await s.environments.get(payload.environmentId);
      if (!environment) throw new Error('Environment not found.');
      // Secrets are masked in listMasked(); export the masked view.
      const masked = await s.environments.getMasked(payload.environmentId);
      return {
        fileName: `${environment.name.replace(/[^\w.-]+/g, '_')}.greedcon-env.json`,
        content: `${JSON.stringify(
          {
            format: 'greedcon-environment',
            version: 2,
            exportedAt: new Date().toISOString(),
            environment: masked ?? environment,
          },
          null,
          2,
        )}\n`,
      };
    });

    // --- history --------------------------------------------------------
    r.register(
      'history.search',
      async (payload: Record<string, unknown>): Promise<HistoryListData> => {
        const entries = await s.history.search(payload as never);
        const total = await s.history.count();
        return { entries, total };
      },
    );
    r.register('history.delete', async (payload: { entryId: string }) => {
      await s.history.delete(payload.entryId);
      s.emit('history.changed', { count: await s.history.count() });
      return { deleted: true };
    });
    r.register('history.clear', async () => {
      const removed = await s.history.clear();
      s.emit('history.changed', { count: 0 });
      return { removed };
    });
    r.register('history.cleanup', async (payload: { keepLast: number }) => {
      const removed = await s.history.cleanup(Math.max(1, Math.floor(payload.keepLast)));
      s.emit('history.changed', { count: await s.history.count() });
      return { removed };
    });
    r.register('history.rerun', async (payload: { entryId: string }) => {
      const entry = await s.history.get(payload.entryId);
      if (!entry) throw new Error('History entry not found.');
      const request = createEmptyRequest(generateId('req'));
      request.name = entry.name;
      request.method = isHttpMethod(entry.method) ? entry.method : 'GET';
      request.url = entry.url;
      return this.sendRequest(request, entry.environmentId);
    });

    // --- tests ----------------------------------------------------------
    r.register('tests.save', async (payload: { requestId: string; tests: unknown[] }) => {
      const parsed = parseTests(payload.tests);
      await this.persistTests(payload.requestId, parsed.tests);
      return { tests: parsed.tests, warnings: parsed.warnings };
    });
    r.register(
      'tests.run',
      async (payload: {
        requestId: string;
        request?: HttpRequestModel;
        environmentId?: string;
      }) => {
        const request = payload.request ?? (await this.findRequest(payload.requestId));
        if (!request) throw new Error('Request not found for test run.');
        const outcome = await this.sendRequest(request, payload.environmentId);
        return outcome;
      },
    );
    r.register(
      'tests.runCollection',
      async (payload: { collectionId: string; environmentId?: string }) =>
        this.runCollectionTests(payload.collectionId, payload.environmentId),
    );
    r.register('tests.history', async (payload: { limit?: number }): Promise<TestHistoryData> => ({
      runs: await s.testRuns.list(payload.limit ?? 20),
    }));

    // --- auth -----------------------------------------------------------
    r.register(
      'auth.storeCredential',
      async (payload: {
        label: string;
        kind: string;
        value: string;
        existingSecretId?: string;
      }) => {
        const kind = payload.kind as Parameters<CredentialStore['save']>[0];
        const secretId = await s.credentials.save(
          kind,
          payload.label,
          payload.value,
          payload.existingSecretId,
        );
        return { secretId };
      },
    );
    r.register('auth.deleteCredential', async (payload: { secretId: string }) => {
      await s.credentials.delete(payload.secretId);
      return { deleted: true };
    });
    r.register(
      'auth.oauth2Authorize',
      async (payload: { requestId: string; auth: HttpRequestModel['authentication'] }) => {
        if (payload.auth.type !== 'oauth2') throw new Error('Authentication is not OAuth2.');
        const auth = await s.auth.prepareForStorage(payload.auth);
        if (auth.type !== 'oauth2') throw new Error('Authentication is not OAuth2.');
        const token = await s.oauth2.getAccessToken(auth, {
          openExternal: (url) => this.openExternal(url),
        });
        const settings = await s.settings.get();
        if (settings.draft?.id === payload.requestId) {
          await this.persistDraft({ ...settings.draft, authentication: auth });
        }
        return { authorized: token !== null, auth };
      },
    );
    r.register('auth.oauth2Clear', async (payload: { requestId: string; auth: OAuth2Auth }) => {
      const auth = await s.auth.prepareForStorage(payload.auth);
      if (auth.type !== 'oauth2') throw new Error('Authentication is not OAuth2.');
      await s.oauth2.clearTokens(auth);
      const settings = await s.settings.get();
      if (settings.draft?.id === payload.requestId) {
        await this.persistDraft({ ...settings.draft, authentication: auth });
      }
      return { cleared: true, auth };
    });

    // --- settings -------------------------------------------------------
    r.register('settings.get', async () => ({ settings: await this.loadSafeSettings() }));
    r.register('settings.update', async (payload: { patch: Partial<SettingsState> }) => {
      const patch = { ...payload.patch };
      if (patch.draft) patch.draft = await this.prepareRequestForStorage(patch.draft);
      const settings = await s.settings.update(patch);
      s.emit('settings.changed', { settings });
      return { settings };
    });

    // --- demo -----------------------------------------------------------
    r.register('demo.seed', () => this.seedDemoData());
  }

  // --- implementation ---------------------------------------------------

  private async prepareRequestForStorage(request: HttpRequestModel): Promise<HttpRequestModel> {
    return {
      ...request,
      authentication: await this.services.auth.prepareForStorage(request.authentication),
    };
  }

  private async persistDraft(request: HttpRequestModel): Promise<HttpRequestModel> {
    const safeDraft = await this.prepareRequestForStorage(request);
    await this.services.settings.update({ draft: safeDraft });
    return safeDraft;
  }

  private async loadSafeSettings(): Promise<SettingsState> {
    const settings = await this.services.settings.get();
    if (!settings.draft) return settings;
    const safeDraft = await this.prepareRequestForStorage(settings.draft);
    if (JSON.stringify(safeDraft) === JSON.stringify(settings.draft)) return settings;
    return this.services.settings.update({ draft: safeDraft });
  }

  private async prepareCollectionForStorage(collection: Collection): Promise<Collection> {
    const safeCollection = structuredClone(collection);
    await this.prepareCollectionItems(safeCollection.items);
    if (JSON.stringify(safeCollection) !== JSON.stringify(collection)) {
      await this.services.collections.replace(safeCollection);
    }
    return safeCollection;
  }

  private async prepareCollectionItems(items: CollectionItem[]): Promise<void> {
    for (const item of items) {
      if (item.type === 'request') {
        item.request = await this.prepareRequestForStorage(item.request);
      } else {
        await this.prepareCollectionItems(item.items);
      }
    }
  }

  private async buildInitData(): Promise<AppInitData> {
    const s = this.services;
    const [collections, environments, globals, activeEnvironmentId, settings, historyCount] =
      await Promise.all([
        s.collections.summaries(),
        s.environments.listMasked(),
        s.environments.getGlobals(),
        s.environments.getActiveId(),
        this.loadSafeSettings(),
        s.history.count(),
      ]);
    const draft = settings.draft ?? null;

    return {
      page: (settings.lastPage as PageId) || 'welcome',
      version: s.version,
      collections,
      environments,
      activeEnvironmentId,
      settings,
      historyCount,
      draft,
      globalVariables: globals,
      capabilities: { oauth2: true, multipart: true, testRuns: true },
    };
  }

  private async sendRequest(
    request: HttpRequestModel,
    environmentId?: string,
  ): Promise<{
    response: Awaited<ReturnType<RequestExecutor['execute']>>['response'];
    authentication: HttpRequestModel['authentication'];
    warnings: string[];
    testRun?: TestRunResult;
    variableIssues: unknown[];
  }> {
    const s = this.services;
    request = await this.prepareRequestForStorage(request);
    const requestId = request.id;
    s.emit('request.started', { requestId });

    const environment = environmentId ?? (await s.environments.getActiveId());
    let environmentName: string | undefined;
    if (environment) {
      environmentName = (await s.environments.get(environment))?.name;
    }

    const outcome = await s.executor.execute(request, {
      ...(environment ? { environmentId: environment } : {}),
      onProgress: (phase, detail) =>
        s.emit('request.progress', { requestId, phase, ...(detail ? { detail } : {}) }),
      openExternal: (url) => this.openExternal(url),
    });

    // Persist draft so the builder survives reloads.
    request = await this.persistDraft(request);

    // Run tests when the request defines them.
    let testRun: TestRunResult | undefined;
    if (request.tests && request.tests.length > 0 && outcome.response) {
      try {
        testRun = await s.testRunner.run(request.tests, outcome.response, request, {
          onExtract: async (name, value) => {
            await s.environments.setExtractedValue(name, value);
          },
        });
        await s.testRuns.add({ ...testRun, source: 'request' });
      } catch (error) {
        logger.error('test run failed', error);
      }
    }

    // Record history.
    try {
      await s.history.record({
        name: request.name,
        method: request.method,
        url: request.url,
        ...(outcome.response?.finalUrl ? { finalUrl: outcome.response.finalUrl } : {}),
        ...(request.authentication.type === 'apiKey' && request.authentication.placement === 'query'
          ? { sensitiveQueryKeys: [request.authentication.key] }
          : {}),
        response: outcome.response,
        ...(testRun ? { testRun } : {}),
        ...(environment ? { environmentId: environment } : {}),
        ...(environmentName ? { environmentName } : {}),
        cancelled: outcome.response?.error?.aborted === true,
      });
      s.emit('history.changed', { count: await s.history.count() });
    } catch (error) {
      logger.error('failed to record history', error);
    }

    const sensitiveQueryKeys =
      request.authentication.type === 'apiKey' && request.authentication.placement === 'query'
        ? [request.authentication.key]
        : [];
    const response = outcome.response
      ? {
          ...outcome.response,
          headers: redactHeadersForDisplay(
            outcome.response.headers,
            [request.url, outcome.response.finalUrl ?? ''],
            sensitiveQueryKeys,
          ),
          body: redactQuerySecrets(
            outcome.response.body,
            [request.url, outcome.response.finalUrl ?? ''],
            sensitiveQueryKeys,
          ),
          ...(outcome.response.finalUrl
            ? { finalUrl: redactUrl(outcome.response.finalUrl, sensitiveQueryKeys) }
            : {}),
        }
      : null;

    s.emit('request.completed', {
      requestId,
      response,
      ...(response?.error
        ? { error: { code: response.error.code, message: response.error.message } }
        : {}),
      ...(testRun ? { testRun } : {}),
    });

    return {
      response,
      authentication: request.authentication,
      warnings: outcome.warnings,
      ...(testRun ? { testRun } : {}),
      variableIssues: outcome.variableIssues,
    };
  }

  private async persistTests(requestId: string, tests: TestDefinition[]): Promise<void> {
    const s = this.services;
    // 1. Update draft when it matches.
    const settings = await s.settings.get();
    if (settings.draft && settings.draft.id === requestId) {
      await s.settings.update({ draft: { ...settings.draft, tests } });
    }
    // 2. Update any saved collection item with this request id.
    const collections = await s.collections.list();
    for (const collection of collections) {
      const item = findRequestByRequestId(collection, requestId);
      if (item) {
        await s.collections.saveRequest(collection.id, '', { ...item.request, tests }, item.id);
        break;
      }
    }
  }

  private async findRequest(requestId: string): Promise<HttpRequestModel | null> {
    const settings = await this.services.settings.get();
    if (settings.draft && settings.draft.id === requestId) return settings.draft;
    const collections = await this.services.collections.list();
    for (const collection of collections) {
      const item = findRequestByRequestId(collection, requestId);
      if (item) return item.request;
    }
    return null;
  }

  private async runCollectionTests(
    collectionId: string,
    environmentId?: string,
  ): Promise<{
    runs: TestRunResult[];
    summary: { total: number; passed: number; failed: number };
  }> {
    const s = this.services;
    const loadedCollection = await s.collections.get(collectionId);
    if (!loadedCollection) throw new Error('Collection not found.');
    const collection = await this.prepareCollectionForStorage(loadedCollection);

    const requests = flattenCollectionRequests(collection.items);
    const runs: TestRunResult[] = [];
    let passed = 0;
    let failed = 0;
    let total = 0;

    for (const { request } of requests) {
      const tests = request.tests ?? [];
      if (tests.length === 0) continue;
      const outcome = await s.executor.execute(request, {
        ...(environmentId ? { environmentId } : {}),
        openExternal: (url) => this.openExternal(url),
      });
      if (!outcome.response) continue;
      const run = await s.testRunner.run(tests, outcome.response, request, {
        onExtract: async (name, value) => s.environments.setExtractedValue(name, value),
      });
      await s.testRuns.add({ ...run, source: 'collection' });
      await s.history.record({
        name: request.name,
        method: request.method,
        url: request.url,
        ...(request.authentication.type === 'apiKey' && request.authentication.placement === 'query'
          ? { sensitiveQueryKeys: [request.authentication.key] }
          : {}),
        response: outcome.response,
        testRun: run,
        source: { collectionId },
        ...(environmentId ? { environmentId } : {}),
      });
      runs.push(run);
      total += run.summary.total;
      passed += run.summary.passed;
      failed += run.summary.failed;
    }

    await s.collections.replace(collection);
    s.emit('history.changed', { count: await s.history.count() });
    return { runs, summary: { total, passed, failed } };
  }

  private async pickImportFile(): Promise<{
    content: string;
    fileName: string;
    format?: string;
  } | null> {
    const result = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Import collection',
      filters: {
        'Collection files': ['json'],
      },
    });
    if (!result || result.length === 0) return null;
    const uri = result[0];
    const content = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(content).toString('utf8');
    const fileName = uri.path.split('/').pop() ?? 'collection.json';
    const format = fileName.includes('postman') ? 'postman-v2.1' : undefined;
    return { content: text, fileName, ...(format ? { format } : {}) };
  }

  private async saveExportFile(defaultName: string, content: string): Promise<string | null> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters: { 'Collection files': ['json'] },
      saveLabel: 'Export collection',
    });
    if (!uri) return null;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    return uri.fsPath;
  }

  private async openExternal(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        sVoid(
          this.services.emit('toast', {
            level: 'warning',
            message: 'Only http(s) links can be opened.',
          }),
        );
        return false;
      }
      return await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch {
      return false;
    }
  }

  private async importEnvironments(
    content: string,
  ): Promise<{ imported: number; warnings: string[] }> {
    const parsed = parseJson(content);
    if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) {
      throw new Error(`Invalid environment file: ${parsed.error ?? 'parse error'}`);
    }
    const record = parsed.value as Record<string, unknown>;
    const environment = (record['environment'] ?? record) as Record<string, unknown>;
    const warnings: string[] = [];
    let imported = 0;

    const upsertOne = async (source: Record<string, unknown>): Promise<void> => {
      const name = typeof source['name'] === 'string' ? source['name'] : 'Imported Environment';
      const created = await this.services.environments.create(
        name,
        typeof source['description'] === 'string' ? source['description'] : undefined,
      );
      const variables = Array.isArray(source['variables']) ? source['variables'] : [];
      for (const raw of variables) {
        if (!raw || typeof raw !== 'object') continue;
        const variable = raw as Record<string, unknown>;
        if (typeof variable['key'] !== 'string' || typeof variable['value'] !== 'string') {
          warnings.push(`Skipped invalid variable in "${name}".`);
          continue;
        }
        await this.services.environments.upsertVariable(created.id, {
          id: generateId('var'),
          key: variable['key'],
          value: variable['value'],
          enabled: variable['enabled'] !== false,
          ...(variable['secret'] === true ? { secret: true } : {}),
          ...(typeof variable['description'] === 'string'
            ? { description: variable['description'] }
            : {}),
        });
      }
      imported += 1;
    };

    // Support both a single environment document and a bundle of environments.
    if (Array.isArray(record['environments'])) {
      for (const raw of record['environments'] as unknown[]) {
        if (raw && typeof raw === 'object') await upsertOne(raw as Record<string, unknown>);
      }
    } else {
      await upsertOne(environment);
    }

    return { imported, warnings };
  }

  private async seedDemoData(): Promise<{ seeded: boolean }> {
    const s = this.services;
    const existing = await s.collections.list();
    if (existing.some((c) => c.name === 'Demo Collection')) {
      return { seeded: false };
    }

    const collection = await s.collections.create(
      'Demo Collection',
      'Example data created by "Load demo data". Safe to delete.',
    );

    const demoRequest = (
      name: string,
      method: HttpRequestModel['method'],
      url: string,
    ): HttpRequestModel => {
      const request = createEmptyRequest(generateId('req'));
      request.name = name;
      request.method = method;
      request.url = url;
      return request;
    };

    await s.collections.saveRequest(
      collection.id,
      '',
      demoRequest('Get Users', 'GET', '{{base_url}}/users'),
    );
    const post = demoRequest('Create User', 'POST', '{{base_url}}/users');
    post.body = {
      type: 'json',
      text: '{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com"\n}',
    };
    post.headers = [
      { id: generateId('h'), key: 'Content-Type', value: 'application/json', enabled: true },
    ];
    await s.collections.saveRequest(collection.id, '', post);

    const environment = await s.environments.create('Development', 'Demo environment');
    await s.environments.upsertVariable(environment.id, {
      id: generateId('var'),
      key: 'base_url',
      value: 'https://jsonplaceholder.typicode.com',
      enabled: true,
    });

    this.notifyCollections();
    s.emit('environments.changed', {
      environments: await s.environments.listMasked(),
      activeId: await s.environments.getActiveId(),
    });
    return { seeded: true };
  }

  private notifyCollections(): void {
    void this.services.collections.summaries().then((collections) => {
      this.services.emit('collections.changed', { collections });
    });
  }
}

function sVoid(value: unknown): void {
  void value;
}

function findRequestByRequestId(
  collection: import('../types/Collection').Collection,
  requestId: string,
): import('../types/Collection').RequestItem | null {
  const walk = (
    items: import('../types/Collection').CollectionItem[],
  ): import('../types/Collection').RequestItem | null => {
    for (const item of items) {
      if (item.type === 'request') {
        if (item.request.id === requestId || item.id === requestId) return item;
      } else {
        const found = walk(item.items);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(collection.items);
}

function flattenCollectionRequests(
  items: import('../types/Collection').CollectionItem[],
): Array<{ request: HttpRequestModel }> {
  const out: Array<{ request: HttpRequestModel }> = [];
  for (const item of items) {
    if (item.type === 'request') out.push({ request: item.request });
    else out.push(...flattenCollectionRequests(item.items));
  }
  return out;
}

export { renderRun };
export type { KeyValueRow };
