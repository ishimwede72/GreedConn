/**
 * RequestBuilder — turns a resolved HttpRequestModel + applied auth into the
 * concrete options consumed by HttpClient.
 */
import type { HttpRequestModel } from '../types/Request';
import type { AuthApplication } from '../authentication/AuthenticationManager';
import { buildUrlWithQuery } from './QueryManager';
import { buildHeaders } from './HeaderManager';
import { buildBody, estimateBodyBytes } from './BodyManager';
import { validateRequest, ValidationIssue } from './RequestValidator';
import { validateUrl, UrlPolicy, DEFAULT_URL_POLICY } from '../security/UrlValidator';

export interface BuildOptions {
  urlPolicy?: UrlPolicy;
  defaultTimeoutMs?: number;
  maxRedirects?: number;
  validateSsl?: boolean;
  maxResponseBytes?: number;
  maxRequestBodyBytes?: number;
}

export interface BuiltRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer | null;
  timeoutMs: number;
  followRedirects: boolean;
  maxRedirects: number;
  validateSsl: boolean;
  maxResponseBytes: number;
}

export interface BuildResult {
  built: BuiltRequest | null;
  issues: ValidationIssue[];
  warnings: string[];
}

export async function buildRequest(
  request: HttpRequestModel,
  auth: AuthApplication,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const policy = options.urlPolicy ?? DEFAULT_URL_POLICY;
  const warnings: string[] = [...auth.issues];

  const issues = await validateRequest(request, {
    urlPolicy: policy,
    requireUrl: true,
    ...(options.maxRequestBodyBytes !== undefined
      ? { maxRequestBodyBytes: options.maxRequestBodyBytes }
      : {}),
  });
  if (issues.length > 0) {
    return { built: null, issues, warnings };
  }

  // 1. Query parameters (editor rows + auth query additions).
  const withQuery = buildUrlWithQuery(request.url.trim(), request.params);
  let finalUrl = withQuery.url;
  const authQuery = Object.entries(auth.query ?? {});
  if (authQuery.length > 0) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    const search = new URLSearchParams();
    for (const [key, value] of authQuery) search.append(key, value);
    const query = search.toString();
    if (query) {
      const hashIndex = finalUrl.indexOf('#');
      const hash = hashIndex >= 0 ? finalUrl.slice(hashIndex) : '';
      const base = hashIndex >= 0 ? finalUrl.slice(0, hashIndex) : finalUrl;
      finalUrl = `${base}${base.includes('?') ? '&' : '?'}${query}${hash}`;
      void separator;
    }
  }

  // 2. URL pre-flight (scheme, private network policy).
  const urlCheck = validateUrl(finalUrl, policy);
  if (!urlCheck.ok || !urlCheck.url) {
    issues.push({ field: 'url', message: urlCheck.message ?? 'Invalid URL.' });
    return { built: null, issues, warnings };
  }

  // 3. Body (JSON validation already ran in validateRequest).
  const bodyResult = await buildBody(request.body);
  warnings.push(...bodyResult.errors);
  const bodyBytes = await estimateBodyBytes(request.body);
  const maxBody = options.maxRequestBodyBytes ?? 20 * 1024 * 1024;
  if (bodyBytes > maxBody) {
    issues.push({
      field: 'body',
      message: `Request body exceeds the ${maxBody} byte limit.`,
    });
    return { built: null, issues, warnings };
  }

  // 4. Headers: defaults < body content-type < auth < editor rows (editor wins).
  const editorHeaders = buildHeaders({
    rows: request.headers,
    ...(bodyResult.contentType ? { contentType: bodyResult.contentType } : {}),
    removeUserAgent: request.settings.removeUserAgent === true,
    extra: auth.headers,
  });
  warnings.push(...editorHeaders.rejected.map((r) => `${r.name}: ${r.reason}`));

  if (auth.cookieHeader) {
    const existing = editorHeaders.headers['cookie'];
    editorHeaders.headers['cookie'] = existing
      ? `${existing}; ${auth.cookieHeader}`
      : auth.cookieHeader;
  }

  // 5. Timeout / redirect / TLS settings.
  const timeoutMs =
    Number.isFinite(request.timeout) && request.timeout > 0
      ? request.timeout
      : (options.defaultTimeoutMs ?? 30000);

  const built: BuiltRequest = {
    method: request.method,
    url: urlCheck.url.toString(),
    headers: editorHeaders.headers,
    body: bodyResult.body,
    timeoutMs,
    followRedirects: request.settings.followRedirects !== false,
    maxRedirects: request.settings.maxRedirects ?? options.maxRedirects ?? 5,
    validateSsl: request.settings.validateSsl ?? options.validateSsl ?? true,
    maxResponseBytes: options.maxResponseBytes ?? 10 * 1024 * 1024,
  };

  return { built, issues: [], warnings };
}
