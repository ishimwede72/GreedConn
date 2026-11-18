/**
 * Error normalization helpers. Never leak secrets through messages.
 */

import { redactString } from './Logger';

export interface NormalizedError {
  code: string;
  message: string;
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  return new Error(String(value));
}

export function normalizeError(value: unknown, fallbackCode = 'UNKNOWN'): NormalizedError {
  const error = toError(value);
  return {
    code: (error as { code?: string }).code ?? fallbackCode,
    message: redactString(error.message || 'Unknown error'),
  };
}

export class GreedconError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'GreedconError';
    this.code = code;
    this.details = details;
  }
}

export function isGreedconError(value: unknown): value is GreedconError {
  return value instanceof GreedconError;
}

/** Convert Node-style network errors into friendly, actionable messages. */
export function describeNetworkError(error: unknown): NormalizedError {
  const err = error as NodeJS.ErrnoException & { code?: string };
  const code = typeof err?.code === 'string' ? err.code : 'NETWORK_ERROR';
  const message = err?.message ?? String(error);

  const known: Record<string, string> = {
    ENOTFOUND: 'DNS lookup failed — the host name could not be resolved.',
    EAI_AGAIN: 'DNS lookup failed temporarily — check your network connection.',
    ECONNREFUSED: 'Connection refused — the server actively rejected the connection.',
    ECONNRESET: 'Connection reset by peer — the server closed the connection.',
    EHOSTUNREACH: 'Host unreachable — the server could not be reached.',
    ETIMEDOUT: 'Network timeout — the connection could not be established in time.',
    CERT_HAS_EXPIRED: 'TLS certificate has expired.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate could not be verified (self-signed?).',
    DEPTH_ZERO_SELF_SIGNED_CERT:
      'TLS certificate is self-signed. Enable "Validate SSL" exceptions for local servers.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate hostname mismatch.',
    EPROTO: 'TLS/protocol error during the connection.',
    ABORT_ERR: 'Request cancelled.',
  };

  return {
    code,
    message: known[code] ?? redactString(message),
  };
}
