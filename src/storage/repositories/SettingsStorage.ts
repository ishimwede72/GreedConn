/**
 * SettingsStorage — persistence for settings.json (UI + app preferences).
 */
import type { SettingsState, StorageProvider } from '../../types/Storage';
import { defaultSettings } from '../../types/Storage';
import { nowIso } from '../../utils/DateUtils';

const FILE = 'settings.json';

export class SettingsStorage {
  private cache: SettingsState | null = null;
  private loading: Promise<SettingsState> | null = null;

  constructor(private readonly storage: StorageProvider) {}

  private async load(): Promise<SettingsState> {
    if (this.cache) return this.cache;
    if (!this.loading) {
      this.loading = (async () => {
        const result = await this.storage.read<Partial<SettingsState>>(FILE);
        const data = result.data ?? {};
        const settings: SettingsState = {
          ...defaultSettings(),
          ...data,
          ui: { ...defaultSettings().ui, ...(data.ui ?? {}) },
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
        };
        this.cache = settings;
        return settings;
      })();
    }
    return this.loading;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    this.cache.updatedAt = nowIso();
    await this.storage.write(FILE, this.cache);
  }

  get(): Promise<SettingsState> {
    return this.load();
  }

  async update(patch: Partial<SettingsState>): Promise<SettingsState> {
    const current = await this.load();
    this.cache = {
      ...current,
      ...patch,
      ui: { ...current.ui, ...(patch.ui ?? {}) },
      updatedAt: nowIso(),
    };
    await this.persist();
    return this.cache;
  }

  async reset(): Promise<SettingsState> {
    this.cache = defaultSettings();
    this.loading = Promise.resolve(this.cache);
    await this.persist();
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
    this.loading = null;
  }
}
