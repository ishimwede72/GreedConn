/**
 * API key authentication with header / query / cookie placement.
 */
import type { ApiKeyPlacement } from '../types/Request';

export interface ApiKeyTarget {
  headers: Record<string, string>;
  query?: URLSearchParams;
  cookies?: string[];
}

export function applyApiKey(
  placement: ApiKeyPlacement,
  key: string,
  value: string,
  target: ApiKeyTarget,
): void {
  if (!key.trim()) {
    throw new Error('API key name is required.');
  }
  if (!value) {
    throw new Error('API key value is required.');
  }
  switch (placement) {
    case 'header':
      target.headers[key.trim().toLowerCase()] = value;
      break;
    case 'query':
      target.query?.append(key.trim(), value);
      break;
    case 'cookie':
      target.cookies = [...(target.cookies ?? []), `${key.trim()}=${value}`];
      break;
    default:
      throw new Error(`Unsupported API key placement "${String(placement)}".`);
  }
}
