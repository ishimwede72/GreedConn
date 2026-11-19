/**
 * RequestExecutor — end-to-end orchestration:
 *
 *   validate -> resolve variables -> apply auth -> build -> send -> parse
 *
 * The executor owns cancellation bookkeeping and never throws for HTTP error
 * statuses (4xx/5xx are successful transports); transport failures are
 * returned as `error` on the response model so the UI can render them.
 */
import type { HttpRequestModel } from '../types/Request';
import type { HttpResponseModel } from '../types/Response';
import { HttpClient } from './HttpClient';
import { buildRequest } from './RequestBuilder';
import { parseResponse } from './ResponseParser';
import { CancellationManager } from './CancellationManager';
import { classifyNetworkError } from './NetworkErrorHandler';
import type { AuthenticationManager } from '../authentication/AuthenticationManager';
import type { EnvironmentManager } from '../environments/EnvironmentManager';
import type { SecurityManager } from '../security/SecurityManager';
import type { VariableResolutionIssue } from '../types/Environment';
import { logger, redactUrl } from '../utils/Logger';
import {
  MASK,
  redactHeadersForDisplay,
  redactKnownSecrets,
  redactQuerySecrets,
} from '../security/RedactionManager';

export interface ExecuteOptions {
  environmentId?: string;
  onProgress?: (phase: string, detail?: string) => void;
  /** Injected for OAuth2 interactive flows. */
  openExternal?: (url: string) => Promise<boolean>;
}

export interface ExecuteOutcome {
  response: HttpResponseModel | null;
  /** Non-fatal notes (rejected headers, unresolved variables, auth issues). */
  warnings: string[];
  /** Variable resolution issues (missing/circular references). */
  variableIssues: VariableResolutionIssue[];
}

export class RequestExecutor {
  constructor(
    private readonly http: HttpClient,
    private readonly cancellation: CancellationManager,
    private readonly auth: AuthenticationManager,
    private readonly environments: EnvironmentManager,
    private readonly security: SecurityManager,
  ) {}

  async execute(request: HttpRequestModel, options: ExecuteOptions = {}): Promise<ExecuteOutcome> {
    const warnings: string[] = [];
    const controller = this.cancellation.register(request.id, request.name);

    try {
      // 1. Variable resolution
      options.onProgress?.('resolving', 'Resolving variables');
      const resolved = await this.environments.resolveRequest(request, options.environmentId);
      for (const issue of resolved.issues) {
        if (issue.reason === 'missing') {
          warnings.push(`Unresolved variable {{${issue.variable}}} in ${issue.location}.`);
        } else if (issue.reason === 'disabled') {
          warnings.push(`Variable {{${issue.variable}}} is disabled in ${issue.location}.`);
        } else if (issue.reason === 'circular') {
          warnings.push(`Circular variable reference in ${issue.location}.`);
        } else if (issue.reason === 'malformed') {
          warnings.push(`Malformed variable reference in ${issue.location}.`);
        }
      }

      // 2. Auth (secrets injected here, never persisted)
      options.onProgress?.('authenticating', 'Applying authentication');
      const preparedAuth = await this.auth.prepareForExecution(resolved.request.authentication);
      const authApplication = await this.auth.apply(preparedAuth, {
        openExternal: options.openExternal ?? (async () => false),
        ...(controller.signal ? { signal: controller.signal } : {}),
        url: resolved.request.url,
      });
      const authSecrets = [
        ...(preparedAuth.type === 'bearer' ? [preparedAuth.token] : []),
        ...(preparedAuth.type === 'basic' ? [preparedAuth.password] : []),
        ...(preparedAuth.type === 'apiKey' ? [preparedAuth.value] : []),
        ...(preparedAuth.type === 'oauth2' ? [preparedAuth.clientSecret] : []),
        ...Object.values(authApplication.headers),
        ...(authApplication.cookieHeader ? [authApplication.cookieHeader] : []),
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      if (request.authentication.type === 'oauth2' && preparedAuth.type === 'oauth2') {
        if (preparedAuth.accessTokenSecretId) {
          request.authentication.accessTokenSecretId = preparedAuth.accessTokenSecretId;
        }
        if (preparedAuth.refreshTokenSecretId) {
          request.authentication.refreshTokenSecretId = preparedAuth.refreshTokenSecretId;
        }
        if (preparedAuth.expiresAt !== undefined) {
          request.authentication.expiresAt = preparedAuth.expiresAt;
        }
      }
      warnings.push(...authApplication.issues);

      // 3. Build
      options.onProgress?.('building', 'Building request');
      const policy = this.security.urlPolicy();
      const build = await buildRequest(resolved.request, authApplication, {
        urlPolicy: policy,
        defaultTimeoutMs: this.security.defaultTimeout(),
        maxRedirects: this.security.maxRedirects(),
        validateSsl: this.security.validateSsl(),
        maxResponseBytes: this.security.maxResponseBytes(),
        maxRequestBodyBytes: this.security.getLimits().maxRequestBodyBytes,
      });
      if (!build.built) {
        const message = build.issues.map((i) => `${i.field}: ${i.message}`).join('; ');
        return {
          response: this.errorResponse(request, 'VALIDATION', message),
          warnings: [...warnings, ...build.warnings],
          variableIssues: resolved.issues,
        };
      }
      warnings.push(...build.warnings);

      const sensitiveQueryKeys =
        resolved.request.authentication.type === 'apiKey' &&
        resolved.request.authentication.placement === 'query'
          ? [resolved.request.authentication.key]
          : [];
      const safeRequestUrl = redactUrl(build.built.url, sensitiveQueryKeys);

      // 4. Send
      options.onProgress?.('sending', 'Sending request');
      const startedAt = performance.now();
      try {
        const raw = await this.http.send({
          method: build.built.method,
          url: build.built.url,
          headers: build.built.headers,
          body: build.built.body,
          timeoutMs: build.built.timeoutMs,
          signal: controller.signal,
          followRedirects: build.built.followRedirects,
          maxRedirects: build.built.maxRedirects,
          validateSsl: build.built.validateSsl,
          maxResponseBytes: build.built.maxResponseBytes,
          urlPolicy: policy,
        });

        const response = parseResponse(raw, {
          requestId: request.id,
          maxBodyBytes: this.security.maxResponseBytes(),
        });
        if (response.finalUrl) {
          response.body = redactKnownSecrets(
            redactQuerySecrets(response.body, [response.finalUrl], sensitiveQueryKeys),
            authSecrets,
          );
          response.headers = redactHeadersForDisplay(
            response.headers,
            [response.finalUrl],
            sensitiveQueryKeys,
            authSecrets,
          );
          response.finalUrl = redactUrl(response.finalUrl, sensitiveQueryKeys);
        }
        response.cookies = response.cookies.map((cookie) => ({ ...cookie, value: MASK }));
        logger.info(
          `${request.method} ${safeRequestUrl} -> ${response.status} (${response.responseTime}ms)`,
        );
        return { response, warnings, variableIssues: resolved.issues };
      } catch (error) {
        const classified = classifyNetworkError(error);
        logger.warn(
          `${request.method} ${safeRequestUrl} failed: ${classified.code} ${classified.message}`,
        );
        const rawDetails =
          error instanceof Error
            ? error.stack ?? `${error.name}: ${error.message}`
            : String(error);
        const containsShortCredential = authSecrets.some(
          (secret) => secret.length > 0 && secret.length < 4 && rawDetails.includes(secret),
        );
        const details = containsShortCredential
          ? '[Error details hidden because they may contain a short credential.]'
          : redactKnownSecrets(
              redactQuerySecrets(
                rawDetails.split(build.built.url).join(safeRequestUrl),
                [build.built.url],
                sensitiveQueryKeys,
              ),
              authSecrets,
            );
        const response = this.errorResponse(request, classified.code, classified.message, {
          aborted: classified.code === 'ABORT_ERR',
          timeout: classified.category === 'timeout',
          details,
        });
        response.responseTime = Math.round(performance.now() - startedAt);
        return { response, warnings, variableIssues: resolved.issues };
      }
    } finally {
      this.cancellation.release(request.id);
    }
  }

  private errorResponse(
    request: HttpRequestModel,
    code: string,
    message: string,
    extra: { aborted?: boolean; timeout?: boolean; details?: string } = {},
  ): HttpResponseModel {
    return {
      status: 0,
      statusText: '',
      headers: {},
      cookies: [],
      body: '',
      bodyKind: 'error',
      responseTime: 0,
      responseSize: 0,
      contentType: '',
      requestId: request.id,
      error: { code, message, ...extra },
    };
  }
}
