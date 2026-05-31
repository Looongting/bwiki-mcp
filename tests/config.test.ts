import { describe, it, expect, vi, afterEach } from 'vitest';

// 模拟 node:fs/promises 以提供虚拟配置文件
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined), // 假装文件存在
    readFile: vi.fn().mockResolvedValue(''),
  };
});

// 模拟 node:fs 以阻止 .env 文件加载
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const originalExistsSync = actual.existsSync;
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation((path: any) => {
      if (typeof path === 'string' && path.endsWith('.env')) {
        return false;
      }
      return originalExistsSync(path);
    }),
  };
});

import { readFile } from 'node:fs/promises';

describe('配置加载', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // 清除测试中设置的 MW_* 环境变量
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MW_') || ['BOT_NAME', 'BOT_PASSWORD', 'WIKI_URL', 'WIKI_API'].includes(key)) {
        delete process.env[key];
      }
    }
  });

  it('应从 YAML 配置文件加载站点信息', async () => {
    // 模拟 returnValue 覆盖 mockResolvedValue
    vi.mocked(readFile).mockResolvedValue(`
default_site: mysite
sites:
  mysite:
    url: https://wiki.example.com
    auth:
      type: bot
      username: TestBot
      password: testpass
`);

    const { loadConfig } = await import('../src/config.js');
    const config = await loadConfig();

    expect(config.default_site).toBe('mysite');
    expect(config.sites.mysite.url).toBe('https://wiki.example.com');
    expect(config.sites.mysite.api).toBe('https://wiki.example.com/api.php');
    expect(config.sites.mysite.auth.type).toBe('bot');
    expect(config.validation.screenshot).toBe(true);
  });

  it('应从 Wiki URL 自动推导 api.php', async () => {
    vi.mocked(readFile).mockResolvedValue(`
default_site: mywiki
sites:
  mywiki:
    url: https://wiki.example.com
    auth:
      type: bot
      username: TestBot
      password: testpass
`);

    const { loadConfig } = await import('../src/config.js');
    const config = await loadConfig();

    expect(config.sites.mywiki.api).toBe('https://wiki.example.com/api.php');
  });

  it('应尊重显式设置的 MW_API（api 字段）', async () => {
    vi.mocked(readFile).mockResolvedValue(`
default_site: mywiki
sites:
  mywiki:
    url: https://wiki.example.com
    api: https://wiki.example.com/w/api.php
    auth:
      type: bot
      username: TestBot
      password: testpass
`);

    const { loadConfig } = await import('../src/config.js');
    const config = await loadConfig();

    expect(config.sites.mywiki.api).toBe('https://wiki.example.com/w/api.php');
  });
});
