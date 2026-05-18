import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { BrowserConfig, BrowserCaptureResult, BrowserConsoleEntry, BrowserNetworkEntry, BrowserPageError } from '../types.js';
import { BrowserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private config: BrowserConfig) {}

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      locale: this.config.locale,
    });

    logger.info('Browser launched');
  }

  async capturePage(
    url: string,
    options: { waitMs?: number; screenshot?: boolean; fullPage?: boolean } = {}
  ): Promise<BrowserCaptureResult> {
    await this.initialize();
    if (!this.context) throw new BrowserError('Browser context not initialized');

    const page = await this.context.newPage();
    const consoleEntries: BrowserConsoleEntry[] = [];
    const pageErrors: BrowserPageError[] = [];
    const networkEntries: BrowserNetworkEntry[] = [];

    page.on('console', (msg) => {
      consoleEntries.push({
        level: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    page.on('pageerror', (err) => {
      pageErrors.push({
        message: err.message,
        stack: err.stack,
      });
    });

    page.on('requestfailed', (req) => {
      networkEntries.push({
        url: req.url(),
        status: 0,
        method: req.method(),
        error: req.failure()?.errorText,
      });
    });

    page.on('response', (resp) => {
      if (!resp.ok()) {
        networkEntries.push({
          url: resp.url(),
          status: resp.status(),
          method: resp.request().method(),
        });
      }
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(options.waitMs ?? 3000);
    } catch (err) {
      await page.close();
      throw new BrowserError(`Failed to load page: ${(err as Error).message}`, url);
    }

    let screenshot: string | undefined;
    if (options.screenshot !== false) {
      const buffer = await page.screenshot({ fullPage: options.fullPage ?? true, type: 'png' });
      screenshot = buffer.toString('base64');
    }

    const domSnapshot = await page.evaluate(() => {
      return document.body?.innerHTML?.substring(0, 8000) || '';
    }).catch(() => undefined);

    await page.close();

    return {
      url,
      screenshot,
      console_entries: consoleEntries,
      network_entries: networkEntries,
      page_errors: pageErrors,
      dom_snapshot: domSnapshot,
    };
  }

  async cleanup(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    logger.info('Browser shut down');
  }
}
