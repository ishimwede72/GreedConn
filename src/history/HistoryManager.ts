/**
 * HistoryManager — record, query and manage request history.
 * Sensitive headers are redacted before persistence and bodies are capped.
 */
import type { HistoryEntry, HistoryFilter } from '../types/History';
import type { HttpMethod } from '../types/Request';
import type { HttpResponseModel } from '../types/Response';
import type { TestRunResult } from '../types/Testing';
import { HistoryRepository } from './HistoryRepository';
import { HistoryCleanup, DEFAULT_POLICY } from './HistoryCleanup';
import { searchHistory, historyStats } from './HistorySearch';
import { generateHistoryId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';
import { redactHeadersForStorage, redactQuerySecrets } from '../security/RedactionManager';
import { truncateBody } from '../engine/ResponseFormatter';
import { logger, redactUrl } from '../utils/Logger';

const MAX_BODY_BYTES = 64 * 1024;

export interface RecordInput {
  name: string;
  method: HttpMethod;
  url: string;
  finalUrl?: string;
  /** Custom query parameter names used for API-key authentication. */
  sensitiveQueryKeys?: string[];
  response: HttpResponseModel | null;
  testRun?: TestRunResult;
  source?: { collectionId?: string; itemId?: string };
  environmentId?: string;
  environmentName?: string;
  cancelled?: boolean;
}

export interface HistoryOptions {
  enabled: boolean;
  limit: number;
  storeResponseBody: boolean;
}

export class HistoryManager {
  private readonly cleanupService: HistoryCleanup;
  private options: HistoryOptions = { enabled: true, limit: 200, storeResponseBody: true };

  constructor(
    private readonly repository: HistoryRepository,
    options?: Partial<HistoryOptions>,
  ) {
    this.cleanupService = new HistoryCleanup(repository);
    if (options) this.configure(options);
  }

  configure(options: Partial<HistoryOptions>): void {
    this.options = { ...this.options, ...options };
  }

  async record(input: RecordInput): Promise<HistoryEntry | null> {
    if (!this.options.enabled) return null;

    const response = input.response;
    const url = redactUrl(input.url, input.sensitiveQueryKeys);
    const finalUrl = input.finalUrl
      ? redactUrl(input.finalUrl, input.sensitiveQueryKeys)
      : undefined;
    const entry: HistoryEntry = {
      id: generateHistoryId(),
      name: input.name,
      method: input.method,
      url,
      ...(finalUrl && finalUrl !== url ? { finalUrl } : {}),
      ...(response
        ? {
            status: response.status,
            statusText: response.statusText,
            responseTime: response.responseTime,
            responseSize: response.responseSize,
            contentType: response.contentType,
            headers: redactHeadersForStorage(
              response.headers,
              [input.url, input.finalUrl ?? ''],
              input.sensitiveQueryKeys,
            ),
            ...(this.options.storeResponseBody && response.bodyKind !== 'binary'
              ? {
                  body: redactQuerySecrets(
                    truncateBody(response.body, MAX_BODY_BYTES).body,
                    [input.url, input.finalUrl ?? ''],
                    input.sensitiveQueryKeys,
                  ),
                }
              : {}),
            ...(response.bodyKind !== 'binary' ? { bodyKind: response.bodyKind } : {}),
          }
        : {}),
      ...(response?.error
        ? { error: { code: response.error.code, message: response.error.message } }
        : {}),
      ...(input.testRun
        ? {
            testSummary: {
              total: input.testRun.summary.total,
              passed: input.testRun.summary.passed,
              failed: input.testRun.summary.failed,
            },
          }
        : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.environmentId ? { environmentId: input.environmentId } : {}),
      ...(input.environmentName ? { environmentName: input.environmentName } : {}),
      ...(input.cancelled ? { cancelled: true } : {}),
      timestamp: nowIso(),
    };

    await this.repository.add(entry, this.options.limit);
    logger.debug(`recorded history entry ${entry.id} (${entry.method} ${entry.url})`);
    return entry;
  }

  search(filter: HistoryFilter = {}): Promise<HistoryEntry[]> {
    return this.repository.list().then((entries) => searchHistory(entries, filter));
  }

  async stats(): Promise<ReturnType<typeof historyStats>> {
    const entries = await this.repository.list();
    return historyStats(entries);
  }

  async count(): Promise<number> {
    const entries = await this.repository.list();
    return entries.length;
  }

  get(id: string): Promise<HistoryEntry | null> {
    return this.repository.get(id);
  }

  delete(id: string): Promise<boolean> {
    return this.repository.remove(id);
  }

  async clear(): Promise<number> {
    const removed = await this.repository.clear();
    logger.info(`cleared ${removed} history entries`);
    return removed;
  }

  async cleanup(keepLast?: number): Promise<number> {
    if (keepLast !== undefined) {
      return this.repository.cleanup(keepLast);
    }
    return this.cleanupPolicy();
  }

  private async cleanupPolicy(): Promise<number> {
    return this.cleanupService.apply({
      ...DEFAULT_POLICY,
      maxEntries: this.options.limit,
    });
  }
}
