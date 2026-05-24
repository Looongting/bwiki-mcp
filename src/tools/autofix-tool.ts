import type { ToolDependencies } from './register.js';
import type { ParseError, VisualAnomaly, ValidationReport } from '../types.js';
import { ErrorDetector } from '../validation/detect.js';
import { formatReport } from '../validation/reporter.js';
import { SandboxManager } from '../safety/sandbox.js';
import { BackupManager } from '../safety/backup.js';
import { logger } from '../utils/logger.js';

interface AutofixInput {
  page: string;
  content: string;
  iteration?: number;
  max_iterations?: number;
  enable_browser?: boolean;
  site?: string;
}

export async function autofix(deps: ToolDependencies, args: AutofixInput) {
  const { wikiClientManager, browserManager, config } = deps;
  const wikiClient = wikiClientManager.getClient(args.site);
  const siteConfig = wikiClientManager.getSiteConfig(args.site);
  const iteration = args.iteration ?? 1;
  const maxIterations = args.max_iterations ?? 5;
  const useBrowser = args.enable_browser !== false && config.validation.console_errors;

  if (iteration > maxIterations) {
    return {
      content: [{
        type: 'text',
        text: `自动修复已终止：已达最大迭代次数 ${maxIterations}，请手动审查。`,
      }],
      isError: true,
    };
  }

  // Resolve sandbox page
  const username = siteConfig.auth.type === 'bot' ? siteConfig.auth.username : 'user';
  const sandbox = new SandboxManager(config.safety.sandbox_page, username.replace(/@.*$/, ''));
  const sandboxPage = sandbox.getSandboxPage(args.page);

  // Step 1: Backup existing sandbox content
  if (config.safety.auto_backup) {
    try {
      const current = await wikiClient.readPage(sandboxPage);
      if (current.exists && current.content) {
        const backup = new BackupManager('.wiki-backups');
        await backup.backup(sandboxPage, current.content);
      }
    } catch { /* best-effort */ }
  }

  // Step 2: Publish to sandbox
  logger.info(`[Autofix/${iteration}] Publishing to sandbox: ${sandboxPage}`);
  const editResult = await wikiClient.editPage(sandboxPage, args.content, {
    summary: `Autofix iteration ${iteration}`,
    bot: true,
  });

  if (!editResult.success) {
    return {
      content: [{ type: 'text', text: `发布到沙箱失败: ${sandboxPage}` }],
      isError: true,
    };
  }

  // Step 3: Server-side parse validation
  const detector = new ErrorDetector(config.validation.custom_rules, config.validation.console_ignore);
  const parseResult = await wikiClient.parseWikitext(sandboxPage);
  const htmlErrors = detector.detectFromHtml(parseResult.html);

  const allParseErrors: ParseError[] = [...parseResult.errors];
  const seen = new Set<string>();
  for (const err of [...htmlErrors, ...parseResult.errors]) {
    const key = err.message.substring(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      if (!parseResult.errors.some(e => e.message === err.message)) {
        allParseErrors.push(err);
      }
    }
  }

  // Step 4: Browser capture
  let browserErrors: import('../types.js').BrowserPageError[] = [];
  let consoleLogs: import('../types.js').BrowserConsoleEntry[] = [];
  let networkErrors: import('../types.js').BrowserNetworkEntry[] = [];
  let anomalies: VisualAnomaly[] = [];
  let screenshotPath: string | undefined;

  if (useBrowser) {
    try {
      const pageUrl = `${siteConfig.url}/index.php?title=${encodeURIComponent(sandboxPage)}`;
      const captureResult = await browserManager.capturePage(pageUrl, {
        screenshot: config.validation.screenshot,
        waitMs: config.validation.wait_after_load,
      });

      const browserDetection = detector.detectFromBrowserCapture(captureResult);
      browserErrors = browserDetection.browser_errors;
      consoleLogs = browserDetection.console_logs;
      networkErrors = browserDetection.network_errors;
      anomalies = browserDetection.anomalies;

      if (captureResult.screenshot) {
        screenshotPath = `data:image/png;base64,${captureResult.screenshot}`;
      }
    } catch (err) {
      logger.warn(`[Autofix] Browser capture failed: ${(err as Error).message}`);
    }
  }

  // Step 5: Determine status and generate fix suggestions
  const totalErrors = allParseErrors.filter(e => e.severity === 'error').length
    + browserErrors.length
    + networkErrors.filter(e => e.status >= 500).length
    + anomalies.filter(a => a.severity === 'error').length;

  const hasIssues = totalErrors > 0
    || allParseErrors.length > 0
    || anomalies.length > 0
    || consoleLogs.filter(l => l.level === 'error').length > 0;

  let status: 'clean' | 'has_issues' | 'max_reached';
  if (hasIssues && iteration >= maxIterations) status = 'max_reached';
  else if (hasIssues) status = 'has_issues';
  else status = 'clean';

  const fixSuggestions = generateFixSuggestions(allParseErrors, anomalies);

  // Build report
  const report: ValidationReport = {
    page: args.page,
    parse_errors: allParseErrors,
    browser_errors: browserErrors,
    console_logs: consoleLogs,
    network_errors: networkErrors,
    anomalies,
    screenshot_path: screenshotPath,
    summary: detector.generateSummary({
      parse_errors: allParseErrors,
      browser_errors: browserErrors,
      console_logs: consoleLogs,
      network_errors: networkErrors,
      anomalies,
    }),
  };

  const { markdown } = formatReport(report);

  const parts: string[] = [
    `## 自动修复 - 第 ${iteration}/${maxIterations} 轮`,
    '',
    `目标页面: ${args.page}`,
    `沙箱页面: ${sandboxPage}`,
    `沙箱修订版本: ${editResult.revision}`,
    `状态: ${status === 'clean' ? '通过' : status === 'max_reached' ? '已达最大迭代次数' : '需要修复'}`,
    '',
    '---',
    '',
    markdown,
  ];

  if (fixSuggestions.length > 0 && status !== 'clean') {
    parts.push('', '### 修复建议');
    for (const s of fixSuggestions) {
      parts.push(`- ${s}`);
    }
  }

  if (status === 'clean') {
    parts.push('', '全部检查通过，可以将内容发布到真实页面。');
  } else if (status === 'has_issues') {
    parts.push('', `以上问题修复后，再次调用 wiki_autofix 进行第 ${iteration + 1} 轮验证。输入参数示例：

\`\`\`json
{
  "page": "${args.page}",
  "content": "<修复后的 Wikitext>",
  "iteration": ${iteration + 1},
  "max_iterations": ${maxIterations}
}
\`\`\``);
  } else {
    parts.push('', `已达最大迭代次数 (${maxIterations})，请手动审查沙箱页面剩余的警告项。`);
  }

  const content: any[] = [{ type: 'text', text: parts.join('\n') }];

  if (screenshotPath && content.length < 10) {
    content.push({
      type: 'resource',
      resource: {
        text: screenshotPath,
        mimeType: 'image/png',
        uri: screenshotPath,
      },
    });
  }

  return { content };
}

function generateFixSuggestions(
  parseErrors: ParseError[],
  anomalies: VisualAnomaly[]
): string[] {
  const suggestions: string[] = [];

  for (const err of parseErrors) {
    switch (err.type) {
      case 'smw': {
        const msg = err.message.toLowerCase();
        if (msg.includes('property') || msg.includes('属性')) {
          suggestions.push(`SMW 属性错误：检查查询中使用的属性名是否存在（注意大小写和命名空间）。可使用 wiki_smw_query 列出可用属性。`);
        } else if (msg.includes('category') || msg.includes('分类')) {
          suggestions.push(`SMW 分类错误：检查 [Category:...] 或 [[分类:...]] 中的分类名是否拼写正确。`);
        } else {
          suggestions.push(`SMW 查询语法错误：检查查询条件格式，确保属性比较操作符（=, <, >, ::）使用正确。`);
        }
        break;
      }
      case 'template':
        suggestions.push(`模板错误：检查模板名是否拼写正确，参数名是否匹配模板文档，必填参数是否遗漏。某些模板区分大小写。`);
        break;
      case 'parser':
        suggestions.push(`解析器语法错误：检查表格、模板嵌套、解析器函数（#if, #switch, #ask 等）的括号和管道符是否配对闭合。`);
        break;
      case 'unknown':
        suggestions.push(`未知解析错误：在沙箱页面查看渲染结果，检查是否有异常标记。`);
        break;
    }
  }

  for (const a of anomalies) {
    switch (a.type) {
      case 'raw_wikitext':
        suggestions.push(`页面包含未渲染的 wikitext（如 { 或 } 标记）。可能是模板未正确展开，检查模板是否缺少必要参数或者依赖的模板不存在。`);
        break;
      case 'missing_content':
        suggestions.push(`内容区域为空。如果是 SMW 查询结果为空，放宽查询条件再试（如去掉数量限制）。如果是条件模板，检查条件逻辑。`);
        break;
      case 'empty_area':
        suggestions.push(`页面部分区域为空或布局异常。检查最近添加的内容是否存在 HTML 标签未闭合或模板换行问题。`);
        break;
      case 'layout_break':
        suggestions.push(`页面布局偏移。可能是浮动元素不自清除、表格未闭合、或响应式元素缺少容器。`);
        break;
    }
  }

  // Remove duplicates
  return [...new Set(suggestions)];
}
