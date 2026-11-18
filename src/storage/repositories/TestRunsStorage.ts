/**
 * TestRunsRepository — persistence for test run history (testRuns.json).
 */
import type { TestRunHistoryEntry } from '../../types/Testing';
import type { StorageProvider } from '../../types/Storage';
import { logger } from '../../utils/Logger';

const FILE = 'testRuns.json';
const MAX_RUNS = 100;

interface TestRunsDocument {
  runs: TestRunHistoryEntry[];
}

export class TestRunsRepository {
  private cache: TestRunHistoryEntry[] | null = null;
  private loading: Promise<TestRunHistoryEntry[]> | null = null;

  constructor(private readonly storage: StorageProvider) {}

  private async load(): Promise<TestRunHistoryEntry[]> {
    if (this.cache) return this.cache;
    if (!this.loading) {
      this.loading = (async () => {
        const result = await this.storage.read<Partial<TestRunsDocument>>(FILE);
        const raw = result.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.runs) ? raw.runs : [];
        const runs = list.filter(
          (run): run is TestRunHistoryEntry =>
            !!run && typeof run === 'object' && typeof (run as TestRunHistoryEntry).runId === 'string',
        );
        runs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        this.cache = runs;
        return runs;
      })();
    }
    return this.loading;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    await this.storage.write(FILE, { runs: this.cache } satisfies TestRunsDocument);
  }

  async add(run: TestRunHistoryEntry): Promise<void> {
    const runs = await this.load();
    runs.unshift(run);
    if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
    await this.persist();
  }

  async list(limit = 20): Promise<TestRunHistoryEntry[]> {
    const runs = await this.load();
    return runs.slice(0, limit);
  }

  async clear(): Promise<number> {
    const runs = await this.load();
    const count = runs.length;
    this.cache = [];
    await this.persist();
    return count;
  }

  invalidate(): void {
    this.cache = null;
    this.loading = null;
  }
}
