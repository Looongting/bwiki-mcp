import type { ToolDependencies } from './register.js';
import { generateDiff } from '../safety/diff.js';
import { BackupManager } from '../safety/backup.js';
import { SandboxManager } from '../safety/sandbox.js';
import { logger } from '../utils/logger.js';

export async function edit(deps: ToolDependencies, args: {
  page: string;
  content: string;
  summary?: string;
  minor?: boolean;
  bot?: boolean;
  dry_run?: boolean;
  sandbox?: boolean;
}) {
  const { wikiClient, config } = deps;

  // Resolve sandbox
  let targetPage = args.page;
  const shouldSandbox = args.sandbox ?? config.safety.sandbox_first;

  if (shouldSandbox) {
    const username = config.auth.type === 'bot' ? config.auth.username : 'user';
    const sandbox = new SandboxManager(config.safety.sandbox_page, username.replace(/@.*$/, ''));
    targetPage = sandbox.getSandboxPage(args.page);
  }

  // Dry run: show diff without saving
  if (args.dry_run) {
    const current = await wikiClient.readPage(targetPage);
    const diff = generateDiff(current.content, args.content);

    return {
      content: [{
        type: 'text',
        text: `## 差异预览 (Dry Run)\n页面: ${targetPage}\n\n` +
          `+${diff.stats.added} 行 / -${diff.stats.removed} 行\n\n\`\`\`diff\n${diff.diff}\n\`\`\``,
      }],
    };
  }

  // Auto backup
  if (config.safety.auto_backup) {
    const current = await wikiClient.readPage(targetPage);
    if (current.exists) {
      const backup = new BackupManager('.wiki-backups');
      await backup.backup(targetPage, current.content);
    }
  }

  // Perform edit
  logger.info(`Editing page: ${targetPage}`);
  const result = await wikiClient.editPage(targetPage, args.content, {
    summary: args.summary,
    minor: args.minor,
    bot: args.bot,
  });

  if (!result.success) {
    return {
      content: [{ type: 'text', text: `编辑失败: ${targetPage}` }],
      isError: true,
    };
  }

  const parts: string[] = [
    `✅ 编辑成功`,
    `页面: ${targetPage}`,
    `修订版本: ${result.revision}`,
  ];

  if (targetPage !== args.page) {
    parts.push(`\n⚠️ 内容已发布到沙箱页面 "${targetPage}"，非原页面 "${args.page}"。`);
    parts.push(`确认无误后，使用 wiki_edit(sandbox: false) 发布到真实页面。`);
  }

  return {
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}
