/**
 * ImportFormatRegistry — extensible importer architecture.
 *
 * Adding a new format = implementing `ImportFormat` and registering it.
 * Detection order matters: native formats are checked before generic ones.
 */
import type { ImportResult } from '../../types/Collection';
import * as greedcon from './GreedconFormat';
import * as postman from './PostmanImporter';

export interface ImportFormat {
  id: string;
  displayName: string;
  /** File extensions accepted by the file picker. */
  extensions: string[];
  /** Cheap content sniffing — must not throw. */
  detect(content: string): boolean;
  /** Parse and validate; must throw a descriptive Error on failure. */
  parse(content: string): ImportResult;
}

class ImportFormatRegistry {
  private readonly formats: ImportFormat[] = [];

  register(format: ImportFormat): void {
    const index = this.formats.findIndex((f) => f.id === format.id);
    if (index >= 0) this.formats[index] = format;
    else this.formats.push(format);
  }

  list(): ImportFormat[] {
    return [...this.formats];
  }

  get(id: string): ImportFormat | undefined {
    return this.formats.find((f) => f.id === id);
  }

  /** Find the first format that recognizes the content. */
  detect(content: string): ImportFormat | null {
    for (const format of this.formats) {
      try {
        if (format.detect(content)) return format;
      } catch {
        /* detection must never throw */
      }
    }
    return null;
  }

  /**
   * Import content. When no format matches, a JSON document with a `collection`
   * or `items` shape is attempted as a generic Greedcon-like document before
   * failing with an actionable error.
   */
  import(content: string, preferredId?: string): ImportResult {
    if (preferredId) {
      const preferred = this.get(preferredId);
      if (preferred) return preferred.parse(content);
    }
    const detected = this.detect(content);
    if (detected) return detected.parse(content);

    // Last resort: generic JSON with a collection-ish shape.
    try {
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (record['collection'] !== undefined || Array.isArray(record['items'])) {
          return greedcon.parse(content);
        }
      }
    } catch {
      /* fall through to error below */
    }
    throw new Error(
      'Unrecognized collection format. Supported formats: Greedcon collection (v2), Postman Collection v2.1.',
    );
  }
}

export const importRegistry = new ImportFormatRegistry();

importRegistry.register({
  id: 'greedcon',
  displayName: 'Greedcon Collection',
  extensions: ['.greedcon.json', '.json'],
  detect: greedcon.detect,
  parse: greedcon.parse,
});

importRegistry.register({
  id: 'postman-v2.1',
  displayName: 'Postman Collection v2.1',
  extensions: ['.postman_collection.json', '.json'],
  detect: postman.detect,
  parse: postman.parse,
});
