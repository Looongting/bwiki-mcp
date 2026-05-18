import type { ToolDependencies } from './register.js';
import { logger } from '../utils/logger.js';

export async function capture(deps: ToolDependencies, args: {
  page: string;
  wait_ms?: number;
  screenshot?: boolean;
  full_page?: boolean;
}) {
  const { browserManager, config } = deps;

  // Construct full URL if a page title was given, not a full URL
  const url = args.page.startsWith('http')
    ? args.page
    : `${config.wiki.url}/index.php?title=${encodeURIComponent(args.page)}`;

  logger.info(`Browser capture: ${url}`);

  const result = await browserManager.capturePage(url, {
    waitMs: args.wait_ms ?? 3000,
    screenshot: args.screenshot ?? true,
    fullPage: args.full_page ?? true,
  });

  const parts: string[] = [
    `## 浏览器捕获结果: ${result.url}`,
  ];

  // Console errors
  const consoleErrors = result.console_entries.filter(e => e.level === 'error');
  if (consoleErrors.length > 0) {
    parts.push(`\n### 控制台错误 (${consoleErrors.length})`);
    for (const e of consoleErrors.slice(0, 5)) {
      parts.push(`- ${e.text.substring(0, 200)}`);
    }
  }

  // Page errors
  if (result.page_errors.length > 0) {
    parts.push(`\n### JavaScript 错误 (${result.page_errors.length})`);
    for (const e of result.page_errors) {
      parts.push(`- ${e.message}`);
    }
  }

  // Network errors
  if (result.network_entries.length > 0) {
    parts.push(`\n### 网络错误 (${result.network_entries.length})`);
    for (const e of result.network_entries.slice(0, 5)) {
      parts.push(`- ${e.method} ${e.url} → ${e.status}${e.error ? ` (${e.error})` : ''}`);
    }
  }

  if (consoleErrors.length === 0 && result.page_errors.length === 0 && result.network_entries.length === 0) {
    parts.push('\n✅ 未检测到浏览器错误');
  }

  const content: any[] = [
    { type: 'text', text: parts.join('\n') },
  ];

  // Include screenshot
  if (result.screenshot) {
    content.push({
      type: 'resource',
      resource: {
        text: result.screenshot,
        mimeType: 'image/png',
      },
    });
  }

  return { content };
}
