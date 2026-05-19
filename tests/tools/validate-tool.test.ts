import { describe, it, expect, vi } from 'vitest';
import { validate } from '../../src/tools/validate-tool.js';
import type { AppConfig } from '../../src/types.js';

const defaultConfig: AppConfig = {
  wiki: { url: 'https://wiki.example.com', api: 'https://wiki.example.com/api.php' },
  auth: { type: 'bot', username: 'Bot', password: 'pwd' },
  validation: { screenshot: true, console_errors: true, network_errors: true, smw_errors: true, wait_after_load: 1000, custom_rules: [], console_ignore: [] },
  safety: { sandbox_first: true, sandbox_page: 'User:${username}/Sandbox', auto_backup: false, max_edits_per_minute: 10 },
  browser: { headless: true, viewport: { width: 1280, height: 720 }, locale: 'en' },
};

function mockDeps(overrides: any = {}) {
  return {
    wikiClient: {
      parseWikitext: vi.fn().mockResolvedValue({ html: '<p>ok</p>', categories: [], modules: [], errors: [] }),
      ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      ...overrides.wikiClient,
    },
    browserManager: {
      capturePage: vi.fn().mockResolvedValue({
        url: 'https://wiki.example.com/index.php/Test',
        console_entries: [],
        network_entries: [],
        page_errors: [],
        screenshot: undefined,
        dom_snapshot: '<div>rendered</div>',
      }),
      ...overrides.browserManager,
    },
    config: { ...defaultConfig, ...overrides.config },
  };
}

describe('wiki_validate 工具', () => {
  it('页面验证通过时应返回摘要', async () => {
    const deps = mockDeps();
    const result = await validate(deps, { page: 'CleanPage' });

    const text = result.content[0].text;
    expect(text).toContain('通过');
    expect(text).toContain('验证摘要');
  });

  it('内联文本验证应使用 text 参数', async () => {
    const deps = mockDeps();
    const result = await validate(deps, { text: '{{Test}}' });

    expect(result.content[0].text).toContain('验证摘要');
    expect(deps.wikiClient.parseWikitext).toHaveBeenCalledWith(undefined, '{{Test}}');
  });

  it('缺参数时应返回错误', async () => {
    const deps = mockDeps();
    const result = await validate(deps, {} as any);

    expect(result.isError).toBe(true);
  });

  it('解析错误应出现在报告中', async () => {
    const deps = mockDeps({
      wikiClient: {
        parseWikitext: vi.fn().mockResolvedValue({
          html: '<div class="smw-error">Property not found</div>',
          categories: [],
          modules: [],
          errors: [{ type: 'smw', severity: 'error', message: 'Property not found', context: '', selector: '.smw-error' }],
        }),
      },
    });

    const result = await validate(deps, { page: 'BadPage' });
    expect(result.content[0].text).toContain('Property not found');
  });

  it('浏览器错误应被捕获', async () => {
    const deps = mockDeps({
      browserManager: {
        capturePage: vi.fn().mockResolvedValue({
          url: 'https://wiki.example.com/index.php/Test',
          console_entries: [{ level: 'error', text: 'TypeError: x is undefined', timestamp: 1 }],
          network_entries: [],
          page_errors: [],
          screenshot: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          dom_snapshot: '<div>ok</div>',
        }),
      },
    });

    const result = await validate(deps, { page: 'Test' });
    expect(result.content[0].text).toContain('TypeError');
  });

  it('浏览器捕获失败不应中断验证流程', async () => {
    const deps = mockDeps({
      browserManager: {
        capturePage: vi.fn().mockRejectedValue(new Error('Browser crashed')),
      },
    });

    const result = await validate(deps, { page: 'Test' });
    expect(result.content[0].text).toContain('验证摘要');
  });
});
