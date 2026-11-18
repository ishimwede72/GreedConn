/**
 * StorageProvider contract re-export.
 *
 * The interface itself lives in `src/types/Storage.ts` so type-only imports
 * stay free of runtime dependencies; this module is the storage-layer entry
 * point for provider implementations and factories.
 */
export type {
  StorageProvider,
  StorageDocument,
  StorageFileName,
  StorageLoadResult,
  StorageStatus,
} from '../types/Storage';
export { JsonStorage, isStorageDocument, type JsonStorageOptions } from './JsonStorage';
