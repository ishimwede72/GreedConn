/**
 * Response formatting helpers used by the webview and the CLI-ish commands:
 * pretty-printing, binary summaries and size/time rendering.
 */
import { formatJson, parseJson } from '../utils/JsonUtils';
import { formatBytes, formatDuration } from '../utils/DateUtils';

export interface FormatResult {
  text: string;
  changed: boolean;
  ok: boolean;
  error?: string;
}

/** Pretty-print JSON or XML responses; other types pass through. */
export function formatResponseBody(body: string, contentType: string, kind: string): FormatResult {
  if (kind === 'json' || contentType.toLowerCase().includes('json')) {
    try {
      const formatted = formatJson(body, 2);
      return { text: formatted, changed: formatted !== body, ok: true };
    } catch (error) {
      return {
        text: body,
        changed: false,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (kind === 'xml' || contentType.toLowerCase().includes('xml')) {
    const formatted = formatXml(body);
    return { text: formatted, changed: formatted !== body, ok: true };
  }
  return { text: body, changed: false, ok: true };
}

/**
 * Lightweight XML indenter (not a parser): adds newlines/indentation between
 * tags while preserving text content. Safe for well-formed documents and a
 * no-op for malformed input.
 */
export function formatXml(xml: string): string {
  if (!xml.includes('<')) return xml;
  let formatted = '';
  let indent = 0;
  const parts = xml
    .replace(/>\s*</g, '><')
    .split(/(<[^>]+>)/g)
    .filter((p) => p.length > 0);

  for (const part of parts) {
    if (part.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += `${'  '.repeat(indent)}${part}\n`;
    } else if (part.startsWith('<') && part.endsWith('/>')) {
      formatted += `${'  '.repeat(indent)}${part}\n`;
    } else if (part.startsWith('<')) {
      formatted += `${'  '.repeat(indent)}${part}\n`;
      indent += 1;
    } else {
      const text = part.trim();
      if (text.length > 0) {
        formatted += `${'  '.repeat(indent)}${text}\n`;
      }
    }
  }
  return formatted.trimEnd();
}

export function summarizeResponse(response: {
  status: number;
  statusText: string;
  responseTime: number;
  responseSize: number;
}): string {
  return `${response.status} ${response.statusText} · ${formatDuration(response.responseTime)} · ${formatBytes(response.responseSize)}`;
}

/** Truncate a body for previews/history without breaking multi-byte chars. */
export function truncateBody(body: string, maxBytes: number): { body: string; truncated: boolean } {
  const buffer = Buffer.from(body, 'utf8');
  if (buffer.length <= maxBytes) return { body, truncated: false };
  return {
    body: `${buffer.subarray(0, maxBytes).toString('utf8')}\n… [truncated]`,
    truncated: true,
  };
}

export { parseJson };
