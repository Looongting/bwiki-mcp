import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listWikis } from '../../src/tools/list-wikis-tool.js';

// Mock fetchWithRetry
vi.mock('../../src/utils/network.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from '../../src/utils/network.js';

function makeDeps(overrides: {
  sites?: Record<string, any>;
  defaultSite?: string;
  authMode?: string;
} = {}) {
  const sites = overrides.sites ?? {
    wiki1: {
      url: 'https://wiki1.example.com',
      api: 'https://wiki1.example.com/api.php',
      bot: { username: 'Bot1', password: 'p1' },
    },
    wiki2: {
      url: 'https://wiki2.example.com',
      api: 'https://wiki2.example.com/api.php',
      bot: { username: 'Bot2', password: 'p2' },
    },
  };

  const siteKeys = Object.keys(sites);
  const defaultSite = overrides.defaultSite ?? siteKeys[0] ?? 'wiki1';

  return {
    wikiClientManager: {
      getSiteConfig: vi.fn((key: string) => {
        const cfg = sites[key];
        if (!cfg) throw new Error(`Unknown site: "${key}"`);
        return cfg;
      }),
      defaultSite,
      allSites: siteKeys,
    },
    browserManager: {} as any,
    config: { auth_mode: overrides.authMode ?? 'bot' } as any,
  };
}

describe('wiki_list_wikis 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('列出所有已配置的站点（不检查连通性）', async () => {
    const deps = makeDeps();

    const result = await listWikis(deps, { check: false });

    expect(result.content[0].text).toContain('wiki1');
    expect(result.content[0].text).toContain('wiki2');
    expect(result.content[0].text).toContain('共 2 个站点');
    expect(result.content[0].text).toContain('⭐默认');
    // 不应包含状态检查信息
    expect(result.content[0].text).toContain('未检查');
  });

  it('默认执行连通性检查', async () => {
    const deps = makeDeps();

    const mockResponse = {
      json: vi.fn().mockResolvedValue({
        query: { general: { sitename: 'TestWiki', generator: 'MediaWiki 1.39' } },
      }),
    };
    vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as any);

    const result = await listWikis(deps, {});

    expect(result.content[0].text).toContain('连通性');
    expect(result.content[0].text).toContain('在线');
    expect(fetchWithRetry).toHaveBeenCalledTimes(2);
    // 验证 API URL 格式
    const calls = vi.mocked(fetchWithRetry).mock.calls;
    expect(calls[0][0]).toContain('action=query&meta=siteinfo');
    expect(calls[0][0]).toContain('formatversion=2');
  });

  it('check: true 明确执行连通性检查', async () => {
    const deps = makeDeps();

    const mockResponse = {
      json: vi.fn().mockResolvedValue({
        query: { general: { sitename: 'Wiki1' } },
      }),
    };
    vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as any);

    const result = await listWikis(deps, { check: true });

    expect(result.content[0].text).toContain('在线');
    expect(fetchWithRetry).toHaveBeenCalled();
  });

  it('API 不可达时标记为 offline', async () => {
    const deps = makeDeps({
      sites: {
        badwiki: {
          url: 'https://bad.example.com',
          api: 'https://bad.example.com/api.php',
          bot: { username: 'B', password: 'p' },
        },
      },
    });

    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('fetch failed'));

    const result = await listWikis(deps, { check: true });

    expect(result.content[0].text).toContain('离线');
    expect(result.content[0].text).toContain('不可达');
    expect(result.content[0].text).toContain('0 在线');
  });

  it('API 可达但响应异常时标记为 error', async () => {
    const deps = makeDeps({
      sites: {
        weird: {
          url: 'https://weird.example.com',
          api: 'https://weird.example.com/api.php',
          bot: { username: 'W', password: 'p' },
        },
      },
    });

    const mockResponse = {
      json: vi.fn().mockResolvedValue({ query: {} }),
    };
    vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as any);

    const result = await listWikis(deps, { check: true });

    expect(result.content[0].text).toContain('异常');
    expect(result.content[0].text).toContain('未返回预期数据');
  });

  it('标记默认站点', async () => {
    const deps = makeDeps({
      sites: {
        primary: {
          url: 'https://primary.example.com',
          api: 'https://primary.example.com/api.php',
          bot: { username: 'P', password: 'p' },
        },
        secondary: {
          url: 'https://secondary.example.com',
          api: 'https://secondary.example.com/api.php',
          bot: { username: 'S', password: 'p' },
        },
      },
      defaultSite: 'primary',
    });

    const mockResponse = {
      json: vi.fn().mockResolvedValue({
        query: { general: { sitename: 'TestWiki', generator: 'MediaWiki 1.39' } },
      }),
    };
    vi.mocked(fetchWithRetry).mockResolvedValue(mockResponse as any);

    const result = await listWikis(deps, {});

    expect(result.content[0].text).toContain('⭐默认');
    // 验证 primary 标记了默认
    const text = result.content[0].text;
    const primaryIndex = text.indexOf('primary');
    const secondaryIndex = text.indexOf('secondary');
    const defaultIndex = text.indexOf('⭐默认');
    // 默认标记应出现在 primary 行附近
    expect(defaultIndex).toBeGreaterThan(primaryIndex);
    expect(defaultIndex).toBeLessThan(secondaryIndex);
  });

  it('单个站点也正常显示', async () => {
    const deps = makeDeps({
      sites: {
        solo: {
          url: 'https://solo.example.com',
          api: 'https://solo.example.com/api.php',
          bot: { username: 'Sol', password: 'p' },
        },
      },
    });

    const result = await listWikis(deps, { check: false });

    expect(result.content[0].text).toContain('solo');
    expect(result.content[0].text).toContain('共 1 个站点');
  });

  it('返回全局 auth_mode 信息', async () => {
    const deps = makeDeps({
      sites: {
        botwiki: {
          url: 'https://bot.example.com',
          api: 'https://bot.example.com/api.php',
          bot: { username: 'B', password: 'p' },
        },
      },
      authMode: 'cookie',
    });

    const result = await listWikis(deps, { check: false });

    const text = result.content[0].text;
    expect(text).toContain('认证方式: cookie');
  });

  it('连通性汇总统计应准确', async () => {
    const deps = makeDeps({
      sites: {
        online1: {
          url: 'https://o1.example.com',
          api: 'https://o1.example.com/api.php',
          bot: { username: 'O1', password: 'p' },
        },
        online2: {
          url: 'https://o2.example.com',
          api: 'https://o2.example.com/api.php',
          bot: { username: 'O2', password: 'p' },
        },
        offline1: {
          url: 'https://f1.example.com',
          api: 'https://f1.example.com/api.php',
          bot: { username: 'F1', password: 'p' },
        },
      },
    });

    let callCount = 0;
    vi.mocked(fetchWithRetry).mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          json: async () => ({ query: { general: { sitename: 'Online', generator: 'MW 1.39' } } }),
        } as any;
      }
      throw new Error('offline');
    });

    const result = await listWikis(deps, { check: true });

    expect(result.content[0].text).toContain('2 在线');
    expect(result.content[0].text).toContain('1 离线');
    expect(result.content[0].text).toContain('0 异常');
  });
});
