/**
 * SecretManager — thin wrapper over VS Code SecretStorage with namespacing,
 * rotation and existence checks.
 *
 * Rules enforced here:
 *  - secrets never appear in logs (callers get opaque ids)
 *  - secrets never appear in JSON files (collections store only `secretId`)
 *  - deleting a credential removes it from SecretStorage immediately
 */
import type * as vscode from 'vscode';
import { generateSecretId } from '../utils/IdGenerator';
import { logger } from '../utils/Logger';

const PREFIX = 'greedcon.secret.';

export type SecretKind =
  | 'bearer'
  | 'basic-password'
  | 'apiKey'
  | 'oauth2-client-secret'
  | 'oauth2-access'
  | 'oauth2-refresh';

export interface SecretMetadata {
  id: string;
  kind: SecretKind;
  label: string;
  createdAt: string;
}

const META_KEY = 'greedcon.secret.meta';

export class SecretManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  private key(id: string): string {
    return `${PREFIX}${id}`;
  }

  async store(
    kind: SecretKind,
    label: string,
    value: string,
    existingId?: string,
  ): Promise<string> {
    const id = existingId && existingId.startsWith('sec_') ? existingId : generateSecretId();
    await this.secrets.store(this.key(id), value);
    const meta = await this.getMetadata();
    meta[id] = { id, kind, label, createdAt: new Date().toISOString() };
    await this.secrets.store(META_KEY, JSON.stringify(meta));
    logger.debug(`stored secret ${id} (${kind})`);
    return id;
  }

  async get(id: string): Promise<string | undefined> {
    if (!id) return undefined;
    return this.secrets.get(this.key(id));
  }

  async delete(id: string): Promise<void> {
    if (!id) return;
    await this.secrets.delete(this.key(id));
    const meta = await this.getMetadata();
    if (meta[id]) {
      delete meta[id];
      await this.secrets.store(META_KEY, JSON.stringify(meta));
    }
    logger.debug(`deleted secret ${id}`);
  }

  async has(id: string): Promise<boolean> {
    const value = await this.get(id);
    return typeof value === 'string' && value.length > 0;
  }

  async getMetadata(): Promise<Record<string, SecretMetadata>> {
    try {
      const raw = await this.secrets.get(META_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, SecretMetadata>;
      }
      return {};
    } catch {
      return {};
    }
  }

  async list(): Promise<SecretMetadata[]> {
    const meta = await this.getMetadata();
    return Object.values(meta);
  }

  /** Replace all secret values (used by migrations/cleanup). */
  async replace(id: string, value: string): Promise<void> {
    await this.secrets.store(this.key(id), value);
  }

  onDidChange(handler: (id: string) => void): vscode.Disposable {
    return this.secrets.onDidChange((e) => {
      if (e.key.startsWith(PREFIX)) {
        handler(e.key.slice(PREFIX.length));
      }
    });
  }
}
