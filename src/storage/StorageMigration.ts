/**
 * Storage migrations.
 *
 * v1 -> v2:
 *  - collections gain `version` and recursive `items` with `type` discriminators
 *  - environments gain `version` and variable `enabled` flags
 *  - settings gains the `ui` block
 *
 * Migrations are pure functions over the stored document and append human
 * readable notes to `messages` so the UI can report what happened.
 */
import type { StorageDocument } from '../types/Storage';
import { generateFolderId, generateItemId } from '../utils/IdGenerator';

type AnyRecord = Record<string, unknown>;

export const migrations: Record<
  number,
  (doc: StorageDocument<unknown>, messages: string[]) => StorageDocument<unknown>
> = {
  1: migrateV1ToV2,
};

function migrateV1ToV2(
  doc: StorageDocument<unknown>,
  messages: string[],
): StorageDocument<unknown> {
  const data = doc.data;
  if (data === null || typeof data !== 'object') {
    return { ...doc, version: 2 };
  }

  if (Array.isArray(data)) {
    // collections.json / environments.json stored as a bare array in v1
    const migrated = data.map((entry) => normalizeEntry(entry));
    const unique = dedupeIds(migrated);
    if (unique.length !== migrated.length) {
      messages.push('Removed duplicate ids during migration.');
    }
    messages.push(`Migrated ${migrated.length} records to schema v2.`);
    return { ...doc, version: 2, data: migrated };
  }

  const record = data as AnyRecord;
  const collections = record['collections'];
  if (Array.isArray(collections)) {
    record['collections'] = collections.map((entry) => normalizeEntry(entry));
    messages.push(`Migrated ${collections.length} collections to schema v2.`);
  }
  const environments = record['environments'];
  if (Array.isArray(environments)) {
    record['environments'] = environments.map((entry) => normalizeEntry(entry));
    messages.push(`Migrated ${environments.length} environments to schema v2.`);
  }
  if (typeof record['activeEnvironmentId'] !== 'string') {
    record['activeEnvironmentId'] = '';
  }
  if (typeof record['ui'] !== 'object' || record['ui'] === null) {
    record['ui'] = {};
  }
  return { ...doc, version: 2, data: record };
}

function normalizeEntry(entry: unknown): AnyRecord {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return entry as AnyRecord;
  }
  const record = { ...(entry as AnyRecord) };
  record.version = 2;

  if (Array.isArray(record.variables)) {
    record.variables = record.variables.map((variable: unknown) => {
      const v = { ...(variable as AnyRecord) };
      if (typeof v.id !== 'string' || v.id.length === 0) v.id = generateItemId();
      if (typeof v.enabled !== 'boolean') v.enabled = true;
      if (typeof v.key !== 'string') v.key = String(v.key ?? '');
      if (typeof v.value !== 'string') v.value = String(v.value ?? '');
      return v;
    });
  }

  // Legacy collections: `requests: [...]` + `folders: [...]` -> `items: [...]`
  if (Array.isArray(record.items)) {
    record.items = record.items.map((item: unknown) => normalizeItem(item));
  } else if (Array.isArray(record.requests)) {
    const items = (record.requests as unknown[]).map((item) => normalizeItem(item));
    record.items = items;
    delete record.requests;
    delete record.folders;
  }

  if (typeof record.createdAt !== 'string') record.createdAt = new Date().toISOString();
  if (typeof record.updatedAt !== 'string') record.updatedAt = record.createdAt;
  return record;
}

function normalizeItem(item: unknown): AnyRecord {
  const record = { ...(item as AnyRecord) };
  if (record.type !== 'folder' && record.type !== 'request') {
    record.type = record.items !== undefined ? 'folder' : 'request';
  }
  if (typeof record.id !== 'string' || record.id.length === 0) {
    record.id = record.type === 'folder' ? generateFolderId() : generateItemId();
  }
  if (record.type === 'folder' && Array.isArray(record.items)) {
    record.items = record.items.map((child: unknown) => normalizeItem(child));
  } else if (record.type === 'folder') {
    record.items = [];
  }
  if (typeof record.name !== 'string') record.name = 'Untitled';
  if (typeof record.createdAt !== 'string') record.createdAt = new Date().toISOString();
  if (typeof record.updatedAt !== 'string') record.updatedAt = record.createdAt;
  return record;
}

function dedupeIds(entries: AnyRecord[]): AnyRecord[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = typeof entry.id === 'string' ? entry.id : null;
    if (id === null) continue;
    if (seen.has(id)) {
      entry.id = generateItemId();
    }
    seen.add(entry.id as string);
  }
  return entries;
}
