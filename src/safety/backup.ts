import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

export class BackupManager {
  constructor(private backupDir: string) {}

  async backup(originalPage: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = originalPage.replace(/[/\\:]/g, '_');
    const dir = join(this.backupDir, safeName);

    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${timestamp}.txt`);
    await writeFile(filePath, content, 'utf-8');

    logger.info(`Backup saved: ${filePath}`);
    return filePath;
  }
}
