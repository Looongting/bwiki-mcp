import { describe, it, expect } from 'vitest';
import { generateDiff } from '../../src/safety/diff.js';

describe('generateDiff', () => {
  it('应检测新增行', () => {
    const result = generateDiff('line1\nline2', 'line1\nline2\nline3');
    expect(result.stats.added).toBeGreaterThan(0);
    expect(result.diff).toContain('line3');
  });

  it('应检测删除行', () => {
    const result = generateDiff('line1\nline2\nline3', 'line1\nline3');
    expect(result.stats.added).toBe(0);
    expect(result.stats.removed).toBe(1);
  });

  it('相同内容应无差异', () => {
    const result = generateDiff('line1\nline2', 'line1\nline2');
    expect(result.stats.added).toBe(0);
    expect(result.stats.removed).toBe(0);
  });

  it('应处理空旧文本', () => {
    const result = generateDiff('', 'new content');
    expect(result.stats.added).toBeGreaterThan(0);
  });

  it('应处理空新文本', () => {
    const result = generateDiff('old content', '');
    expect(result.stats.removed).toBeGreaterThan(0);
  });

  it('应截断长上下文段落', () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) lines.push(`context line ${i}`);
    const oldText = lines.join('\n');
    const newText = [...lines, 'new line'].join('\n');

    const result = generateDiff(oldText, newText);
    expect(result.diff).toContain('...');
  });

  it('小段落应显示完整上下文', () => {
    const oldText = 'a\nb\nc';
    const newText = 'a\nb\nc\nd';
    const result = generateDiff(oldText, newText);
    expect(result.diff).not.toContain('...');
  });

  it('应生成带 +/- 前缀的有效差异格式', () => {
    const result = generateDiff('old line', 'new line');
    const diffLines = result.diff.split('\n');
    expect(diffLines.some((l) => l.startsWith('- '))).toBe(true);
    expect(diffLines.some((l) => l.startsWith('+ '))).toBe(true);
  });
});
