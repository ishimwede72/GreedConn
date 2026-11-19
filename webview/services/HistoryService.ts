/**
 * HistoryService — search, delete and maintenance of request history.
 */
import { bridge } from './VsCodeBridge';
import type { HistoryEntry, HistoryFilter } from '../../src/types/History';

export const HistoryService = {
  search(filter: HistoryFilter = {}): Promise<{ entries: HistoryEntry[]; total: number }> {
    return bridge.request('history.search', { ...filter }, 15000);
  },

  delete(entryId: string): Promise<{ deleted: boolean }> {
    return bridge.request('history.delete', { entryId });
  },

  clear(): Promise<{ removed: number }> {
    return bridge.request('history.clear', { confirm: true }, 15000);
  },

  cleanup(keepLast: number): Promise<{ removed: number }> {
    return bridge.request('history.cleanup', { keepLast });
  },

  rerun(entryId: string): Promise<{ response: unknown; warnings: string[] }> {
    return bridge.request('history.rerun', { entryId }, 60000);
  },
};
