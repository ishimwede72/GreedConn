/**
 * Request body construction for every supported body type.
 */
import * as fs from 'fs/promises';
import type { RequestBody } from '../types/Request';

export interface BodyBuildResult {
  body: Buffer | null;
  contentType: string | null;
  errors: string[];
}

const MULTIPART_BOUNDARY = '----GreedconBoundary7MA4YWxkTrZu0gW';

export function isMultipartBody(body: RequestBody): boolean {
  return body.type === 'multipart' && (body.multipartParts ?? []).some((p) => p.enabled);
}

/**
 * Build the wire body. Multipart bodies read referenced files from disk;
 * file errors are reported instead of silently sending empty parts.
 */
export async function buildBody(body: RequestBody): Promise<BodyBuildResult> {
  switch (body.type) {
    case 'none':
      return { body: null, contentType: null, errors: [] };

    case 'json': {
      const text = body.text ?? '';
      return {
        body: Buffer.from(text, 'utf8'),
        contentType: body.contentType ?? 'application/json; charset=utf-8',
        errors: [],
      };
    }

    case 'text':
      return {
        body: Buffer.from(body.text ?? '', 'utf8'),
        contentType: body.contentType ?? 'text/plain; charset=utf-8',
        errors: [],
      };

    case 'xml':
      return {
        body: Buffer.from(body.text ?? '', 'utf8'),
        contentType: body.contentType ?? 'application/xml; charset=utf-8',
        errors: [],
      };

    case 'formUrlEncoded': {
      const params = new URLSearchParams();
      for (const row of body.formParams ?? []) {
        if (!row.enabled || !row.key.trim()) continue;
        params.append(row.key.trim(), row.value);
      }
      return {
        body: Buffer.from(params.toString(), 'utf8'),
        contentType: body.contentType ?? 'application/x-www-form-urlencoded; charset=utf-8',
        errors: [],
      };
    }

    case 'multipart':
      return buildMultipart(body);

    default:
      return { body: null, contentType: null, errors: [`Unsupported body type.`] };
  }
}

async function buildMultipart(body: RequestBody): Promise<BodyBuildResult> {
  const errors: string[] = [];
  const chunks: Buffer[] = [];
  const boundary = MULTIPART_BOUNDARY;

  for (const part of body.multipartParts ?? []) {
    if (!part.enabled) continue;
    if (!part.name.trim()) {
      errors.push('Multipart part without a name was skipped.');
      continue;
    }
    if (part.kind === 'file') {
      const filePath = part.value.trim();
      if (!filePath) {
        errors.push(`File part "${part.name}" has no file path.`);
        continue;
      }
      try {
        const content = await fs.readFile(filePath);
        const fileName = part.fileName ?? filePath.split(/[\\/]/).pop() ?? 'file';
        const contentType = part.contentType ?? 'application/octet-stream';
        chunks.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${escapeDisposition(part.name)}"; filename="${escapeDisposition(fileName)}"\r\nContent-Type: ${contentType}\r\n\r\n`,
            'utf8',
          ),
          content,
          Buffer.from('\r\n', 'utf8'),
        );
      } catch (error) {
        errors.push(
          `File part "${part.name}" could not be read: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${escapeDisposition(part.name)}"\r\n\r\n${part.value}\r\n`,
          'utf8',
        ),
      );
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  return {
    body: Buffer.concat(chunks),
    contentType: body.contentType ?? `multipart/form-data; boundary=${boundary}`,
    errors,
  };
}

function escapeDisposition(value: string): string {
  return value.replace(/["\r\n\\]/g, '_');
}

/** Approximate serialized size without building the whole body (for limits). */
export async function estimateBodyBytes(body: RequestBody): Promise<number> {
  if (body.type === 'none') return 0;
  if (body.type === 'formUrlEncoded') {
    return Buffer.byteLength(
      (body.formParams ?? [])
        .filter((p) => p.enabled && p.key.trim())
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&'),
      'utf8',
    );
  }
  if (body.type === 'multipart') {
    let total = 0;
    for (const part of body.multipartParts ?? []) {
      if (!part.enabled) continue;
      total += Buffer.byteLength(part.name, 'utf8') + 64;
      if (part.kind === 'file' && part.value) {
        try {
          const stat = await fs.stat(part.value);
          total += stat.size;
        } catch {
          total += 0;
        }
      } else {
        total += Buffer.byteLength(part.value, 'utf8');
      }
    }
    return total;
  }
  return Buffer.byteLength(body.text ?? '', 'utf8');
}
