import type { ToolDependencies } from './register.js';
import { executeSmwQuery } from '../wiki/smw.js';

export async function smwQuery(deps: ToolDependencies, args: { query: string; format?: string; limit?: number }) {
  const { wikiClient } = deps;
  const result = await executeSmwQuery(wikiClient, args.query, args.format, args.limit);

  const parts: string[] = [
    `## SMW 查询结果`,
    `查询: ${args.query}`,
    `格式: ${result.format}`,
    `结果数: ${result.count}`,
  ];

  if (result.errors.length > 0) {
    parts.push(`\n### 错误 (${result.errors.length})`);
    for (const err of result.errors) {
      parts.push(`- ${err}`);
    }
  }

  if (result.results.length > 0) {
    parts.push(`\n### 结果列表`);
    for (const r of result.results.slice(0, 20)) {
      parts.push(`- ${typeof r === 'string' ? r : JSON.stringify(r).substring(0, 100)}`);
    }
    if (result.results.length > 20) {
      parts.push(`... 以及另外 ${result.results.length - 20} 个结果`);
    }
  }

  if (result.raw) {
    parts.push(`\n### 原始输出片段\n${result.raw.substring(0, 500)}`);
  }

  return {
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}
