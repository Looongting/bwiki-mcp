import { vi } from 'vitest';
import type { AppConfig, SiteConfig } from '../src/types.js';

/**
 * 新版多站点 AppConfig 的默认值，供测试使用。
 * 与旧版不同，不再有顶层 wiki/auth，改为 default_site + sites 映射。
 */
export function makeDefaultConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    default_site: 'test',
    sites: {
      test: {
        url: 'https://wiki.example.com',
        api: 'https://wiki.example.com/api.php',
        auth: { type: 'bot', username: 'TestBot@bwiki', password: 'secret' },
      },
    },
    validation: {
      screenshot: true,
      console_errors: true,
      network_errors: true,
      smw_errors: true,
      wait_after_load: 1000,
      custom_rules: [],
      console_ignore: [],
    },
    safety: {
      sandbox_first: true,
      sandbox_page: 'User:${username}/Sandbox',
      auto_backup: false,
      max_edits_per_minute: 10,
    },
    browser: {
      headless: true,
      viewport: { width: 1280, height: 720 },
      locale: 'en',
    },
    ...overrides,
    // 深度合并 sites（避免被顶层 partial 整体覆盖）
    sites: {
      test: {
        url: 'https://wiki.example.com',
        api: 'https://wiki.example.com/api.php',
        auth: { type: 'bot', username: 'TestBot@bwiki', password: 'secret' },
        ...(overrides.sites?.test ?? {}),
      },
    },
  };
}

/**
 * 创建一个模拟的 WikiClient，包含所有常用方法。
 * 每个方法都返回合理的默认值，测试可按需覆盖。
 */
export function makeMockWikiClient(overrides: Record<string, any> = {}) {
  return {
    readPage: vi.fn().mockResolvedValue({
      title: 'Test',
      content: 'old content',
      exists: true,
      last_revision: 1,
    }),
    editPage: vi.fn().mockResolvedValue({
      success: true,
      revision: 10,
      warnings: [],
    }),
    parseWikitext: vi.fn().mockResolvedValue({
      html: '<p>ok</p>',
      categories: [],
      modules: [],
      errors: [],
    }),
    searchPages: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([
      { revision: 2, timestamp: '2026-05-31T00:00:00Z', user: 'TestBot', comment: 'test', minor: false },
    ]),
    revertPage: vi.fn().mockResolvedValue({ success: true }),
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * 创建符合新版 ToolDependencies 接口的 mock deps。
 *
 * 返回对象包含 wikiClientManager（非 wikiClient）、browserManager 和 config。
 * wikiClientManager.getClient() 返回模拟的 WikiClient 实例，
 * wikiClientManager.getSiteConfig() 返回对应站点的 SiteConfig。
 *
 * @param overrides.wikiClient - 覆盖模拟 WikiClient 的方法
 * @param overrides.browserManager - 覆盖 browserManager
 * @param overrides.config - 覆盖 config（深度合并到默认值）
 */
export function mockDeps(overrides: {
  wikiClient?: Record<string, any>;
  browserManager?: Record<string, any>;
  config?: Partial<AppConfig>;
} = {}) {
  const config = makeDefaultConfig(overrides.config ?? {});
  const mockClient = makeMockWikiClient(overrides.wikiClient ?? {});

  return {
    wikiClientManager: {
      getClient: vi.fn().mockReturnValue(mockClient),
      getSiteConfig: vi.fn().mockReturnValue(config.sites.test),
      defaultSite: 'test',
      allSites: ['test'],
    },
    browserManager: overrides.browserManager ?? {},
    config,
  };
}
