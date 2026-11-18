/**
 * configuration.ts — reads VS Code configuration into a plain object used by
 * services (kept separate so tests can stub it).
 */
import * as vscode from 'vscode';

export interface GreedconConfiguration {
  request: {
    timeout: number;
    maxResponseBytes: number;
    maxRedirects: number;
    validateSsl: boolean;
  };
  security: {
    allowPrivateNetwork: boolean;
    allowHttpsToHttpRedirect: boolean;
  };
  history: {
    enabled: boolean;
    limit: number;
    storeResponseBody: boolean;
  };
  storage: {
    autoBackup: boolean;
  };
  logging: {
    level: string;
  };
}

let cached: GreedconConfiguration | null = null;

export function readConfiguration(): GreedconConfiguration {
  const config = vscode.workspace.getConfiguration('greedcon');
  cached = {
    request: {
      timeout: config.get<number>('request.timeout', 30000),
      maxResponseBytes: config.get<number>('request.maxResponseBytes', 10 * 1024 * 1024),
      maxRedirects: config.get<number>('request.maxRedirects', 5),
      validateSsl: config.get<boolean>('request.validateSsl', true),
    },
    security: {
      allowPrivateNetwork: config.get<boolean>('security.allowPrivateNetwork', true),
      allowHttpsToHttpRedirect: config.get<boolean>('security.allowHttpsToHttpRedirect', false),
    },
    history: {
      enabled: config.get<boolean>('history.enabled', true),
      limit: config.get<number>('history.limit', 200),
      storeResponseBody: config.get<boolean>('history.storeResponseBody', true),
    },
    storage: {
      autoBackup: config.get<boolean>('storage.autoBackup', true),
    },
    logging: {
      level: config.get<string>('logging.level', 'info'),
    },
  };
  return cached;
}

export function getCachedConfiguration(): GreedconConfiguration {
  return cached ?? readConfiguration();
}

/** Refresh the cache (called on activation and configuration changes). */
export function applyConfiguration(): GreedconConfiguration {
  return readConfiguration();
}
