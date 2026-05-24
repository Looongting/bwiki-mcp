import type { ToolDependencies } from './register.js';
import { generateDiff } from '../safety/diff.js';

export async function diff(deps: ToolDependencies, args: { page: string; from_revision?: number; to_content?: string; site?: string }) {
  const wikiClient = deps.wikiClientManager.getClient(args.site);

  // Read current content
  const current = await wikiClient.readPage(args.page);
  if (!current.exists) {
    return {
      content: [{ type: 'text', text: `页面 "${args.page}" 不存在` }],
      isError: true,
    };
  }

  let oldContent = current.content;

  // If from_revision is specified, verify it exists
  if (args.from_revision) {
    const history = await wikiClient.getHistory(args.page, 50);
    const revExists = history.some(h => h.revision === args.from_revision);
    if (!revExists) {
      return {
        content: [{ type: 'text', text: `修订版本 ${args.from_revision} 未找到` }],
        isError: true,
      };
    }
  }

  const newContent = args.to_content ?? '';
  const result = generateDiff(oldContent, newContent);

  return {
    content: [{
      type: 'text',
      text: `## 差异对比: ${args.page}\n\n` +
        `+${result.stats.added} / -${result.stats.removed}\n\n` +
        `\`\`\`diff\n${result.diff}\n\`\`\``,
    }],
  };
}
