import { describe, it, expect } from 'vitest';
import { BUILT_IN_RULES, mergeRules } from '../../src/validation/rules.js';
import type { CustomRule } from '../../src/types.js';

describe('BUILT_IN_RULES', () => {
  it('应包含已定义的规则', () => {
    expect(BUILT_IN_RULES.length).toBeGreaterThan(0);
  });

  it.each(BUILT_IN_RULES)('规则 "$name" 应包含必填字段', (rule) => {
    expect(rule.name).toBeTruthy();
    expect(rule.selector).toBeTruthy();
    expect(['error', 'warning']).toContain(rule.severity);
    expect(typeof rule.validate).toBe('function');
  });
});

describe('mergeRules', () => {
  it('无自定义规则时应返回内置规则', () => {
    const rules = mergeRules([]);
    expect(rules).toEqual(BUILT_IN_RULES);
  });

  it('应将自定义规则追加到内置规则之后', () => {
    const custom: CustomRule[] = [
      { name: 'my-rule', selector: '.my-class', severity: 'error' },
    ];
    const rules = mergeRules(custom);
    expect(rules.length).toBe(BUILT_IN_RULES.length + 1);
    expect(rules[rules.length - 1].name).toBe('my-rule');
  });

  it('应将 "info" 严重级别转换为 "warning"', () => {
    const custom: CustomRule[] = [
      { name: 'info-rule', selector: '.info', severity: 'info' },
    ];
    const rules = mergeRules(custom);
    const last = rules[rules.length - 1];
    expect(last.severity).toBe('warning');
  });

  it('应使用 match 模式验证自定义规则', () => {
    const custom: CustomRule[] = [
      {
        name: 'matched-rule',
        selector: '.match-me',
        severity: 'error',
        match: 'error|fail',
      },
    ];
    const rules = mergeRules(custom);
    const last = rules[rules.length - 1];

    const mockEl = { textContent: 'something error happened' } as Element;
    const result = last.validate(mockEl);
    expect(result).toContain('matched-rule');
    expect(result).toContain('error happened');
  });

  it('当 match 模式不匹配时返回空字符串', () => {
    const custom: CustomRule[] = [
      {
        name: 'no-match',
        selector: '.no-match',
        severity: 'warning',
        match: 'NON_EXISTENT',
      },
    ];
    const rules = mergeRules(custom);
    const last = rules[rules.length - 1];
    const mockEl = { textContent: 'clean text' } as Element;
    expect(last.validate(mockEl)).toBe('');
  });
});
