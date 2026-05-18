import type { CustomRule } from '../types.js';

export interface DetectionRule {
  name: string;
  description: string;
  selector: string;
  severity: 'error' | 'warning';
  validate(match: Element): string;
}

export const BUILT_IN_RULES: DetectionRule[] = [
  {
    name: 'smw-parse-error',
    description: 'SMW 查询解析语法错误',
    selector: '.smw-parse-error',
    severity: 'error',
    validate: (el) => `SMW 解析错误: ${el.textContent?.trim() || '未知错误'}`,
  },
  {
    name: 'smw-query-error',
    description: 'SMW 查询运行时错误',
    selector: '.smw-error',
    severity: 'error',
    validate: (el) => `SMW 查询错误: ${el.textContent?.trim() || '未知错误'}`,
  },
  {
    name: 'smw-no-results',
    description: 'SMW 查询返回空结果',
    selector: '.smw-results:empty, .smw-table:empty',
    severity: 'warning',
    validate: () => 'SMW 查询结果为空',
  },
  {
    name: 'template-error',
    description: '模板参数缺失或错误',
    selector: 'strong.error, span.error, .error',
    severity: 'error',
    validate: (el) => `模板错误: ${el.textContent?.trim() || '未知错误'}`,
  },
  {
    name: 'mw-parse-error',
    description: 'MediaWiki 解析器错误',
    selector: '.mw-parse-error',
    severity: 'error',
    validate: (el) => `MW 解析错误: ${el.textContent?.trim() || '未知错误'}`,
  },
  {
    name: 'missing-page',
    description: '链接到不存在的页面（红链）',
    selector: 'a.new',
    severity: 'warning',
    validate: (el) => `不存在的页面链接: ${el.getAttribute('title') || el.textContent || ''}`,
  },
];

export function mergeRules(customRules: CustomRule[]): DetectionRule[] {
  const custom: DetectionRule[] = customRules.map((r) => ({
    name: r.name,
    description: `自定义规则: ${r.name}`,
    selector: r.selector,
    severity: r.severity === 'info' ? 'warning' : r.severity,
    validate: (el) => {
      if (r.match) {
        const text = el.textContent || '';
        const regex = new RegExp(r.match);
        return regex.test(text) ? `匹配到 "${r.name}": ${text.trim().substring(0, 200)}` : '';
      }
      return `自定义规则 "${r.name}" 触发: ${el.textContent?.trim().substring(0, 200) || ''}`;
    },
  }));

  return [...BUILT_IN_RULES, ...custom];
}
