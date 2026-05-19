import { describe, it, expect, vi } from 'vitest';
import { edit } from '../../src/tools/edit-tool.js';
import type { AppConfig } from '../../src/types.js';

const defaultConfig: AppConfig = {
  wiki: { url: 'https://wiki.example.com', api: 'https://wiki.example.com/api.php' },
  auth: { type: 'bot', username: 'TestBot', password: 'secret' },
  validation: { screenshot: true, console_errors: true, network_errors: true, smw_errors: true, wait_after_load: 1000, custom_rules: [], console_ignore: [] },
  safety: { sandbox_first: true, sandbox_page: 'User:${username}/Sandbox', auto_backup: true, max_edits_per_minute: 10 },
  browser: { headless: true, viewport: { width: 1280, height: 720 }, locale: 'en' },
};

function mockDeps(overrides: any = {}) {
  return {
    wikiClient: {
      readPage: vi.fn().mockResolvedValue({ title: 'Test', content: 'old content', exists: true, last_revision: 1 }),
      editPage: vi.fn().mockResolvedValue({ success: true, revision: 10, warnings: [] }),
      ...overrides.wikiClient,
    },
    browserManager: overrides.browserManager ?? {},
    config: { ...defaultConfig, ...overrides.config },
  };
}

describe('wiki_edit 工具', () => {
  it('正常编辑应返回成功信息', async () => {
    const deps = mockDeps();
    const result = await edit(deps, { page: 'TestPage', content: 'new content', summary: 'update' });

    expect(result.content[0].text).toContain('TestBot/Sandbox/TestPage');
    expect(result.content[0].text).toContain('10');
    expect(deps.wikiClient.editPage).toHaveBeenCalledOnce();
  });

  it('dry_run 应返回差异预览而不实际编辑', async () => {
    const deps = mockDeps();
    const result = await edit(deps, { page: 'TestPage', content: 'new content', dry_run: true });

    expect(result.content[0].text).toContain('差异预览');
    expect(result.content[0].text).toContain('Dry Run');
    expect(deps.wikiClient.editPage).not.toHaveBeenCalled();
  });

  it('sandbox=false 时应直接编辑原页面', async () => {
    const deps = mockDeps({
      config: { safety: { ...defaultConfig.safety, sandbox_first: false } },
    });
    const result = await edit(deps, { page: 'TestPage', content: 'new content', sandbox: false });

    expect(result.content[0].text).toContain('TestPage');
    expect(result.content[0].text).not.toContain('Sandbox');
  });

  it('sandbox=false 但 sandbox_first=true 时应走沙箱', async () => {
    const deps = mockDeps();
    const result = await edit(deps, { page: 'TestPage', content: 'new content' });

    expect(result.content[0].text).toContain('Sandbox');
  });

  it('编辑失败应返回错误', async () => {
    const deps = mockDeps({
      wikiClient: { editPage: vi.fn().mockResolvedValue({ success: false, warnings: [] }) },
    });
    const result = await edit(deps, { page: 'TestPage', content: 'new content', sandbox: false });

    expect(result.isError).toBe(true);
  });

  it('auto_backup 应读取原内容', async () => {
    const readPage = vi.fn().mockResolvedValue({ title: 'Test', content: 'old backup content', exists: true, last_revision: 5 });
    const deps = mockDeps({ wikiClient: { readPage, editPage: vi.fn().mockResolvedValue({ success: true, revision: 11, warnings: [] }) } });
    await edit(deps, { page: 'TestPage', content: 'new', sandbox: false });

    expect(readPage).toHaveBeenCalled();
  });
});
