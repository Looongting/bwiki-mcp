import type { ToolDependencies } from './register.js';
import { generateDiff } from '../safety/diff.js';
import { BackupManager } from '../safety/backup.js';
import { SandboxManager } from '../safety/sandbox.js';
import { ParameterCorruptedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * 检测参数值是否被模板引擎污染。
 * 当 MCP 传输层对 {{...}} 进行模板插值时，未定义的变量会被替换为 "undefined"。
 */
function checkCorrupted(value: unknown, paramName: string): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  // 匹配被污染的值：纯粹的 "undefined"（含首尾空格变体）
  if (trimmed === 'undefined' || trimmed === '"undefined"' || trimmed === "'undefined'") {
    throw new ParameterCorruptedError(paramName, value);
  }
}

export async function edit(deps: ToolDependencies, args: {
  page: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  summary?: string;
  minor?: boolean;
  bot?: boolean;
  dry_run?: boolean;
  sandbox?: boolean;
  site?: string;
}) {
  const { wikiClientManager, config } = deps;
  const wikiClient = wikiClientManager.getClient(args.site);

  // Ensure authenticated before resolving sandbox page, so that the real username is available.
  await wikiClient.ensureAuthenticated();

  // ─── Corruption detection ───────────────────────────────────
  checkCorrupted(args.content, 'content');
  checkCorrupted(args.old_string, 'old_string');
  checkCorrupted(args.new_string, 'new_string');

  // ─── Debug logging ──────────────────────────────────────────
  logger.debug(
    `wiki_edit params: page="${args.page}", ` +
    `content=${args.content !== undefined ? `"${args.content.substring(0, 100)}${args.content.length > 100 ? '...' : ''}"` : 'undefined'}, ` +
    `old_string=${args.old_string !== undefined ? `"${args.old_string.substring(0, 100)}${args.old_string.length > 100 ? '...' : ''}"` : 'undefined'}, ` +
    `new_string=${args.new_string !== undefined ? `"${args.new_string.substring(0, 100)}${args.new_string.length > 100 ? '...' : ''}"` : 'undefined'}, ` +
    `replace_all=${args.replace_all}, dry_run=${args.dry_run}, sandbox=${args.sandbox}`
  );

  // ─── Determine content mode ──────────────────────────────────
  // Priority: explicit content > old_string+new_string find-and-replace
  let content: string;
  let usedFindReplace = false;

  if (args.content !== undefined && args.content !== null) {
    // Mode 1: Full page content replacement
    content = args.content;
  } else if (args.old_string !== undefined && args.old_string !== null &&
             args.new_string !== undefined && args.new_string !== null) {
    // Mode 2: Server-side find-and-replace
    usedFindReplace = true;

    // Resolve sandbox for reading
    let readPage = args.page;
    const shouldSandbox = args.sandbox ?? config.safety.sandbox_first;
    if (shouldSandbox) {
      const username = wikiClient.authManager?.username ?? 'user';
      const sandbox = new SandboxManager(config.safety.sandbox_page, username.replace(/@.*$/, ''));
      readPage = sandbox.getSandboxPage(args.page);
    }

    const current = await wikiClient.readPage(readPage);

    if (!current.exists) {
      return {
        content: [{
          type: 'text',
          text: `查找替换失败: 页面 "${readPage}" 不存在，无法执行内容替换。`,
        }],
        isError: true,
      };
    }

    const oldStr = args.old_string;
    const newStr = args.new_string;

    if (args.replace_all) {
      // 使用 split+join 进行全量替换（避免正则转义问题）
      content = current.content.split(oldStr).join(newStr);
    } else {
      // 仅替换首个匹配
      const idx = current.content.indexOf(oldStr);
      if (idx === -1) {
        return {
          content: [{
            type: 'text',
            text: `未找到匹配文本: "${oldStr.substring(0, 200)}${oldStr.length > 200 ? '...' : ''}"`,
          }],
          isError: true,
        };
      }
      content = current.content.substring(0, idx) + newStr + current.content.substring(idx + oldStr.length);
    }

    // 替换前后内容一致 → 无效果
    if (content === current.content) {
      return {
        content: [{
          type: 'text',
          text: `替换后内容未发生变化（匹配文本可能为空或替换文本与原文相同）。`,
        }],
        isError: true,
      };
    }
  } else {
    return {
      content: [{
        type: 'text',
        text: `必须提供 content（全页替换）或 old_string + new_string（查找替换）。`,
      }],
      isError: true,
    };
  }

  // ─── Resolve sandbox ────────────────────────────────────────
  let targetPage = args.page;
  const shouldSandbox = args.sandbox ?? config.safety.sandbox_first;

  if (shouldSandbox) {
    const username = wikiClient.authManager?.username ?? 'user';
    const sandbox = new SandboxManager(config.safety.sandbox_page, username.replace(/@.*$/, ''));
    targetPage = sandbox.getSandboxPage(args.page);
  }

  // ─── Dry run: show diff without saving ───────────────────────
  if (args.dry_run) {
    const current = await wikiClient.readPage(targetPage);
    const diff = generateDiff(current.content, content);

    let preamble = '';
    if (usedFindReplace) {
      preamble = `查找: "${args.old_string!.substring(0, 100)}${(args.old_string!.length > 100) ? '...' : ''}"` +
        ` → 替换: "${args.new_string!.substring(0, 100)}${(args.new_string!.length > 100) ? '...' : ''}"\n` +
        `替换次数: ${args.replace_all ? '全部' : '首个'}\n\n`;
    }

    return {
      content: [{
        type: 'text',
        text: `## 差异预览 (Dry Run)\n页面: ${targetPage}\n\n${preamble}` +
          `+${diff.stats.added} 行 / -${diff.stats.removed} 行\n\n\`\`\`diff\n${diff.diff}\n\`\`\``,
      }],
    };
  }

  // ─── Auto backup ─────────────────────────────────────────────
  if (config.safety.auto_backup) {
    const current = await wikiClient.readPage(targetPage);
    if (current.exists) {
      const backup = new BackupManager('.wiki-backups');
      await backup.backup(targetPage, current.content);
    }
  }

  // ─── Perform edit ────────────────────────────────────────────
  logger.info(`Editing page: ${targetPage}${usedFindReplace ? ' (find-and-replace)' : ''}`);
  const result = await wikiClient.editPage(targetPage, content, {
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

  if (usedFindReplace) {
    parts.push(`模式: 查找替换`);
  }

  if (targetPage !== args.page) {
    parts.push(`\n⚠️ 内容已发布到沙箱页面 "${targetPage}"，非原页面 "${args.page}"。`);
    parts.push(`确认无误后，使用 wiki_edit(sandbox: false) 发布到真实页面。`);
  }

  return {
    content: [{ type: 'text', text: parts.join('\n') }],
  };
}
