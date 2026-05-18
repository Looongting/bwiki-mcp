import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupManager } from '../../src/safety/backup.js';

describe('BackupManager', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mw-mcp-backup-test-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应创建备份文件', async () => {
    const backup = new BackupManager(tmpDir);
    const path = await backup.backup('TestPage', 'test content');
    expect(path).toBeTruthy();
    expect(existsSync(path)).toBe(true);
  });

  it('应保存正确的内容', async () => {
    const backup = new BackupManager(tmpDir);
    const path = await backup.backup('AnotherPage', 'hello world');
    const content = readFileSync(path, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('应处理含特殊字符的页面名', async () => {
    const backup = new BackupManager(tmpDir);
    const path = await backup.backup('Template:City/List', 'template content');
    expect(path).toBeTruthy();
    expect(existsSync(path)).toBe(true);
  });
});
