import { describe, it, expect, vi } from 'vitest';
import { search } from '../../src/tools/search-tool.js';
import { mockDeps } from '../helpers.js';

describe('search 工具', () => {
  it('应格式化搜索结果', async () => {
    const deps = mockDeps({
      wikiClient: {
        searchPages: vi.fn().mockResolvedValue([
          { title: 'Page1', page_id: 1, snippet: 'first result' },
          { title: 'Page2', page_id: 2, snippet: 'second result' },
        ]),
      },
    });

    const result = await search(deps, { query: 'test' });
    expect(result.content[0].text).toContain('2 个结果');
    expect(result.content[0].text).toContain('Page1');
    expect(result.content[0].text).toContain('Page2');
  });

  it('无结果时应返回对应消息', async () => {
    const deps = mockDeps({
      wikiClient: {
        searchPages: vi.fn().mockResolvedValue([]),
      },
    });

    const result = await search(deps, { query: 'nonexistent' });
    expect(result.content[0].text).toContain('未找到');
  });
});
