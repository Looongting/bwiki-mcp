import { describe, it, expect } from 'vitest';
import { ErrorDetector } from '../../src/validation/detect.js';
import type { BrowserCaptureResult } from '../../src/types.js';

function makeDetector(customRules: any[] = [], consoleIgnore: string[] = []) {
  return new ErrorDetector(customRules, consoleIgnore);
}

describe('ErrorDetector', () => {
  describe('detectFromHtml', () => {
    it('应检测 HTML 中的 SMW 错误', () => {
      const detector = makeDetector();
      const html = '<div class="smw-error">SMW query failed: syntax error</div>';
      const errors = detector.detectFromHtml(html);
      expect(errors.some((e) => e.type === 'smw')).toBe(true);
    });

    it('应检测解析器错误', () => {
      const detector = makeDetector();
      const html = '<div class="mw-parse-error">Parse error occurred</div>';
      const errors = detector.detectFromHtml(html);
      expect(errors.some((e) => e.type === 'parser')).toBe(true);
    });

    it('应检测红链（a.new）', () => {
      const detector = makeDetector();
      const html = '<a href="/wiki/MissingPage" class="new" title="MissingPage">MissingPage</a>';
      const errors = detector.detectFromHtml(html);
      const redLinks = errors.filter((e) => e.selector === 'a.new');
      expect(redLinks.length).toBeGreaterThan(0);
      expect(redLinks[0].severity).toBe('warning');
    });

    it('应检测渲染 HTML 中未解析的维基文本', () => {
      const detector = makeDetector();
      const html = '<p>Some text {{unresolved template}} and more text</p>';
      const errors = detector.detectFromHtml(html);
      const rawTemplate = errors.find((e) => e.message.includes('{{'));
      expect(rawTemplate).toBeDefined();
    });

    it('应检测 SMW 文本模式', () => {
      const detector = makeDetector();
      const html = '<p>SMW 查询错误：格式不正确，请检查查询语句。</p>';
      const errors = detector.detectFromHtml(html);
      expect(errors.some((e) => e.type === 'smw')).toBe(true);
    });

    it('应返回空结果（干净 HTML）', () => {
      const detector = makeDetector();
      const html = '<div class="clean">No errors here</div>';
      const errors = detector.detectFromHtml(html);
      expect(errors.length).toBe(0);
    });
  });

  describe('detectFromBrowserCapture', () => {
    function makeCapture(overrides: Partial<BrowserCaptureResult> = {}): BrowserCaptureResult {
      return {
        url: 'https://wiki.example.com/TestPage',
        console_entries: [],
        network_entries: [],
        page_errors: [],
        ...overrides,
      };
    }

    it('应过滤已知的平台噪音', () => {
      const detector = makeDetector([]);
      const capture = makeCapture({
        console_entries: [
          { level: 'log', text: 'getData(dbUserName) 个人配置尚未初始化', timestamp: 1 },
          { level: 'error', text: 'real error occurred', timestamp: 2 },
        ],
      });
      const result = detector.detectFromBrowserCapture(capture);
      expect(result.console_logs.length).toBe(1);
      expect(result.console_logs[0].text).toBe('real error occurred');
    });

    it('应应用自定义的 console_ignore 模式', () => {
      const detector = makeDetector([], ['my-noise-pattern']);
      const capture = makeCapture({
        console_entries: [
          { level: 'warn', text: 'my-noise-pattern triggered', timestamp: 1 },
          { level: 'error', text: 'legit error', timestamp: 2 },
        ],
      });
      const result = detector.detectFromBrowserCapture(capture);
      expect(result.console_logs.length).toBe(1);
      expect(result.console_logs[0].text).toBe('legit error');
    });

    it('应过滤 301 重定向网络条目', () => {
      const detector = makeDetector();
      const capture = makeCapture({
        network_entries: [
          { url: 'https://wiki.example.com/Page', status: 301, method: 'GET' },
          { url: 'https://wiki.example.com/api.php', status: 500, method: 'POST' },
        ],
      });
      const result = detector.detectFromBrowserCapture(capture);
      expect(result.network_errors.length).toBe(1);
      expect(result.network_errors[0].status).toBe(500);
    });

    it('应检测空容器为异常', () => {
      const detector = makeDetector();
      const capture = makeCapture({
        dom_snapshot: '<div class="smw-results"></div>',
      });
      const result = detector.detectFromBrowserCapture(capture);
      expect(result.anomalies.some((a) => a.type === 'missing_content')).toBe(true);
    });

    it('应检测 DOM 中未渲染的维基文本', () => {
      const detector = makeDetector();
      const capture = makeCapture({
        dom_snapshot: '<div>Some {{template}} text</div>',
      });
      const result = detector.detectFromBrowserCapture(capture);
      expect(result.anomalies.some((a) => a.type === 'raw_wikitext')).toBe(true);
    });
  });

  describe('generateSummary', () => {
    it('无错误时应返回通过状态', () => {
      const detector = makeDetector();
      const summary = detector.generateSummary({
        parse_errors: [],
        browser_errors: [],
        console_logs: [],
        network_errors: [],
        anomalies: [],
      });
      expect(summary).toContain('通过');
    });

    it('应包含错误计数', () => {
      const detector = makeDetector();
      const summary = detector.generateSummary({
        parse_errors: [{ type: 'smw', severity: 'error', message: 'bad query', context: '', selector: '.smw-error' }],
        browser_errors: [{ message: 'TypeError: x is undefined' }],
        console_logs: [],
        network_errors: [],
        anomalies: [],
      });
      expect(summary).toContain('错误');
    });

    it('当存在浏览器错误时应包含控制台错误信息', () => {
      const detector = makeDetector();
      const summary = detector.generateSummary({
        parse_errors: [],
        browser_errors: [{ message: 'TypeError: x is undefined' }],
        console_logs: [{ level: 'error', text: 'Failed to load resource', timestamp: 1 }],
        network_errors: [],
        anomalies: [],
      });
      expect(summary).toContain('控制台错误');
    });
  });
});
