/**
 * OAuth 2.0 support.
 *
 * Implemented flows (documented in docs/SECURITY.md):
 *  1. Client Credentials — machine-to-machine token endpoint request.
 *  2. Authorization Code + PKCE — loopback redirect (http://127.0.0.1:<port>/callback)
 *     opened in the system browser; the code is exchanged for tokens locally.
 *
 * Security properties:
 *  - `state` and PKCE `code_verifier` are validated to prevent CSRF/injection
 *  - client secrets and tokens are stored ONLY in SecretStorage
 *  - tokens are refreshed automatically when expired (when a refresh token exists)
 *  - no token value is ever logged
 */
import * as http from 'http';
import * as crypto from 'crypto';
import type { OAuth2Auth } from '../types/Request';
import type { OAuth2TokenSet } from '../types/Authentication';
import type { CredentialStore } from './CredentialStore';
import { logger } from '../utils/Logger';
import { createAbortError } from '../engine/TimeoutManager';

export interface OAuth2FlowResult {
  tokenSet: OAuth2TokenSet;
  /** Where the token material was stored (opaque ids). */
  storage: { accessSecretId: string; refreshSecretId?: string };
}

export interface OAuth2Context {
  /** Opens a URL in the system browser. */
  openExternal: (url: string) => Promise<boolean>;
  /** Optional abort signal (user cancelled). */
  signal?: AbortSignal;
}

const LOOPBACK_PORT_RANGE = { min: 53000, max: 53999 };

export class OAuth2Manager {
  constructor(private readonly credentials: CredentialStore) {}

  /**
   * Return a usable access token for the given auth config, refreshing or
   * authorizing as needed. Returns null when interactive authorization was
   * declined or the config is incomplete.
   */
  async getAccessToken(auth: OAuth2Auth, context: OAuth2Context): Promise<string | null> {
    if (auth.grant === 'clientCredentials') {
      const existing = await this.readCached(auth);
      if (existing?.accessToken && !isExpired(existing)) return existing.accessToken;
      const tokenSet = await this.fetchClientCredentials(auth, context.signal);
      await this.cacheTokens(auth, tokenSet);
      return tokenSet.accessToken;
    }

    // Authorization code flow
    const existing = await this.readCached(auth);
    if (existing?.accessToken && !isExpired(existing)) return existing.accessToken;
    if (existing?.refreshToken) {
      try {
        const refreshed = await this.refresh(auth, existing.refreshToken, context.signal);
        await this.cacheTokens(auth, refreshed);
        return refreshed.accessToken;
      } catch (error) {
        logger.warn('oauth2 refresh failed, falling back to interactive flow', error);
      }
    }
    const result = await this.runAuthorizationCodeFlow(auth, context);
    auth.accessTokenSecretId = result.storage.accessSecretId;
    if (result.storage.refreshSecretId) {
      auth.refreshTokenSecretId = result.storage.refreshSecretId;
    }
    auth.expiresAt = result.tokenSet.expiresAt;
    return result.tokenSet.accessToken;
  }

  /** Interactive authorization (PKCE). */
  async runAuthorizationCodeFlow(
    auth: OAuth2Auth,
    context: OAuth2Context,
  ): Promise<OAuth2FlowResult> {
    if (!auth.authorizationUrl) throw new Error('OAuth2 authorization URL is missing.');
    if (!auth.tokenUrl) throw new Error('OAuth2 token URL is missing.');
    if (!auth.clientId) throw new Error('OAuth2 client id is missing.');

    const state = randomString(24);
    const verifier = randomString(64);
    const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());

    const { port, waitForCode } = createLoopbackServer(state);
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    try {
      const authorizeUrl = new URL(auth.authorizationUrl);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', auth.clientId);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('code_challenge', challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      if (auth.scope) authorizeUrl.searchParams.set('scope', auth.scope);
      if (auth.audience) authorizeUrl.searchParams.set('audience', auth.audience);

      await context.openExternal(authorizeUrl.toString());
      const { code } = await withTimeout(waitForCode, 180000, () =>
        createAbortError('OAuth2 authorization timed out after 3 minutes.'),
      );

      const tokenSet = await this.exchangeCode(auth, code, verifier, redirectUri, context.signal);
      return {
        tokenSet,
        storage: {
          accessSecretId: await this.storeAccess(auth, tokenSet),
          ...(tokenSet.refreshToken
            ? { refreshSecretId: await this.storeRefresh(auth, tokenSet) }
            : {}),
        },
      };
    } finally {
      // The loopback server closes itself after the first callback.
    }
  }

  async clearTokens(auth: OAuth2Auth): Promise<void> {
    const secretIds = new Set([auth.accessTokenSecretId, auth.refreshTokenSecretId]);
    await Promise.all([...secretIds].filter((id): id is string => !!id).map((id) => this.credentials.delete(id)));
    delete auth.accessTokenSecretId;
    delete auth.refreshTokenSecretId;
    delete auth.expiresAt;
  }

  // --- token endpoint helpers -----------------------------------------

  private async fetchClientCredentials(
    auth: OAuth2Auth,
    signal?: AbortSignal,
  ): Promise<OAuth2TokenSet> {
    if (!auth.tokenUrl) throw new Error('OAuth2 token URL is missing.');
    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', auth.clientId);
    if (auth.clientSecret) body.set('client_secret', auth.clientSecret);
    if (auth.scope) body.set('scope', auth.scope);
    if (auth.audience) body.set('audience', auth.audience);
    for (const extra of auth.extraParams ?? []) {
      if (extra.key) body.append(extra.key, extra.value);
    }
    return this.requestToken(auth.tokenUrl, body, signal);
  }

  private async refresh(
    auth: OAuth2Auth,
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<OAuth2TokenSet> {
    if (!auth.tokenUrl) throw new Error('OAuth2 token URL is missing.');
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    body.set('client_id', auth.clientId);
    if (auth.clientSecret) body.set('client_secret', auth.clientSecret);
    const tokenSet = await this.requestToken(auth.tokenUrl, body, signal);
    if (!tokenSet.refreshToken) tokenSet.refreshToken = refreshToken;
    return tokenSet;
  }

  private async exchangeCode(
    auth: OAuth2Auth,
    code: string,
    verifier: string,
    redirectUri: string,
    signal?: AbortSignal,
  ): Promise<OAuth2TokenSet> {
    if (!auth.tokenUrl) throw new Error('OAuth2 token URL is missing.');
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', redirectUri);
    body.set('client_id', auth.clientId);
    body.set('code_verifier', verifier);
    if (auth.clientSecret) body.set('client_secret', auth.clientSecret);
    return this.requestToken(auth.tokenUrl, body, signal);
  }

  private async requestToken(
    tokenUrl: string,
    body: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<OAuth2TokenSet> {
    const url = new URL(tokenUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('OAuth2 token URL must use http: or https:.');
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
      ...(signal ? { signal } : {}),
    });

    const text = await response.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`OAuth2 token endpoint returned non-JSON (HTTP ${response.status}).`);
    }
    if (!response.ok || parsed['error']) {
      const description =
        typeof parsed['error_description'] === 'string'
          ? parsed['error_description']
          : `HTTP ${response.status}`;
      throw new Error(`OAuth2 token request failed: ${description}`);
    }

    const accessToken = typeof parsed['access_token'] === 'string' ? parsed['access_token'] : null;
    if (!accessToken) throw new Error('OAuth2 response did not include an access_token.');

    const expiresIn = typeof parsed['expires_in'] === 'number' ? parsed['expires_in'] : undefined;
    const tokenSet: OAuth2TokenSet = {
      accessToken,
      ...(typeof parsed['refresh_token'] === 'string'
        ? { refreshToken: parsed['refresh_token'] }
        : {}),
      ...(typeof parsed['token_type'] === 'string' ? { tokenType: parsed['token_type'] } : {}),
      ...(typeof parsed['scope'] === 'string' ? { scope: parsed['scope'] } : {}),
      ...(expiresIn !== undefined ? { expiresAt: Date.now() + expiresIn * 1000 } : {}),
    };
    logger.info(`oauth2 token acquired (expiresIn=${expiresIn ?? 'unknown'}s)`);
    return tokenSet;
  }

  // --- secret storage --------------------------------------------------

  private async readCached(auth: OAuth2Auth): Promise<OAuth2TokenSet | null> {
    if (!auth.accessTokenSecretId) return null;
    const raw = await this.credentials.get(auth.accessTokenSecretId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OAuth2TokenSet;
    } catch {
      return null;
    }
  }

  private async cacheTokens(auth: OAuth2Auth, tokenSet: OAuth2TokenSet): Promise<void> {
    auth.accessTokenSecretId = await this.storeAccess(auth, tokenSet);
    if (tokenSet.refreshToken) {
      auth.refreshTokenSecretId = await this.storeRefresh(auth, tokenSet);
    } else if (auth.refreshTokenSecretId) {
      await this.credentials.delete(auth.refreshTokenSecretId);
      delete auth.refreshTokenSecretId;
    }
    auth.expiresAt = tokenSet.expiresAt;
  }

  private async storeAccess(auth: OAuth2Auth, tokenSet: OAuth2TokenSet): Promise<string> {
    const id = await this.credentials.save(
      'oauth2-access',
      `OAuth2 access token (${auth.clientId || 'client'})`,
      JSON.stringify(tokenSet),
      auth.accessTokenSecretId,
    );
    return id;
  }

  private async storeRefresh(auth: OAuth2Auth, tokenSet: OAuth2TokenSet): Promise<string> {
    if (!tokenSet.refreshToken) return '';
    return this.credentials.save(
      'oauth2-refresh',
      `OAuth2 refresh token (${auth.clientId || 'client'})`,
      tokenSet.refreshToken,
      auth.refreshTokenSecretId,
    );
  }
}

function isExpired(tokenSet: OAuth2TokenSet): boolean {
  if (!tokenSet.expiresAt) return false;
  // 30s skew
  return Date.now() >= tokenSet.expiresAt - 30000;
}

function randomString(length: number): string {
  const bytes = crypto.randomBytes(length);
  return base64Url(bytes).slice(0, length);
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Minimal loopback server that captures a single OAuth callback. */
function createLoopbackServer(expectedState: string): {
  port: number;
  waitForCode: Promise<{ code: string }>;
} {
  let resolveCode: (value: { code: string }) => void;
  let rejectCode: (error: Error) => void;
  const waitForCode = new Promise<{ code: string }>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (requestUrl.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const error = requestUrl.searchParams.get('error');
      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');

      if (error) {
        res
          .writeHead(200, { 'content-type': 'text/html' })
          .end(page('Authorization failed.', error));
        rejectCode(new Error(`OAuth2 authorization failed: ${error}`));
        server.close();
        return;
      }
      if (!code) {
        res
          .writeHead(400, { 'content-type': 'text/html' })
          .end(page('Missing code.', 'No authorization code was returned.'));
        rejectCode(new Error('OAuth2 callback did not include a code.'));
        server.close();
        return;
      }
      if (state !== expectedState) {
        res
          .writeHead(400, { 'content-type': 'text/html' })
          .end(page('Invalid state.', 'State mismatch — possible CSRF.'));
        rejectCode(new Error('OAuth2 state mismatch.'));
        server.close();
        return;
      }
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(page('Authorization complete.', 'You can close this tab and return to VS Code.'));
      resolveCode({ code });
      server.close();
    } catch (error) {
      rejectCode(error instanceof Error ? error : new Error(String(error)));
      server.close();
    }
  });

  const port =
    LOOPBACK_PORT_RANGE.min + crypto.randomInt(LOOPBACK_PORT_RANGE.max - LOOPBACK_PORT_RANGE.min);
  server.listen(port, '127.0.0.1');

  return { port, waitForCode };
}

function page(title: string, message: string): string {
  return `<!DOCTYPE html><html><body style="font-family: sans-serif; background:#111; color:#eee; padding:40px;">
    <h1>${title}</h1><p>${message}</p></body></html>`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
