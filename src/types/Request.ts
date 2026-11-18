/**
 * Shared request model types for GREEDCON.
 *
 * These types are consumed by both the extension host (`src/`) and the
 * webview (`webview/`) so the message contract stays type-safe end to end.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === 'string' && (HTTP_METHODS as readonly string[]).includes(value);
}

/**
 * Generic enabled/disabled key/value row used for query parameters and headers.
 */
export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

/**
 * Request body variants.
 *
 * Decision: "Raw text" and "Text" from the design reference are the same
 * concept (unstructured text sent as-is) and are represented by a single
 * `text` type. `xml` only affects syntax highlighting/formatting hints.
 */
export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'formUrlEncoded' | 'multipart';

export const BODY_TYPES: readonly BodyType[] = [
  'none',
  'json',
  'text',
  'xml',
  'formUrlEncoded',
  'multipart',
];

export interface MultipartPart {
  id: string;
  name: string;
  value: string;
  /** 'text' sends a plain field, 'file' references a local file path. */
  kind: 'text' | 'file';
  fileName?: string;
  contentType?: string;
  enabled: boolean;
}

export interface RequestBody {
  type: BodyType;
  /** Raw payload for `json`, `text` and `xml` body types. */
  text?: string;
  /** Rows for `formUrlEncoded`. */
  formParams?: KeyValueRow[];
  /** Parts for `multipart`. */
  multipartParts?: MultipartPart[];
  /** Explicit content-type override (appended as a header if not set by the user). */
  contentType?: string;
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apiKey' | 'oauth2';

export type ApiKeyPlacement = 'header' | 'query' | 'cookie';

export interface BearerAuth {
  type: 'bearer';
  /**
   * Token value. When `secretId` is set the real value lives in VS Code
   * SecretStorage and `token` only ever contains a masked placeholder.
   */
  token: string;
  secretId?: string;
  prefix?: string;
}

export interface BasicAuth {
  type: 'basic';
  username: string;
  password: string;
  secretId?: string;
}

export interface ApiKeyAuth {
  type: 'apiKey';
  key: string;
  value: string;
  secretId?: string;
  placement: ApiKeyPlacement;
}

export type OAuth2Grant = 'clientCredentials' | 'authorizationCodePkce';

export interface OAuth2Auth {
  type: 'oauth2';
  grant: OAuth2Grant;
  tokenUrl: string;
  authorizationUrl?: string;
  clientId: string;
  clientSecret?: string;
  clientSecretId?: string;
  scope?: string;
  /** Extra form parameters for the token request. */
  extraParams?: Array<{ key: string; value: string }>;
  audience?: string;
  /** Cached token (never persisted to collections; lives in SecretStorage). */
  accessTokenSecretId?: string;
  refreshTokenSecretId?: string;
  expiresAt?: number;
}

export type AuthConfig = { type: 'none' } | BearerAuth | BasicAuth | ApiKeyAuth | OAuth2Auth;

export interface RequestSettings {
  /** Follow redirects (bounded by `maxRedirects`). */
  followRedirects: boolean;
  maxRedirects?: number;
  /** Per-request timeout override in ms; falls back to the global setting. */
  timeout?: number;
  /** Strip the default User-Agent header. */
  removeUserAgent?: boolean;
  /** Validate TLS certificates (falls back to global setting). */
  validateSsl?: boolean;
}

export interface HttpRequestModel {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  body: RequestBody;
  authentication: AuthConfig;
  timeout: number;
  environmentId?: string;
  settings: RequestSettings;
  /** Declarative test definitions attached to this request. */
  tests?: import('./Testing').TestDefinition[];
  createdAt: string;
  updatedAt: string;
}

export function defaultRequestSettings(): RequestSettings {
  return { followRedirects: true, maxRedirects: 5 };
}

export function createEmptyRequest(id: string, now = new Date().toISOString()): HttpRequestModel {
  return {
    id,
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    authentication: { type: 'none' },
    timeout: 30000,
    settings: defaultRequestSettings(),
    createdAt: now,
    updatedAt: now,
  };
}
