import type { ToolDependencies } from './register.js';

export async function revert(deps: ToolDependencies, args: { page: string; revision: number; summary?: string; site?: string }) {
  const wikiClient = deps.wikiClientManager.getClient(args.site);

  const result = await wikiClient.revertPage(args.page, args.revision, args.summary);

  if (!result.success) {
    return {
      content: [{ type: 'text', text: `回滚失败: ${args.page}` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text',
      text: `✅ 已回滚页面 "${args.page}" 到修订版本 ${args.revision}\n` +
        `新修订版本: ${result.revision}`,
    }],
  };
}
