/**
 * AuthenticationManager — resolves an AuthConfig into concrete headers/query
 * parameters at execution time, injecting secret material from SecretStorage
 * (which never leaves the extension host).
 */
import type { ApiKeyAuth, AuthConfig, BasicAuth, BearerAuth, OAuth2Auth } from '../types/Request';
import { applyApiKey } from './ApiKeyAuth';
import { applyBasic } from './BasicAuth';
import { applyBearer } from './BearerAuth';
import type { CredentialStore } from './CredentialStore';
import type { OAuth2Manager, OAuth2Context } from './OAuth2Auth';
import { CredentialStore as Store } from './CredentialStore';

export interface AuthApplication {
  headers: Record<string, string>;
  query: Record<string, string>;
  cookieHeader?: string;
  issues: string[];
}

export interface AuthContext extends OAuth2Context {
  /** URL being requested (for logging context only). */
  url?: string;
}

export class AuthenticationManager {
  constructor(
    private readonly credentials: CredentialStore,
    private readonly oauth2: OAuth2Manager,
  ) {}

  /**
   * Apply authentication to a mutable header/query map.
   * Secrets are read from SecretStorage right before use.
   */
  async apply(auth: AuthConfig, context: AuthContext): Promise<AuthApplication> {
    const result: AuthApplication = { headers: {}, query: {}, issues: [] };

    switch (auth.type) {
      case 'none':
        return result;

      case 'bearer': {
        const token = await this.resolveBearer(auth);
        if (!token) {
          result.issues.push('Bearer token is missing — set it in the Authorization tab.');
          return result;
        }
        try {
          Object.assign(result.headers, applyBearer(token, auth.prefix ?? 'Bearer').headers);
        } catch (error) {
          result.issues.push(messageOf(error));
        }
        return result;
      }

      case 'basic': {
        const password = auth.secretId
          ? ((await this.credentials.get(auth.secretId)) ?? '')
          : auth.password;
        if (!auth.username && !password) {
          result.issues.push('Basic authentication requires a username and password.');
          return result;
        }
        try {
          Object.assign(result.headers, applyBasic(auth.username, password).headers);
        } catch (error) {
          result.issues.push(messageOf(error));
        }
        return result;
      }

      case 'apiKey': {
        const value = auth.secretId
          ? ((await this.credentials.get(auth.secretId)) ?? '')
          : auth.value;
        const cookies: string[] = [];
        const search = new URLSearchParams(Object.entries(result.query));
        try {
          applyApiKey(auth.placement, auth.key, value, {
            headers: result.headers,
            query: search,
            cookies,
          });
          result.query = Object.fromEntries(search.entries());
        } catch (error) {
          result.issues.push(messageOf(error));
          return result;
        }
        if (cookies.length > 0) {
          result.cookieHeader = cookies.join('; ');
        }
        return result;
      }

      case 'oauth2': {
        try {
          const token = await this.oauth2.getAccessToken(auth, {
            openExternal: context.openExternal,
            ...(context.signal ? { signal: context.signal } : {}),
          });
          if (!token) {
            result.issues.push('OAuth2 authorization was not completed.');
            return result;
          }
          Object.assign(result.headers, applyBearer(token, 'Bearer').headers);
        } catch (error) {
          result.issues.push(messageOf(error));
        }
        return result;
      }

      default:
        result.issues.push(`Unsupported authentication type.`);
        return result;
    }
  }

  /** Return a copy of the auth config with secrets replaced by references. */
  async prepareForStorage(auth: AuthConfig): Promise<AuthConfig> {
    switch (auth.type) {
      case 'bearer': {
        if (auth.token && !Store.isMasked(auth.token) && auth.token.length > 0) {
          const secretId = await this.credentials.save(
            'bearer',
            'Bearer token',
            auth.token,
            auth.secretId,
          );
          return { ...auth, token: '••••••••', secretId };
        }
        return auth;
      }
      case 'basic': {
        if (auth.password && !Store.isMasked(auth.password)) {
          const secretId = await this.credentials.save(
            'basic-password',
            `Basic password (${auth.username || 'user'})`,
            auth.password,
            auth.secretId,
          );
          return { ...auth, password: '••••••••', secretId };
        }
        return auth;
      }
      case 'apiKey': {
        if (auth.value && !Store.isMasked(auth.value)) {
          const secretId = await this.credentials.save(
            'apiKey',
            `API key (${auth.key || 'key'})`,
            auth.value,
            auth.secretId,
          );
          return { ...auth, value: '••••••••', secretId };
        }
        return auth;
      }
      case 'oauth2': {
        if (auth.clientSecret && !Store.isMasked(auth.clientSecret)) {
          const clientSecretId = await this.credentials.save(
            'oauth2-client-secret',
            `OAuth2 client secret (${auth.clientId})`,
            auth.clientSecret,
            auth.clientSecretId,
          );
          return { ...auth, clientSecret: '••••••••', clientSecretId };
        }
        return auth;
      }
      default:
        return auth;
    }
  }

  /**
   * Inject real secret values into an auth config for execution. The result
   * must never be persisted or sent to the webview.
   */
  async prepareForExecution(auth: AuthConfig): Promise<AuthConfig> {
    switch (auth.type) {
      case 'bearer': {
        const token = await this.resolveBearer(auth);
        return { ...auth, token: token ?? '' };
      }
      case 'basic': {
        const password = auth.secretId
          ? ((await this.credentials.get(auth.secretId)) ?? '')
          : auth.password;
        return { ...auth, password };
      }
      case 'apiKey': {
        const value = auth.secretId
          ? ((await this.credentials.get(auth.secretId)) ?? '')
          : auth.value;
        return { ...auth, value };
      }
      case 'oauth2': {
        const clientSecret = auth.clientSecretId
          ? ((await this.credentials.get(auth.clientSecretId)) ?? '')
          : (auth.clientSecret ?? '');
        return { ...auth, clientSecret };
      }
      default:
        return auth;
    }
  }

  private async resolveBearer(auth: BearerAuth): Promise<string | undefined> {
    if (auth.secretId) {
      const stored = await this.credentials.get(auth.secretId);
      if (stored) return stored;
    }
    if (auth.token && !Store.isMasked(auth.token)) return auth.token;
    return undefined;
  }

  /** Mask a config for transport to the webview. */
  maskForDisplay(auth: AuthConfig): AuthConfig {
    switch (auth.type) {
      case 'bearer':
        return { ...auth, token: auth.token || auth.secretId ? '••••••••' : '' };
      case 'basic':
        return { ...auth, password: auth.password || auth.secretId ? '••••••••' : '' };
      case 'apiKey':
        return { ...auth, value: auth.value || auth.secretId ? '••••••••' : '' };
      case 'oauth2':
        return {
          ...auth,
          clientSecret: auth.clientSecret || auth.clientSecretId ? '••••••••' : '',
        };
      default:
        return auth;
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type { ApiKeyAuth, BasicAuth, BearerAuth, OAuth2Auth };
