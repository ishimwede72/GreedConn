/**
 * HistoryStorage — storage-backed adapter used by HistoryRepository.
 */
import type { StorageProvider } from '../../types/Storage';

export class HistoryStorage {
  constructor(private readonly provider: StorageProvider) {}

  read() {
    return this.provider.read('history.json');
  }

  write(data: unknown) {
    return this.provider.write('history.json', data);
  }
}
