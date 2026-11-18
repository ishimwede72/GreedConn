import * as http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OAuth2Manager } from '../../../src/authentication/OAuth2Auth';
import { CredentialStore } from '../../../src/authentication/CredentialStore';
import { SecretManager } from '../../../src/security/SecretManager';
import type { OAuth2Auth } from '../../../src/types/Request';
import { __mock } from '../../mocks/vscode.mock';

let server: http.Server;
let tokenUrl: string;
let requestCount = 0;
let manager: OAuth2Manager;
let credentials: CredentialStore;

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    requestCount += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ access_token: `access-${requestCount}`, expires_in: 3600 }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind token test server.');
  tokenUrl = `http://127.0.0.1:${address.port}/token`;

  credentials = new CredentialStore(new SecretManager(__mock.createSecretStorage()));
  manager = new OAuth2Manager(credentials);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('OAuth2 token storage', () => {
  it('retains opaque token references, reuses unexpired tokens, and clears both values', async () => {
    requestCount = 0;
    const auth: OAuth2Auth = {
      type: 'oauth2',
      grant: 'clientCredentials',
      tokenUrl,
      clientId: 'test-client',
      clientSecret: 'test-secret',
    };
    const context = { openExternal: async () => false };

    const first = await manager.getAccessToken(auth, context);
    const accessId = auth.accessTokenSecretId;
    expect(first).toBe('access-1');
    expect(accessId).toMatch(/^sec_/);
    expect(auth.expiresAt).toBeGreaterThan(Date.now());
    expect(await credentials.get(accessId!)).toContain('access-1');

    const second = await manager.getAccessToken(auth, context);
    expect(second).toBe(first);
    expect(requestCount).toBe(1);

    await manager.clearTokens(auth);
    expect(auth.accessTokenSecretId).toBeUndefined();
    expect(auth.refreshTokenSecretId).toBeUndefined();
    expect(auth.expiresAt).toBeUndefined();
    expect(await credentials.get(accessId!)).toBeUndefined();
  });
});
