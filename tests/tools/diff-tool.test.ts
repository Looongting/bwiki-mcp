import { describe, it, expect, vi } from 'vitest';
import { diff } from '../../src/tools/diff-tool.js';

function mockDeps(overrides: any = {}) {
  return {
    wikiClient: {
      readPage: vi.fn().mockResolvedValue({ title: 'Test', content: 'old content', exists: true, last_revision: 5 }),
      getHistory: vi.fn().mockResolvedValue([
        { revision: 5, timestamp: '2024-01-01T00:00:00Z', user: 'User1', comment: 'edit', minor: false },
        { revision: 4, timestamp: '2024-01-01T00:00:00Z', user: 'User1', comment: 'edit', minor: false },
      ]),
      ...overrides.wikiClient,
    },
    browserManager: overrides.browserManager ?? {},
    config: overrides.config ?? {},
  };
}

describe('wiki_diff 工具', () => {
  it('应显示差异行数统计', async () => {
    const deps = mockDeps();
    const result = await diff(deps, { page: 'TestPage', to_content: 'new content' });

    const text = result.content[0].text;
    expect(text).toContain('差异对比');
    expect(text).toContain('+');
    expect(text).toContain('-');
  });

  it('页面不存在时应返回错误', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({ title: 'Missing', content: '', exists: false, last_revision: 0 }),
      },
    });

    const result = await diff(deps, { page: 'MissingPage' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('不存在');
  });

  it('不存在的修订版本应返回错误', async () => {
    const deps = mockDeps({
      wikiClient: {
        getHistory: vi.fn().mockResolvedValue([{ revision: 5, timestamp: '', user: '', comment: '', minor: false }]),
      },
    });

    const result = await diff(deps, { page: 'TestPage', from_revision: 999, to_content: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('未找到');
  });
});
