import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync } from 'node:fs';

// 模拟 node:fs 模块，使 .env 文件不会被加载
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const originalExistsSync = actual.existsSync;
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation((path: any) => {
      if (typeof path === 'string' && path.endsWith('.env')) {
        return false; // 测试期间不加载任何 .env 文件
      }
      return originalExistsSync(path);
    }),
  };
});

describe('配置加载', () => {
  afterEach(() => {
    // 清除测试中设置的 MW_* 环境变量
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MW_') || ['BOT_NAME', 'BOT_PASSWORD', 'WIKI_URL', 'WIKI_API'].includes(key)) {
        delete process.env[key];
      }
    }
  });

  it('设置 MW_URL 时应从环境变量加载配置', async () => {
    process.env['MW_URL'] = 'https://wiki.example.com';
    process.env['MW_USERNAME'] = 'TestBot';
    process.env['MW_PASSWORD'] = 'testpass';

    const { loadConfig } = await import('../src/config.js');
    const config = await loadConfig();

    expect(config.wiki.url).toBe('https://wiki.example.com');
    expect(config.wiki.api).toBe('https://wiki.example.com/api.php');
    expect(config.auth.type).toBe('bot');
    expect(config.validation.screenshot).toBe(true);
  });

  it('应从 Wiki URL 自动推导 api.php', async () => {
    process.env['MW_URL'] = 'https://wiki.example.com';
    process.env['MW_USERNAME'] = 'TestBot';
    process.env['MW_PASSWORD'] = 'testpass';

    const { loadConfig } = await import('../src/config.js');
    const config = await loadConfig();

    expect(config.wiki.api).toBe('https://wiki.example.com/api.php');
  });

  it('应尊重显式设置的 MW_API', async () => {
    process.env['MW_URL'] = 'https://wiki.example.com';
    process.env['MW_API'] = 'https://wiki.example.com/w/api.php';
    process.env['MW_USERNAME'] = 'TestBot';
    process.env['MW_PASSWORD'] = 'testpass';

    const { loadConfig } = await import('../src/config.js');
    const config = await loadConfig();

    expect(config.wiki.api).toBe('https://wiki.example.com/w/api.php');
  });
});
