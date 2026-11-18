/**
 * Response model types.
 */

export type ResponseBodyKind = 'text' | 'json' | 'html' | 'xml' | 'binary' | 'empty' | 'error';

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface HttpResponseModel {
  status: number;
  statusText: string;
  /** Lower-cased header names mapped to joined values. */
  headers: Record<string, string>;
  cookies: ResponseCookie[];
  /**
   * Response body. For `binary` kind this is a base64 payload, otherwise text.
   * The raw byte length is reported separately in `responseSize`.
   */
  body: string;
  bodyKind: ResponseBodyKind;
  responseTime: number;
  responseSize: number;
  contentType: string;
  /** Protocol-level error (DNS failure, TLS error, timeout, abort...). */
  error?: ResponseError;
  requestId: string;
  /** Final URL after redirects. */
  finalUrl?: string;
  /** Number of redirects followed. */
  redirectCount?: number;
  /** True when the response exceeded the configured size cap. */
  truncated?: boolean;
}

export interface ResponseError {
  code: string;
  message: string;
  /** True when the user cancelled the request. */
  aborted?: boolean;
  /** True for timeouts. */
  timeout?: boolean;
  /** True when the server answered with an HTTP error status (>=400). */
  httpError?: boolean;
}

export interface RequestResult {
  request: {
    id: string;
    name: string;
    method: string;
    url: string;
  };
  response: HttpResponseModel | null;
  /** Test results produced after execution (if tests were defined). */
  tests?: unknown;
}
