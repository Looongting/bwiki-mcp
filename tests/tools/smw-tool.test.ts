import { describe, it, expect, vi } from 'vitest';
import { smwQuery } from '../../src/tools/smw-tool.js';
import { mockDeps } from '../helpers.js';

vi.mock('../../src/wiki/smw.js', () => ({
  executeSmwQuery: vi.fn((_client, query, format, limit) => {
    if (query.includes('Empty')) {
      return Promise.resolve({ results: [], format: format || 'table', count: 0, errors: [], raw: '{}' });
    }
    if (query.includes('Invalid')) {
      return Promise.resolve({
        results: [],
        format: format || 'table',
        count: 0,
        errors: ['SMW query syntax error: unexpected token'],
        raw: '{"error":"syntax"}',
      });
    }
    return Promise.resolve({
      results: [
        { fulltext: 'Beijing', fullurl: 'https://wiki.example.com/Beijing' },
        { fulltext: 'Shanghai', fullurl: 'https://wiki.example.com/Shanghai' },
      ],
      format: format || 'table',
      count: 2,
      errors: [],
      raw: '{"results":{"Beijing":{}}}',
    });
  }),
}));

describe('wiki_smw_query 工具', () => {
  it('查询成功应返回结果列表', async () => {
    const deps = mockDeps();
    const result = await smwQuery(deps, { query: '[[Category:Cities]]' });

    const text = result.content[0].text;
    expect(text).toContain('SMW 查询结果');
    expect(text).toContain('Beijing');
    expect(text).toContain('Shanghai');
    expect(text).toContain('2');
  });

  it('查询出错时应报告错误信息', async () => {
    const deps = mockDeps();
    const result = await smwQuery(deps, { query: '[[Invalid::query]]' });

    const text = result.content[0].text;
    expect(text).toContain('错误');
    expect(text).toContain('syntax');
  });

  it('大量结果应显示截断提示', async () => {
    const mockQuery = vi.mocked((await import('../../src/wiki/smw.js')).executeSmwQuery);
    mockQuery.mockResolvedValueOnce({
      results: Array.from({ length: 30 }, (_, i) => ({ fulltext: `Page${i}`, fullurl: '' })),
      format: 'table',
      count: 30,
      errors: [],
      raw: '',
    });

    const deps = mockDeps();
    const result = await smwQuery(deps, { query: '[[Category:All]]', limit: 50 });

    expect(result.content[0].text).toContain('另外');
  });

  it('空结果应显示结果数零', async () => {
    const deps = mockDeps();
    const result = await smwQuery(deps, { query: '[[Category:Empty]]', format: 'count' });

    const text = result.content[0].text;
    expect(text).toContain('0');
  });
});
