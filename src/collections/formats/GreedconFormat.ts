/**
 * GREEDCON native collection format (versioned).
 *
 * Envelope:
 * {
 *   "format": "greedcon-collection",
 *   "version": 2,
 *   "exportedAt": "<iso>",
 *   "collection": { ...Collection }
 * }
 *
 * Round-trip guarantee: every field supported by the current schema is
 * preserved. Secrets are exported as masked placeholders (never real values).
 */
import type { Collection, ImportResult } from '../../types/Collection';
import { validateCollection } from '../CollectionValidator';
import { redactObject } from '../../security/RedactionManager';
import { generateCollectionId } from '../../utils/IdGenerator';
import { nowIso } from '../../utils/DateUtils';

export const GREEDCON_FORMAT_ID = 'greedcon-collection';
export const GREEDCON_FORMAT_VERSION = 2;

export interface GreedconEnvelope {
  format: typeof GREEDCON_FORMAT_ID;
  version: number;
  exportedAt: string;
  collection: Collection;
}

export function serializeCollection(collection: Collection): string {
  const sanitized = redactObject(collection);
  const envelope: GreedconEnvelope = {
    format: GREEDCON_FORMAT_ID,
    version: GREEDCON_FORMAT_VERSION,
    exportedAt: nowIso(),
    collection: sanitized,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function detect(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return record['format'] === GREEDCON_FORMAT_ID;
    }
  } catch {
    /* not JSON */
  }
  return false;
}

export function parse(content: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Not a Greedcon collection document.');
  }
  const envelope = parsed as Partial<GreedconEnvelope>;
  if (envelope.format !== GREEDCON_FORMAT_ID) {
    throw new Error('Not a Greedcon collection document (format field mismatch).');
  }

  const warnings: string[] = [];
  if (typeof envelope.version === 'number' && envelope.version > GREEDCON_FORMAT_VERSION) {
    warnings.push(
      `Document version ${envelope.version} is newer than supported version ${GREEDCON_FORMAT_VERSION}; unknown fields were preserved where possible.`,
    );
  }

  const candidate = envelope.collection ?? (envelope as unknown as Collection);
  const validated = validateCollection(candidate);
  if (!validated.ok || !validated.value) {
    throw new Error(`Collection validation failed: ${validated.errors.join('; ')}`);
  }

  const collection: Collection = {
    ...validated.value,
    // Always assign a fresh id to avoid collisions with existing collections.
    id: generateCollectionId(),
    updatedAt: nowIso(),
  };

  return {
    collection,
    format: GREEDCON_FORMAT_ID,
    warnings: [...warnings, ...validated.warnings],
    preservedUnknownFields: validated.warnings.length,
  };
}
