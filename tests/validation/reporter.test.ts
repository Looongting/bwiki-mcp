import { describe, it, expect } from 'vitest';
import { formatReport, mcpContent } from '../../src/validation/reporter.js';
import type { ValidationReport } from '../../src/types.js';

function makeReport(overrides: Partial<ValidationReport> = {}): ValidationReport {
  return {
    page: 'TestPage',
    parse_errors: [],
    browser_errors: [],
    console_logs: [],
    network_errors: [],
    anomalies: [],
    summary: '✅ 通过 - 未发现问题',
    ...overrides,
  };
}

describe('formatReport', () => {
  it('应生成 markdown 和 json 输出', () => {
    const report = makeReport();
    const result = formatReport(report);
    expect(result.markdown).toBeTruthy();
    expect(result.json).toBeTruthy();
  });

  it('JSON 应包含错误计数', () => {
    const report = makeReport({
      parse_errors: [
        { type: 'smw', severity: 'error', message: 'SMW error', context: '', selector: '.smw-error' },
      ],
      browser_errors: [{ message: 'JS error' }],
    });
    const result = JSON.parse(formatReport(report).json);
    expect(result.error_count).toBe(2);
  });

  it('JSON 应包含警告计数', () => {
    const report = makeReport({
      console_logs: [{ level: 'warning', text: 'deprecated API', timestamp: 1 }],
      anomalies: [{ type: 'empty_area', severity: 'warning', description: 'empty div' }],
    });
    const result = JSON.parse(formatReport(report).json);
    expect(result.warning_count).toBe(2);
  });
});

describe('mcpContent', () => {
  it('应返回文本内容', () => {
    const report = makeReport();
    const content = mcpContent(report);
    expect(content.length).toBeGreaterThan(0);
    expect(content[0].type).toBe('text');
  });

  it('报告较小时应包含 JSON 资源', () => {
    const report = makeReport({
      parse_errors: [
        { type: 'smw', severity: 'error', message: 'test', context: '', selector: '.smw-error' },
      ],
    });
    const content = mcpContent(report);
    expect(content.some((c) => c.type === 'resource')).toBe(true);
  });
});
