/**
 * CredentialStore — typed facade over SecretManager for request credentials.
 *
 * Guarantees:
 *  - values only ever live in VS Code SecretStorage
 *  - the webview receives masked placeholders, never raw values
 *  - collections/exports store only opaque `secretId` references
 */
import type { SecretManager } from '../security/SecretManager';
import { MASK } from '../security/RedactionManager';

export class CredentialStore {
  constructor(private readonly secrets: SecretManager) {}

  async save(
    kind: Parameters<SecretManager['store']>[0],
    label: string,
    value: string,
    existingSecretId?: string,
  ): Promise<string> {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Credential value is required.');
    }
    if (value === MASK) {
      throw new Error('Masked value received — provide a real credential value.');
    }
    return this.secrets.store(kind, label, value, existingSecretId);
  }

  get(id: string): Promise<string | undefined> {
    return this.secrets.get(id);
  }

  delete(id: string): Promise<void> {
    return this.secrets.delete(id);
  }

  has(id: string): Promise<boolean> {
    return this.secrets.has(id);
  }

  list(): ReturnType<SecretManager['list']> {
    return this.secrets.list();
  }

  /**
   * Read a secret that may be stored either inline (legacy/plaintext inside
   * an import) or by reference. Returns undefined when neither exists.
   */
  async resolve(reference: { secretId?: string; inline?: string }): Promise<string | undefined> {
    if (reference.secretId) {
      const stored = await this.secrets.get(reference.secretId);
      if (stored !== undefined) return stored;
    }
    if (reference.inline && reference.inline !== MASK) return reference.inline;
    return undefined;
  }

  /** True when a value is a masked placeholder instead of real content. */
  static isMasked(value: string | undefined): boolean {
    return value === MASK || value === '••••••' || /^•+$/.test(value ?? '');
  }
}
