import type { ToolDependencies } from './register.js';

export async function history(deps: ToolDependencies, args: { page: string; limit?: number; site?: string }) {
  const wikiClient = deps.wikiClientManager.getClient(args.site);
  const entries = await wikiClient.getHistory(args.page, args.limit);

  if (entries.length === 0) {
    return {
      content: [{ type: 'text', text: `页面 "${args.page}" 没有修订历史` }],
    };
  }

  const parts: string[] = [
    `## 修订历史: ${args.page}`,
    `共 ${entries.length} 条记录\n`,
  ];

  for (const entry of entries) {
    const date = entry.timestamp.replace('T', ' ').substring(0, 19);
    const tag = entry.minor ? ' (小编辑)' : '';
    parts.push(`- r${entry.revision} | ${date} | ${entry.user}${tag}`);
    if (entry.comment) parts.push(`  ${entry.comment}`);
  }

  return {
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}
