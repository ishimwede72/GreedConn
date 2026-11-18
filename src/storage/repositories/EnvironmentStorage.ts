/**
 * EnvironmentStorage — storage-backed adapter used by EnvironmentRepository.
 */
import type { StorageProvider } from '../../types/Storage';

export class EnvironmentStorage {
  constructor(private readonly provider: StorageProvider) {}

  read() {
    return this.provider.read('environments.json');
  }

  write(data: unknown) {
    return this.provider.write('environments.json', data);
  }
}
