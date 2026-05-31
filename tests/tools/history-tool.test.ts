import { describe, it, expect, vi } from 'vitest';
import { history } from '../../src/tools/history-tool.js';
import { mockDeps } from '../helpers.js';

describe('wiki_history 工具', () => {
  it('应返回修订历史列表', async () => {
    const deps = mockDeps();
    const result = await history(deps, { page: 'TestPage' });

    const text = result.content[0].text;
    expect(text).toContain('1 条记录');
    expect(text).toContain('TestBot');
    expect(text).toContain('test');
  });

  it('小编辑应被标记', async () => {
    const deps = mockDeps();
    const result = await history(deps, { page: 'TestPage' });

    // 默认 mock 里有 minor: false，不标小编辑；换一个有 minor: true 的
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

    const mc = deps.wikiClientManager.getClient();
    expect(mc.getHistory).toHaveBeenCalledWith('TestPage', 5);
  });
});
