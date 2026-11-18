/**
 * SecurityManager — facade that centralizes security policy for the
 * extension (URL policy, size limits, webview policy).
 *
 * All policy values come from VS Code configuration so administrators can
 * tune them per-workspace; defaults are documented in docs/SECURITY.md.
 */
import * as vscode from 'vscode';
import { DEFAULT_URL_POLICY, UrlPolicy } from './UrlValidator';
import { clamp } from '../utils/ValidationUtils';

export interface SecurityLimits {
  maxRequestBodyBytes: number;
  maxResponseBodyBytes: number;
  maxHeaderCount: number;
  maxParams: number;
}

export const DEFAULT_LIMITS: SecurityLimits = {
  maxRequestBodyBytes: 20 * 1024 * 1024, // 20 MB
  maxResponseBodyBytes: 10 * 1024 * 1024, // 10 MB (configurable)
  maxHeaderCount: 100,
  maxParams: 200,
};

export class SecurityManager {
  private readonly limits: SecurityLimits;

  constructor(limits: Partial<SecurityLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  getLimits(): SecurityLimits {
    return this.limits;
  }

  urlPolicy(): UrlPolicy {
    const config = vscode.workspace.getConfiguration('greedcon');
    return {
      allowPrivateNetwork: config.get<boolean>('security.allowPrivateNetwork', true),
      allowHttpsToHttpRedirect: config.get<boolean>('security.allowHttpsToHttpRedirect', false),
      maxUrlLength: DEFAULT_URL_POLICY.maxUrlLength,
    };
  }

  maxRedirects(fallback = 5): number {
    const configured = vscode.workspace
      .getConfiguration('greedcon')
      .get<number>('request.maxRedirects', 5);
    return clamp(Number.isFinite(configured) ? configured : fallback, 0, 20);
  }

  validateSsl(fallback = true): boolean {
    return vscode.workspace
      .getConfiguration('greedcon')
      .get<boolean>('request.validateSsl', fallback);
  }

  defaultTimeout(fallback = 30000): number {
    const configured = vscode.workspace
      .getConfiguration('greedcon')
      .get<number>('request.timeout', fallback);
    if (!Number.isFinite(configured)) return fallback;
    return clamp(configured, 100, 600000);
  }

  maxResponseBytes(): number {
    const configured = vscode.workspace
      .getConfiguration('greedcon')
      .get<number>('request.maxResponseBytes', DEFAULT_LIMITS.maxResponseBodyBytes);
    if (!Number.isFinite(configured)) return DEFAULT_LIMITS.maxResponseBodyBytes;
    return clamp(configured, 1024, 512 * 1024 * 1024);
  }
}
