/**
 * Temp-directory helpers for integration tests.
 *
 * Every directory created through `createTempDir()` is tracked and removed
 * by `cleanupTempDirs()` (called from `afterAll`), so tests never leave
 * artifacts behind in the OS temp directory.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const created: string[] = [];

/** Create a fresh temp directory under `os.tmpdir()`. */
export async function createTempDir(prefix = 'greedcon-it-'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Remove every directory created so far (missing dirs are ignored). */
export async function cleanupTempDirs(): Promise<void> {
  const dirs = created.splice(0, created.length);
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
}
