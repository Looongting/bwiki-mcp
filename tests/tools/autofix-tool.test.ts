import { describe, it, expect, vi } from 'vitest';
import { autofix } from '../../src/tools/autofix-tool.js';
import type { AppConfig } from '../../src/types.js';

const defaultConfig: AppConfig = {
  wiki: { url: 'https://wiki.example.com', api: 'https://wiki.example.com/api.php' },
  auth: { type: 'bot', username: 'TestBot', password: 'secret' },
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
    auto_backup: true,
    max_edits_per_minute: 10,
  },
  browser: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
  },
};

function mockDeps(overrides: any = {}) {
  return {
    wikiClient: {
      readPage: vi.fn().mockResolvedValue({ title: 'Test', content: '', exists: false, last_revision: 0 }),
      editPage: vi.fn().mockResolvedValue({ success: true, revision: 1, warnings: [] }),
      parseWikitext: vi.fn().mockResolvedValue({ html: '<p>rendered content</p>', categories: [], modules: [], errors: [] }),
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
        dom_snapshot: '',
      }),
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      ...overrides.browserManager,
    },
    config: { ...defaultConfig, ...overrides.config },
  };
}

describe('wiki_autofix 工具', () => {
  it('内容无错误时应返回 clean 状态', async () => {
    const deps = mockDeps();
    const result = await autofix(deps, {
      page: 'TestPage',
      content: 'clean wikitext content',
    });

    expect(result.content[0].text).toContain('通过');
    expect(result.content[0].text).toContain('1/5');
    expect(result.content[0].text).toContain('TestBot/Sandbox/TestPage');
  });

  it('检测到解析错误时应返回 has_issues 状态并提供修复建议', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({ title: 'Test', content: '', exists: false, last_revision: 0 }),
        editPage: vi.fn().mockResolvedValue({ success: true, revision: 2, warnings: [] }),
        parseWikitext: vi.fn().mockResolvedValue({
          html: '<div class="smw-error">SMW query error: Property "Populatio" not found</div>',
          categories: [],
          modules: [],
          errors: [{
            type: 'smw',
            severity: 'error',
            message: 'SMW query error: Property "Populatio" not found',
            context: '<div class="smw-error">...</div>',
            selector: '.smw-error',
          }],
        }),
        ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await autofix(deps, {
      page: 'TestPage',
      content: '[[Category:Cities]] [[Population::>1000000]]',
    });

    const text = result.content[0].text;
    expect(text).toContain('需要修复');
    expect(text).toContain('SMW');
    expect(text).toContain('修复建议');
    expect(text).toContain('属性');
  });

  it('第 1 轮检测到错误时应提示下一轮调用方式', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({ title: 'Test', content: '', exists: false, last_revision: 0 }),
        editPage: vi.fn().mockResolvedValue({ success: true, revision: 3, warnings: [] }),
        parseWikitext: vi.fn().mockResolvedValue({
          html: '<strong class="error">Template error: missing parameter</strong>',
          categories: [],
          modules: [],
          errors: [{
            type: 'template',
            severity: 'error',
            message: 'Template error: missing parameter',
            context: '<strong class="error">...</strong>',
            selector: 'strong.error',
          }],
        }),
        ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await autofix(deps, {
      page: 'TestPage',
      content: '{{Infobox|broken}}',
      iteration: 1,
      max_iterations: 5,
    });

    const text = result.content[0].text;
    expect(text).toContain('iteration');
    expect(text).toContain('2');
  });

  it('迭代次数达到上限时应返回 max_reached', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({ title: 'Test', content: '', exists: false, last_revision: 0 }),
        editPage: vi.fn().mockResolvedValue({ success: true, revision: 4, warnings: [] }),
        parseWikitext: vi.fn().mockResolvedValue({
          html: '<div class="smw-error">still broken</div>',
          categories: [],
          modules: [],
          errors: [{
            type: 'smw',
            severity: 'error',
            message: 'still broken',
            context: '',
            selector: '.smw-error',
          }],
        }),
        ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await autofix(deps, {
      page: 'TestPage',
      content: 'broken content',
      iteration: 5,
      max_iterations: 5,
    });

    expect(result.content[0].text).toContain('最大迭代次数');
  });

  it('超出最大迭代次数应直接返回错误', async () => {
    const deps = mockDeps();
    const result = await autofix(deps, {
      page: 'TestPage',
      content: 'anything',
      iteration: 6,
      max_iterations: 5,
    });

    expect(result.isError).toBe(true);
  });

  it('沙箱编辑失败应返回错误', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({ title: 'Test', content: '', exists: false, last_revision: 0 }),
        editPage: vi.fn().mockResolvedValue({ success: false }),
      },
    });

    const result = await autofix(deps, {
      page: 'TestPage',
      content: 'content',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('沙箱');
  });

  it('浏览器错误应被纳入报告', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({ title: 'Test', content: '', exists: false, last_revision: 0 }),
        editPage: vi.fn().mockResolvedValue({ success: true, revision: 5, warnings: [] }),
        parseWikitext: vi.fn().mockResolvedValue({ html: '<p>ok</p>', categories: [], modules: [], errors: [] }),
        ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
      },
      browserManager: {
        capturePage: vi.fn().mockResolvedValue({
          url: 'https://wiki.example.com/index.php/Test',
          console_entries: [{ level: 'error', text: 'Uncaught TypeError: x is not a function', timestamp: 1 }],
          network_entries: [{ url: 'https://wiki.example.com/bad.js', status: 404, method: 'GET' }],
          page_errors: [{ message: 'Script error', stack: '' }],
          screenshot: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          dom_snapshot: '<div>rendered</div>',
        }),
      },
    });

    const result = await autofix(deps, {
      page: 'TestPage',
      content: 'content with browser issues',
    });

    const text = result.content[0].text;
    expect(text).toContain('TypeError');
    expect(text).toContain('404');
  });
});
