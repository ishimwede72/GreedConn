/**
 * Credential / authentication storage model types.
 *
 * Sensitive material never lives in collection JSON files; it is stored in
 * VS Code SecretStorage and referenced by opaque ids.
 */

import type { AuthConfig } from './Request';

export interface StoredCredential {
  id: string;
  /** Human readable label shown in the credential picker. */
  label: string;
  kind:
    | 'bearer'
    | 'basic-password'
    | 'apiKey'
    | 'oauth2-client-secret'
    | 'oauth2-access'
    | 'oauth2-refresh';
  createdAt: string;
  lastUsedAt?: string;
}

/** A credential reference stored inside a request's auth config. */
export interface CredentialRef {
  secretId: string;
}

export interface OAuth2TokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
}

/** What the webview is allowed to see about an auth config. */
export interface MaskedAuthConfig {
  type: AuthConfig['type'];
  [key: string]: unknown;
}
