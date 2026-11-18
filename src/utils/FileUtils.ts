/**
 * File-system helpers: atomic writes, safe reads and size-capped reads.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/** Write JSON atomically: temp file + rename. */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tmp, payload, 'utf8');
  try {
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Copy a file, returning false when the source does not exist. */
export async function copyIfExists(source: string, destination: string): Promise<boolean> {
  if (!(await pathExists(source))) return false;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  return true;
}

/**
 * Keep at most `keep` rotating backups: file.bak.1 ... file.bak.N (newest = 1).
 */
export async function rotateBackups(filePath: string, keep: number): Promise<void> {
  if (keep <= 0) return;
  for (let i = keep - 1; i >= 1; i -= 1) {
    const from = `${filePath}.bak.${i}`;
    const to = `${filePath}.bak.${i + 1}`;
    if (await pathExists(from)) {
      await fs.rename(from, to);
    }
  }
  const oldest = `${filePath}.bak.${keep + 1}`;
  await fs.rm(oldest, { force: true });
  if (await pathExists(filePath)) {
    await fs.copyFile(filePath, `${filePath}.bak.1`);
  }
}

export async function fileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}
