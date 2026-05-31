import { describe, it, expect, vi } from 'vitest';
import { parse } from '../../src/tools/parse-tool.js';
import { mockDeps } from '../helpers.js';

describe('wiki_parse 工具', () => {
  it('应返回解析结果中的分类和模块信息', async () => {
    const deps = mockDeps({
      wikiClient: {
        parseWikitext: vi.fn().mockResolvedValue({
          html: '<p>rendered content</p>',
          categories: ['Category:Test'],
          modules: ['ext.smw'],
          errors: [],
        }),
      },
    });
    const result = await parse(deps, { page: 'TestPage' });

    const text = result.content[0].text;
    expect(text).toContain('Category:Test');
    expect(text).toContain('ext.smw');
    expect(text).toContain('未检测到');
  });

  it('解析出错时应报告错误', async () => {
    const deps = mockDeps({
      wikiClient: {
        parseWikitext: vi.fn().mockResolvedValue({
          html: '<div class="error">missing param</div>',
          categories: [],
          modules: [],
          errors: [{ type: 'template', severity: 'error', message: 'Template error: missing param', context: '', selector: 'strong.error' }],
        }),
      },
    });

    const result = await parse(deps, { text: '{{Broken}}' });
    expect(result.content[0].text).toContain('template');
    expect(result.content[0].text).toContain('missing param');
  });

  it('解析自定义文本时应标注为自定义文本', async () => {
    const deps = mockDeps();
    const result = await parse(deps, { text: 'hello world' });

    expect(result.content[0].text).toContain('自定义文本');
  });

  it('渲染预览应包含文本摘要', async () => {
    const deps = mockDeps();
    const result = await parse(deps, { page: 'TestPage' });

    expect(result.content[0].text).toContain('渲染内容预览');
  });
});
