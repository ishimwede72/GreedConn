/**
 * BackupManager — explicit user-facing backup/restore of the data directory.
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { copyIfExists, pathExists, readTextIfExists } from '../utils/FileUtils';
import { logger } from '../utils/Logger';

const DATA_FILES = [
  'collections.json',
  'environments.json',
  'history.json',
  'settings.json',
  'testRuns.json',
] as const;

export class BackupManager {
  constructor(private readonly directory: string) {}

  /**
   * Create a timestamped snapshot of all data files.
   * Returns the snapshot directory path.
   */
  async createSnapshot(label = 'manual'): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = path.join(this.directory, 'backups', `${stamp}_${label}`);
    await fs.mkdir(snapshotDir, { recursive: true });
    let copied = 0;
    for (const file of DATA_FILES) {
      const ok = await copyIfExists(path.join(this.directory, file), path.join(snapshotDir, file));
      if (ok) copied += 1;
    }
    logger.info(`created backup snapshot with ${copied} file(s) at ${snapshotDir}`);
    return snapshotDir;
  }

  listSnapshots(): Promise<string[]> {
    return fs
      .readdir(path.join(this.directory, 'backups'), { withFileTypes: true })
      .then((entries) => entries.filter((e) => e.isDirectory()).map((e) => e.name))
      .catch(() => []);
  }

  /** Restore every file present in the snapshot (overwrites current files). */
  async restoreSnapshot(name: string): Promise<string[]> {
    const snapshotDir = path.join(this.directory, 'backups', name);
    if (!(await pathExists(snapshotDir))) {
      throw new Error(`Backup snapshot "${name}" does not exist.`);
    }
    // Safety snapshot of the current state before overwriting.
    await this.createSnapshot('pre-restore');
    const restored: string[] = [];
    for (const file of DATA_FILES) {
      const source = path.join(snapshotDir, file);
      if (await pathExists(source)) {
        await fs.copyFile(source, path.join(this.directory, file));
        restored.push(file);
      }
    }
    logger.info(`restored ${restored.length} file(s) from snapshot ${name}`);
    return restored;
  }

  async readDataFile(file: string): Promise<string | null> {
    return readTextIfExists(path.join(this.directory, file));
  }
}
