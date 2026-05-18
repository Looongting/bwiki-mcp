import { diffLines, type Change } from 'diff';

export interface DiffResult {
  diff: string;
  stats: { added: number; removed: number };
}

export function generateDiff(oldText: string, newText: string): DiffResult {
  const changes = diffLines(oldText, newText);
  let added = 0;
  let removed = 0;
  const lines: string[] = [];

  for (const change of changes) {
    if (change.added) {
      added += change.count || 0;
      for (const line of change.value.split('\n').filter(Boolean)) {
        lines.push(`+ ${line}`);
      }
    } else if (change.removed) {
      removed += change.count || 0;
      for (const line of change.value.split('\n').filter(Boolean)) {
        lines.push(`- ${line}`);
      }
    } else {
      // Context lines - show only first/last few
      const contextLines = change.value.split('\n').filter(Boolean);
      if (contextLines.length <= 4) {
        for (const line of contextLines) {
          lines.push(`  ${line}`);
        }
      } else {
        lines.push(`  ${contextLines[0]}`);
        lines.push(`  ${contextLines[1]}`);
        lines.push('  ...');
        lines.push(`  ${contextLines[contextLines.length - 1]}`);
      }
    }
  }

  return {
    diff: lines.join('\n'),
    stats: { added, removed },
  };
}
