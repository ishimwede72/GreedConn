/**
 * Cancellation manager — registry of in-flight request AbortControllers.
 */
import { logger } from '../utils/Logger';

interface Entry {
  controller: AbortController;
  startedAt: number;
  label: string;
}

export class CancellationManager {
  private readonly entries = new Map<string, Entry>();

  /** Create and register a controller for a request id. */
  register(requestId: string, label = ''): AbortController {
    const existing = this.entries.get(requestId);
    if (existing) {
      // A previous attempt is still tracked: abort it first.
      existing.controller.abort();
    }
    const controller = new AbortController();
    this.entries.set(requestId, { controller, startedAt: Date.now(), label });
    return controller;
  }

  cancel(requestId: string): boolean {
    const entry = this.entries.get(requestId);
    if (!entry) return false;
    entry.controller.abort();
    this.entries.delete(requestId);
    logger.debug(`cancelled request ${requestId}`);
    return true;
  }

  cancelAll(): number {
    let count = 0;
    for (const [id, entry] of this.entries) {
      entry.controller.abort();
      this.entries.delete(id);
      count += 1;
    }
    return count;
  }

  isRunning(requestId: string): boolean {
    return this.entries.has(requestId);
  }

  runningIds(): string[] {
    return [...this.entries.keys()];
  }

  /** Remove an entry once the request settles. */
  release(requestId: string): void {
    this.entries.delete(requestId);
  }

  get size(): number {
    return this.entries.size;
  }
}
