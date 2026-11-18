/**
 * CollectionStorage — storage-backed adapter used by CollectionRepository.
 * Kept as a distinct module (per architecture spec) so a future SQLite
 * adapter can replace JsonStorage without touching collection logic.
 */
import type { StorageProvider } from '../../types/Storage';

export class CollectionStorage {
  constructor(private readonly provider: StorageProvider) {}

  read() {
    return this.provider.read('collections.json');
  }

  write(data: unknown) {
    return this.provider.write('collections.json', data);
  }
}
