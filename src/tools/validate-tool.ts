import type { ToolDependencies } from './register.js';
import { ErrorDetector } from '../validation/detect.js';
import { mcpContent } from '../validation/reporter.js';
import { logger } from '../utils/logger.js';

export async function validate(deps: ToolDependencies, args: {
  page?: string;
  text?: string;
  screenshot?: boolean;
  browser?: boolean;
  rules?: string[];
  site?: string;
}) {
  const { wikiClientManager, browserManager, config } = deps;
  const wikiClient = wikiClientManager.getClient(args.site);
  const siteConfig = wikiClientManager.getSiteConfig(args.site);
  const detector = new ErrorDetector(config.validation.custom_rules, config.validation.console_ignore);

  const targetPage = args.page || '(inline text)';

  // Step 1: Parse (server-side)
  logger.info(`Validating: ${targetPage}`);
  let html: string;
  const parseErrors: import('../types.js').ParseError[] = [];

  if (args.text) {
    const parseResult = await wikiClient.parseWikitext(undefined, args.text);
    html = parseResult.html;
    parseErrors.push(...parseResult.errors);
  } else if (args.page) {
    const parseResult = await wikiClient.parseWikitext(args.page);
    html = parseResult.html;
    parseErrors.push(...parseResult.errors);
  } else {
    return {
      content: [{ type: 'text', text: '请指定 page 或 text 参数' }],
      isError: true,
    };
  }

  // Step 2: HTML error detection
  const htmlErrors = detector.detectFromHtml(html);

  // Combine parse errors + HTML errors
  const allParseErrors = [...parseErrors];

  // Deduplicate by message
  const seen = new Set<string>();
  for (const err of [...htmlErrors, ...parseErrors]) {
    const key = err.message.substring(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      if (!parseErrors.some(e => e.message === err.message)) {
        allParseErrors.push(err);
      }
    }
  }

  // Step 3: Browser capture (optional)
  let browserErrors: import('../types.js').BrowserPageError[] = [];
  let consoleLogs: import('../types.js').BrowserConsoleEntry[] = [];
  let networkErrors: import('../types.js').BrowserNetworkEntry[] = [];
  let anomalies: import('../types.js').VisualAnomaly[] = [];
  let screenshotPath: string | undefined;

  const useBrowser = args.browser !== false && config.validation.console_errors;
  if (useBrowser) {
    try {
      const pageUrl = `${siteConfig.url}/index.php?title=${encodeURIComponent(args.page || '')}`;
      const captureResult = await browserManager.capturePage(pageUrl, {
        screenshot: args.screenshot !== false && config.validation.screenshot,
        waitMs: config.validation.wait_after_load,
      });

      browserErrors = captureResult.page_errors;
      consoleLogs = captureResult.console_entries;
      networkErrors = captureResult.network_entries;

      // Browser-based detection
      const browserDetection = detector.detectFromBrowserCapture(captureResult);
      browserErrors = browserDetection.browser_errors;
      consoleLogs = browserDetection.console_logs;
      networkErrors = browserDetection.network_errors;
      anomalies = browserDetection.anomalies;

      if (captureResult.screenshot) {
        screenshotPath = `data:image/png;base64,${captureResult.screenshot}`;
      }
    } catch (err) {
      logger.warn(`Browser capture failed: ${(err as Error).message}`);
    }
  }

  // Step 4: Generate report
  const report: import('../types.js').ValidationReport = {
    page: targetPage,
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

  const content = mcpContent(report);

  // If screenshot exists, include it
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
