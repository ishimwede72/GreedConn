/**
 * Input sanitization for strings crossing the webview boundary.
 *
 * The webview is an untrusted boundary: even though it is our own UI, any
 * script running inside it (or a crafted message) must not be able to inject
 * markup or oversized payloads into the extension host.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface SanitizeOptions {
  maxLength?: number;
  allowControlChars?: boolean;
  trim?: boolean;
}

export function sanitizeText(value: unknown, options: SanitizeOptions = {}): string {
  const { maxLength = 100_000, allowControlChars = false, trim = false } = options;
  if (typeof value !== 'string') return '';
  let result = allowControlChars ? value : value.replace(CONTROL_CHARS, '');
  if (trim) result = result.trim();
  if (result.length > maxLength) result = result.slice(0, maxLength);
  return result;
}

export function sanitizeMultiline(value: unknown, maxLength = 5_000_000): string {
  if (typeof value !== 'string') return '';
  // Preserve newlines/tabs but strip other control characters.
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Escape text for safe interpolation into HTML (used only in places where we
 * build HTML strings; DOM nodes use `textContent` instead).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip characters that are dangerous in file names. */
export function sanitizeFileName(name: string, fallback = 'export'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : fallback;
}

/** Ensure a string used as an object key cannot pollute prototypes. */
export function safeKey(key: string): string {
  return key === '__proto__' || key === 'constructor' || key === 'prototype' ? `_${key}` : key;
}
