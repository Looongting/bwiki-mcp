import { describe, it, expect, vi } from 'vitest';
import { revert } from '../../src/tools/revert-tool.js';

function mockDeps(overrides: any = {}) {
  return {
    wikiClient: {
      revertPage: vi.fn().mockResolvedValue({ success: true, revision: 42, warnings: [] }),
      ...overrides.wikiClient,
    },
    browserManager: overrides.browserManager ?? {},
    config: overrides.config ?? {},
  };
}

describe('wiki_revert 工具', () => {
  it('回滚成功应返回新修订版本号', async () => {
    const deps = mockDeps();
    const result = await revert(deps, { page: 'TestPage', revision: 5 });

    const text = result.content[0].text;
    expect(text).toContain('42');
    expect(text).toContain('TestPage');
    expect(text).toContain('5');
  });

  it('应传递自定义摘要', async () => {
    const deps = mockDeps();
    await revert(deps, { page: 'TestPage', revision: 5, summary: 'bad edit' });

    expect(deps.wikiClient.revertPage).toHaveBeenCalledWith('TestPage', 5, 'bad edit');
  });

  it('回滚失败应返回错误', async () => {
    const deps = mockDeps({
      wikiClient: { revertPage: vi.fn().mockResolvedValue({ success: false }) },
    });

    const result = await revert(deps, { page: 'TestPage', revision: 5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('回滚失败');
  });
});
