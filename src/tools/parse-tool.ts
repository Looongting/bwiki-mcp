import type { ToolDependencies } from './register.js';

export async function parse(deps: ToolDependencies, args: { page?: string; text?: string; mobile?: boolean }) {
  const { wikiClient } = deps;
  const result = await wikiClient.parseWikitext(args.page, args.text);

  const parts: string[] = [
    `## 解析结果: ${args.page || '自定义文本'}`,
    `分类: ${result.categories.join(', ') || '无'}`,
    `加载的模块: ${result.modules.join(', ') || '无'}`,
  ];

  if (result.errors.length > 0) {
    parts.push(`\n### 检测到 ${result.errors.length} 个错误/警告\n`);
    for (const err of result.errors) {
      parts.push(`- [${err.severity}] [${err.type}] ${err.message}`);
    }
  } else {
    parts.push('\n✅ 未检测到解析错误');
  }

  // Include HTML excerpt
  const htmlExcerpt = result.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000);
  parts.push(`\n### 渲染内容预览\n${htmlExcerpt}...`);

  return {
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}
