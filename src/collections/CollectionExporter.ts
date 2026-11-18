/**
 * CollectionExporter — serializes collections in the native format (and
 * exposes the format list for future exporters).
 */
import type { Collection } from '../types/Collection';
import { serializeCollection, GREEDCON_FORMAT_ID } from './formats/GreedconFormat';
import { sanitizeFileName } from '../security/InputSanitizer';

export interface ExportResult {
  fileName: string;
  content: string;
  format: string;
}

export class CollectionExporter {
  export(collection: Collection, format = GREEDCON_FORMAT_ID): ExportResult {
    if (format !== GREEDCON_FORMAT_ID) {
      throw new Error(`Unsupported export format "${format}".`);
    }
    return {
      fileName: `${sanitizeFileName(collection.name, 'collection')}.greedcon.json`,
      content: serializeCollection(collection),
      format,
    };
  }

  supportedFormats(): string[] {
    return [GREEDCON_FORMAT_ID];
  }
}
