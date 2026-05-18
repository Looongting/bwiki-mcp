import { describe, it, expect, vi } from 'vitest';
import { read } from '../../src/tools/read-tool.js';

const mockDeps = (overrides: any = {}) => ({
  wikiClient: {
    readPage: vi.fn(),
    ...overrides.wikiClient,
  },
  browserManager: overrides.browserManager ?? {},
  config: overrides.config ?? {},
});

describe('read 工具', () => {
  it('页面存在时应返回内容', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({
          title: 'TestPage',
          content: 'page wikitext content',
          exists: true,
          last_revision: 42,
        }),
      },
    });

    const result = await read(deps, { page: 'TestPage' });
    expect(result.content[0].text).toContain('TestPage');
    expect(result.content[0].text).toContain('42');
    expect(result.content[0].text).toContain('page wikitext content');
  });

  it('页面不存在时应给出创建提示', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({
          title: 'MissingPage',
          content: '',
          exists: false,
          last_revision: 0,
        }),
      },
    });

    const result = await read(deps, { page: 'MissingPage' });
    expect(result.content[0].text).toContain('不存在');
    expect(result.content[0].text).toContain('wiki_edit');
  });

  it('应能提取特定章节', async () => {
    const deps = mockDeps({
      wikiClient: {
        readPage: vi.fn().mockResolvedValue({
          title: 'TestPage',
          content: '= Section 1 =\ncontent1\n= Section 2 =\ncontent2',
          exists: true,
          last_revision: 1,
        }),
      },
    });

    const result = await read(deps, { page: 'TestPage', section: 1 });
    expect(result.content[0].text).toContain('Section 2');
    expect(result.content[0].text).toContain('content2');
  });
});
