import type { ToolDependencies } from './register.js';

export async function search(deps: ToolDependencies, args: { query: string; limit?: number; namespace?: number; site?: string }) {
  const wikiClient = deps.wikiClientManager.getClient(args.site);
  const results = await wikiClient.searchPages(args.query, args.limit, args.namespace);

  if (results.length === 0) {
    return {
      content: [{ type: 'text', text: `未找到与 "${args.query}" 相关的页面` }],
    };
  }

  const parts: string[] = [
    `## 搜索结果: "${args.query}"`,
    `共 ${results.length} 个结果\n`,
  ];

  for (const r of results) {
    const snippet = r.snippet.replace(/<[^>]*>/g, '');
    parts.push(`- **${r.title}** (ID: ${r.page_id})`);
    if (snippet) parts.push(`  ${snippet.substring(0, 150)}`);
  }

  return {
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}
