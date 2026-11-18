/**
 * Pre-flight request validation: URL, method, headers, body, limits.
 * Returns structured issues so the UI can highlight exact problems.
 */
import type { HttpRequestModel } from '../types/Request';
import { isHttpMethod } from '../types/Request';
import { validateUrl, UrlPolicy, DEFAULT_URL_POLICY } from '../security/UrlValidator';
import { sanitizeHeaderName, sanitizeHeaderValue } from '../security/HeaderSanitizer';
import { parseJson } from '../utils/JsonUtils';
import { estimateBodyBytes } from './BodyManager';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidateOptions {
  urlPolicy?: UrlPolicy;
  maxRequestBodyBytes?: number;
  maxHeaderCount?: number;
  maxParams?: number;
  /** When true an empty URL is an error (send path). When false it is allowed (draft save). */
  requireUrl?: boolean;
}

export async function validateRequest(
  request: HttpRequestModel,
  options: ValidateOptions = {},
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const policy = options.urlPolicy ?? DEFAULT_URL_POLICY;
  const requireUrl = options.requireUrl ?? true;

  if (!isHttpMethod(request.method)) {
    issues.push({
      field: 'method',
      message: `Unsupported HTTP method "${String(request.method)}".`,
    });
  }

  const url = typeof request.url === 'string' ? request.url.trim() : '';
  if (url.length === 0) {
    if (requireUrl) issues.push({ field: 'url', message: 'URL is required.' });
  } else {
    const check = validateUrl(url, policy);
    if (!check.ok && check.reason !== 'empty') {
      issues.push({ field: 'url', message: check.message ?? 'Invalid URL.' });
    }
  }

  // Query params
  const maxParams = options.maxParams ?? 200;
  const enabledParams = request.params.filter((p) => p.enabled);
  if (enabledParams.length > maxParams) {
    issues.push({ field: 'params', message: `Too many query parameters (max ${maxParams}).` });
  }
  for (const [index, param] of request.params.entries()) {
    if (!param.enabled) continue;
    if (param.key.trim().length === 0 && param.value.length > 0) {
      issues.push({ field: `params.${index}`, message: 'Query parameter name is empty.' });
    }
    if (/[\r\n]/.test(param.key) || /[\r\n]/.test(param.value)) {
      issues.push({
        field: `params.${index}`,
        message: 'Query parameter contains illegal characters.',
      });
    }
  }

  // Headers
  const maxHeaderCount = options.maxHeaderCount ?? 100;
  const enabledHeaders = request.headers.filter((h) => h.enabled && h.key.trim());
  if (enabledHeaders.length > maxHeaderCount) {
    issues.push({ field: 'headers', message: `Too many headers (max ${maxHeaderCount}).` });
  }
  for (const [index, header] of request.headers.entries()) {
    if (!header.enabled || !header.key.trim()) continue;
    const nameCheck = sanitizeHeaderName(header.key);
    if (!nameCheck.ok) {
      issues.push({
        field: `headers.${index}.key`,
        message: nameCheck.reason ?? 'Invalid header name.',
      });
      continue;
    }
    const valueCheck = sanitizeHeaderValue(header.value);
    if (!valueCheck.ok) {
      issues.push({
        field: `headers.${index}.value`,
        message: valueCheck.reason ?? 'Invalid header value.',
      });
    }
  }

  // Body
  const body = request.body;
  if (body.type === 'json') {
    const text = body.text ?? '';
    if (text.trim().length > 0) {
      const parsed = parseJson(text);
      if (!parsed.ok) {
        issues.push({
          field: 'body',
          message: `Invalid JSON body: ${parsed.error ?? 'parse error'}`,
        });
      }
    }
  }
  if (body.type === 'formUrlEncoded') {
    for (const [index, row] of (body.formParams ?? []).entries()) {
      if (!row.enabled) continue;
      if (/[\r\n]/.test(row.key) || /[\r\n]/.test(row.value)) {
        issues.push({
          field: `body.formParams.${index}`,
          message: 'Form field contains illegal characters.',
        });
      }
    }
  }

  const maxBody = options.maxRequestBodyBytes ?? 20 * 1024 * 1024;
  const bodyBytes = await estimateBodyBytes(body);
  if (bodyBytes > maxBody) {
    issues.push({
      field: 'body',
      message: `Request body is ${bodyBytes} bytes which exceeds the ${maxBody} byte limit.`,
    });
  }

  // Timeout sanity
  if (!Number.isFinite(request.timeout) || request.timeout < 100 || request.timeout > 600000) {
    issues.push({ field: 'timeout', message: 'Timeout must be between 100 and 600000 ms.' });
  }

  return issues;
}
