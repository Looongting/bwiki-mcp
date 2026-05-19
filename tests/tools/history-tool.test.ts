import { describe, it, expect, vi } from 'vitest';
import { history } from '../../src/tools/history-tool.js';

function mockDeps(overrides: any = {}) {
  return {
    wikiClient: {
      getHistory: vi.fn().mockResolvedValue([
        { revision: 3, timestamp: '2024-03-01T12:00:00Z', user: 'EditorA', comment: 'fixed typo', minor: true },
        { revision: 2, timestamp: '2024-02-15T08:30:00Z', user: 'EditorB', comment: 'added content', minor: false },
        { revision: 1, timestamp: '2024-01-10T10:00:00Z', user: 'EditorA', comment: 'created page', minor: false },
      ]),
      ...overrides.wikiClient,
    },
    browserManager: overrides.browserManager ?? {},
    config: overrides.config ?? {},
  };
}

describe('wiki_history 工具', () => {
  it('应返回修订历史列表', async () => {
    const deps = mockDeps();
    const result = await history(deps, { page: 'TestPage' });

    const text = result.content[0].text;
    expect(text).toContain('3 条记录');
    expect(text).toContain('EditorA');
    expect(text).toContain('EditorB');
    expect(text).toContain('fixed typo');
  });

  it('小编辑应被标记', async () => {
    const deps = mockDeps();
    const result = await history(deps, { page: 'TestPage' });

    expect(result.content[0].text).toContain('小编辑');
  });

  it('无历史时应返回对应消息', async () => {
    const deps = mockDeps({
      wikiClient: { getHistory: vi.fn().mockResolvedValue([]) },
    });

    const result = await history(deps, { page: 'NewPage' });
    expect(result.content[0].text).toContain('没有修订历史');
  });

  it('应传递 limit 参数', async () => {
    const deps = mockDeps();
    await history(deps, { page: 'TestPage', limit: 5 });

    expect(deps.wikiClient.getHistory).toHaveBeenCalledWith('TestPage', 5);
  });
});
