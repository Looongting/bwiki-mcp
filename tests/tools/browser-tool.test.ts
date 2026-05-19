import { describe, it, expect, vi } from 'vitest';
import { capture } from '../../src/tools/browser-tool.js';
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
    wikiClient: overrides.wikiClient ?? {},
    browserManager: {
      capturePage: vi.fn().mockResolvedValue({
        url: 'https://wiki.example.com/index.php/TestPage',
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

describe('wiki_browser_capture 工具', () => {
  it('页面标题应拼接为完整 URL', async () => {
    const deps = mockDeps();
    await capture(deps, { page: 'TestPage' });

    expect(deps.browserManager.capturePage).toHaveBeenCalledWith(
      'https://wiki.example.com/index.php?title=TestPage',
      expect.any(Object)
    );
  });

  it('完整 URL 应直接使用', async () => {
    const deps = mockDeps();
    await capture(deps, { page: 'https://other.wiki.com/Page' });

    expect(deps.browserManager.capturePage).toHaveBeenCalledWith(
      'https://other.wiki.com/Page',
      expect.any(Object)
    );
  });

  it('未检测到错误时应返回通过信息', async () => {
    const deps = mockDeps();
    const result = await capture(deps, { page: 'TestPage' });

    expect(result.content[0].text).toContain('未检测到浏览器错误');
  });

  it('控制台错误应被列出', async () => {
    const deps = mockDeps({
      browserManager: {
        capturePage: vi.fn().mockResolvedValue({
          url: 'https://wiki.example.com/index.php/Test',
          console_entries: [
            { level: 'error', text: 'Error: loading failed', timestamp: 1 },
            { level: 'warning', text: 'deprecated API', timestamp: 2 },
          ],
          network_entries: [],
          page_errors: [],
          screenshot: undefined,
          dom_snapshot: '',
        }),
      },
    });

    const result = await capture(deps, { page: 'Test' });
    expect(result.content[0].text).toContain('loading failed');
  });

  it('网络错误应被列出', async () => {
    const deps = mockDeps({
      browserManager: {
        capturePage: vi.fn().mockResolvedValue({
          url: 'https://wiki.example.com/index.php/Test',
          console_entries: [],
          network_entries: [{ url: 'https://wiki.example.com/fail.js', status: 404, method: 'GET' }],
          page_errors: [],
          screenshot: undefined,
          dom_snapshot: '',
        }),
      },
    });

    const result = await capture(deps, { page: 'Test' });
    expect(result.content[0].text).toContain('404');
    expect(result.content[0].text).toContain('fail.js');
  });

  it('页面 JS 错误应被列出', async () => {
    const deps = mockDeps({
      browserManager: {
        capturePage: vi.fn().mockResolvedValue({
          url: 'https://wiki.example.com/index.php/Test',
          console_entries: [],
          network_entries: [],
          page_errors: [{ message: 'Uncaught ReferenceError: x is not defined', stack: 'at line 1' }],
          screenshot: undefined,
          dom_snapshot: '',
        }),
      },
    });

    const result = await capture(deps, { page: 'Test' });
    expect(result.content[0].text).toContain('ReferenceError');
  });
});
