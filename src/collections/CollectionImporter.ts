/**
 * CollectionImporter — file/text import entry point with validation and
 * duplicate-id protection.
 */
import type { ImportResult } from '../types/Collection';
import { importRegistry } from './formats/ImportFormatRegistry';
import { sanitizeMultiline } from '../security/InputSanitizer';

export interface ImportOptions {
  /** Force a specific format id instead of auto-detection. */
  formatId?: string;
  /** Reject imports larger than this (bytes). */
  maxBytes?: number;
}

export class CollectionImporter {
  /** Import from raw file content. */
  import(content: string, options: ImportOptions = {}): ImportResult {
    const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    const normalized = sanitizeMultiline(content, maxBytes);
    if (normalized.trim().length === 0) {
      throw new Error('The selected file is empty.');
    }
    if (content.length > maxBytes) {
      throw new Error(
        `The file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB import limit.`,
      );
    }
    return importRegistry.import(normalized, options.formatId);
  }

  supportedFormats(): Array<{ id: string; displayName: string; extensions: string[] }> {
    return importRegistry.list().map(({ id, displayName, extensions }) => ({
      id,
      displayName,
      extensions,
    }));
  }
}
