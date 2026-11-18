/**
 * Network error translation: raw transport errors -> structured, user facing
 * errors that never contain credentials.
 */
import { describeNetworkError, NormalizedError } from '../utils/ErrorUtils';
import { redactString } from '../utils/Logger';

export interface ClassifiedError extends NormalizedError {
  /** Category used by the UI for icon/color selection. */
  category: 'timeout' | 'cancelled' | 'dns' | 'tls' | 'connection' | 'http' | 'size' | 'unknown';
}

export function classifyNetworkError(error: unknown): ClassifiedError {
  const normalized = describeNetworkError(error);
  const code = normalized.code;

  let category: ClassifiedError['category'] = 'unknown';
  if (code === 'ABORT_ERR') category = 'cancelled';
  else if (code === 'ETIMEDOUT' || normalized.message.toLowerCase().includes('timed out'))
    category = 'timeout';
  else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') category = 'dns';
  else if (
    /CERT|TLS|SSL|SELF_SIGNED/i.test(code) ||
    /certificate|tls|ssl/i.test(normalized.message)
  )
    category = 'tls';
  else if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE'].includes(code))
    category = 'connection';
  else if (code === 'RESPONSE_TOO_LARGE' || code === 'MAX_BODY') category = 'size';

  return { ...normalized, category, message: redactString(normalized.message) };
}

/** Build an error for HTTP status codes (kept distinct from transport errors). */
export function httpStatusError(status: number, statusText: string): ClassifiedError {
  return {
    code: `HTTP_${status}`,
    message: `Server responded with ${status}${statusText ? ` ${statusText}` : ''}.`,
    category: 'http',
  };
}

export function isTimeoutError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT';
}

export function isCancellationError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const name = (error as { name?: string })?.name;
  return code === 'ABORT_ERR' || name === 'AbortError';
}
