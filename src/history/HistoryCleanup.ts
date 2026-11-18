/**
 * HistoryCleanup — retention policies for request history.
 */
import type { HistoryEntry } from '../types/History';
import { HistoryRepository } from './HistoryRepository';

export interface CleanupPolicy {
  /** Maximum number of entries to retain. */
  maxEntries: number;
  /** Maximum age in days (0 disables age-based cleanup). */
  maxAgeDays: number;
}

export const DEFAULT_POLICY: CleanupPolicy = { maxEntries: 200, maxAgeDays: 0 };

export class HistoryCleanup {
  constructor(private readonly repository: HistoryRepository) {}

  /** Apply the policy; returns the number of removed entries. */
  async apply(policy: CleanupPolicy = DEFAULT_POLICY): Promise<number> {
    const entries = await this.repository.list();
    let kept = entries;

    if (policy.maxAgeDays > 0) {
      const cutoff = Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
      kept = kept.filter((entry) => Date.parse(entry.timestamp) >= cutoff);
    }
    if (kept.length > policy.maxEntries) {
      kept = kept.slice(0, policy.maxEntries);
    }

    const removed = entries.length - kept.length;
    if (removed > 0) {
      await this.repository.replaceAll(kept);
    }
    return removed;
  }

  /** Remove entries matching a predicate (e.g. cancelled requests). */
  async removeWhere(predicate: (entry: HistoryEntry) => boolean): Promise<number> {
    const entries = await this.repository.list();
    const kept = entries.filter((entry) => !predicate(entry));
    const removed = entries.length - kept.length;
    if (removed > 0) {
      await this.repository.replaceAll(kept);
    }
    return removed;
  }
}
