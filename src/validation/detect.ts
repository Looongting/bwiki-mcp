import type { ParseError, BrowserCaptureResult, ValidationReport, VisualAnomaly, BrowserConsoleEntry, BrowserNetworkEntry } from '../types.js';
import { mergeRules, type DetectionRule } from './rules.js';
import { BUILT_IN_RULES } from './rules.js';

/** Console log patterns that are known platform noise (not actual page issues). */
const NOISE_PATTERNS: RegExp[] = [
  /getData\(dbUserName\)[^]*个人配置尚未初始化/,
  /COLS:\s*response timeout/,
  /bili-mirror[^]*kv-config/,
  /GAME_PB_INS/,
  /BLoader/,
  /BwikiTune/,
  /BWIKI工具库/,
  /Material Symbols 图标库/,
  /BWikiUser.*BwikiLibrary.*PageView/,
  /game-report/,
  /ReporterPb/,
  /Report PV/,
  /jquery 事件触发/,
  /DOMContentLoaded 事件触发/,
  /load 事件触发/,
  /ext\.echo\.special is not available/,
  /Widget:.*版载入/i,
  /history\.length \d+/,
  /load MediaWiki:Common\.js/,
  /VSCode Button extension/,
  /^页面浏览量/,
  /Reported PV/,
  /bili-fe-mirror/,
  /Start report\.\.\./,
  /flowthread.*LOG from/,
  /moderation.*LOG from/,
  /undefined LOG \(from:/,
  /event_id.*sourcefrom.*wiki_name/,
  /^\d+ .* bili-mirror /,
];

function isNoise(entry: BrowserConsoleEntry, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(entry.text));
}

/** Filter out 301 redirects (normal MediaWiki canonical URL behavior). */
function isNormalRedirect(entry: BrowserNetworkEntry): boolean {
  return entry.status === 301;
}

export class ErrorDetector {
  private rules: DetectionRule[];
  private noisePatterns: RegExp[];

  constructor(customRules: import('../types.js').CustomRule[] = [], consoleIgnore: string[] = []) {
    this.rules = mergeRules(customRules);
    this.noisePatterns = [
      ...NOISE_PATTERNS,
      ...consoleIgnore.map(p => new RegExp(p, 'i')),
    ];
  }

  detectFromHtml(html: string): ParseError[] {
    const errors: ParseError[] = [];

    // Parse HTML with regex for simple pattern matching (no DOM needed)
    for (const rule of BUILT_IN_RULES) {
      // Skip selector-only rules (those with pseudo-selectors like :empty)
      if (rule.selector.includes(':')) continue;

      // Strip leading dot from CSS class selector; it's not part of the class name in HTML
      const classPattern = rule.selector.startsWith('.') ? rule.selector.slice(1) : rule.selector;
      const pattern = classPattern.replace('.', '\\.').replace(/-/g, '\\-');
      const regex = new RegExp(
        `<[^>]*class="[^"]*${pattern}[^"]*"[^>]*>([\\s\\S]*?)<\\/\\w+>`,
        'gi'
      );

      let match;
      while ((match = regex.exec(html)) !== null) {
        errors.push({
          type: this.mapSeverityToType(rule.name),
          severity: rule.severity,
          message: match[1]?.replace(/<[^>]*>/g, '').trim() || `匹配到规则: ${rule.name}`,
          context: match[0].substring(0, 300),
          selector: rule.selector,
        });
      }
    }

    // SMW-specific text patterns (for wikis where SMW errors don't use standard CSS classes)
    const smwTextPatterns = [
      /SMW[^。]*?错误[:：]?[^<]*/gi,
      /语义[^。]*?错误[:：]?[^<]*/gi,
      /Semantic MediaWiki[^。]*?error[:：]?[^<]*/gi,
      /查询[^。]*?格式错误[^<]*/gi,
    ];
    for (const pattern of smwTextPatterns) {
      let m;
      while ((m = pattern.exec(html)) !== null) {
        const text = m[0].trim();
        if (text.length > 5 && text.length < 200) {
          errors.push({
            type: 'smw',
            severity: 'error',
            message: text,
            context: html.substring(Math.max(0, m.index - 50), m.index + text.length + 50),
            selector: 'text',
          });
        }
      }
    }

    // Red links (a.new)
    const redLinkRegex = /<a\s+[^>]*class="[^"]*\bnew\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = redLinkRegex.exec(html)) !== null) {
      errors.push({
        type: 'template',
        severity: 'warning',
        message: `链接到不存在的页面: ${linkMatch[1]?.replace(/<[^>]*>/g, '').trim()}`,
        context: linkMatch[0].substring(0, 200),
        selector: 'a.new',
      });
    }

    // Check for raw wikitext patterns that weren't rendered
    if (html.includes('{{') && html.includes('}}')) {
      const unrendered = html.match(/\{\{[^}]+}}/g);
      if (unrendered) {
        errors.push({
          type: 'parser',
          severity: 'warning',
          message: `检测到未渲染的模板: ${unrendered.slice(0, 3).join(', ')}`,
          context: unrendered.slice(0, 3).join(', '),
          selector: 'text',
        });
      }
    }

    return errors;
  }

  detectFromBrowserCapture(capture: BrowserCaptureResult): {
    browser_errors: import('../types.js').BrowserPageError[];
    console_logs: import('../types.js').BrowserConsoleEntry[];
    network_errors: import('../types.js').BrowserNetworkEntry[];
    anomalies: VisualAnomaly[];
  } {
    const anomalies: VisualAnomaly[] = [];

    // Filter console entries: remove known platform noise
    const relevantConsole = capture.console_entries.filter(e => !isNoise(e, this.noisePatterns));
    // Filter network entries: remove normal 301 redirects
    const relevantNetwork = capture.network_entries.filter(e => !isNormalRedirect(e));

    // Check DOM snapshot for visual issues
    if (capture.dom_snapshot) {
      // Empty containers (SMW results, content areas)
      const emptyPattern = /<div[^>]*class="[^"]*(?:smw-results|smw-table|mw-content)[^"]*"[^>]*><\/div>/gi;
      if (emptyPattern.test(capture.dom_snapshot)) {
        anomalies.push({
          type: 'missing_content',
          severity: 'warning',
          description: '检测到空容器，可能内容未正确渲染',
        });
      }

      // Raw wikitext visible in rendered output
      if (capture.dom_snapshot.includes('{{') || capture.dom_snapshot.includes('}}')) {
        anomalies.push({
          type: 'raw_wikitext',
          severity: 'error',
          description: '页面中可见未解析的维基文本标记',
        });
      }

      // SMW error visible in rendered DOM (some wikis render SMW errors inline)
      if (/smw-error|SMW.*error|语义.*错误/i.test(capture.dom_snapshot)) {
        anomalies.push({
          type: 'missing_content',
          severity: 'error',
          description: '渲染结果中包含语义查询错误',
        });
      }
    }

    return {
      browser_errors: capture.page_errors,
      console_logs: relevantConsole,
      network_errors: relevantNetwork,
      anomalies,
    };
  }

  generateSummary(report: Partial<ValidationReport>): string {
    const parts: string[] = ['## 验证摘要'];
    const totalErrors = (report.parse_errors?.length || 0)
      + (report.browser_errors?.length || 0)
      + (report.anomalies?.filter(a => a.severity === 'error').length || 0)
      + (report.console_logs?.filter(l => l.level === 'error').length || 0);
    const totalWarnings = (report.parse_errors?.filter(e => e.severity === 'warning').length || 0)
      + (report.anomalies?.filter(a => a.severity === 'warning').length || 0)
      + (report.console_logs?.filter(l => l.level === 'warning').length || 0);

    if (totalErrors === 0 && totalWarnings === 0) {
      parts.push('状态：✅ 通过 - 未发现问题');
      return parts.join('\n\n');
    }

    parts.push(`状态：⚠️ 发现 ${totalErrors} 个错误, ${totalWarnings} 个警告\n`);

    if (report.parse_errors && report.parse_errors.length > 0) {
      parts.push('### 服务端解析错误');
      for (const err of report.parse_errors) {
        const tag = err.severity === 'error' ? '🔴' : '🟡';
        parts.push(`- ${tag} [${err.type}] ${err.message.substring(0, 200)}`);
      }
    }

    if (report.browser_errors && report.browser_errors.length > 0) {
      parts.push('### 浏览器 JavaScript 错误');
      for (const err of report.browser_errors) {
        parts.push(`- 🔴 ${err.message.substring(0, 200)}`);
      }
    }

    if (report.network_errors && report.network_errors.length > 0) {
      parts.push('### 网络请求错误');
      for (const err of report.network_errors.slice(0, 5)) {
        parts.push(`- 🔴 ${err.url} (${err.status}): ${err.error || '请求失败'}`);
      }
    }

    if (report.console_logs && report.console_logs.length > 0) {
      const errors = report.console_logs.filter(l => l.level === 'error');
      const warnings = report.console_logs.filter(l => l.level === 'warning');
      if (errors.length > 0) {
        parts.push(`### 控制台错误 (${errors.length} 条)`);
        for (const log of errors.slice(0, 3)) {
          parts.push(`- 🔴 ${log.text.substring(0, 200)}`);
        }
      }
      if (warnings.length > 0) {
        parts.push(`### 控制台警告 (${warnings.length} 条)`);
        for (const log of warnings.slice(0, 3)) {
          parts.push(`- 🟡 ${log.text.substring(0, 200)}`);
        }
      }
    }

    if (report.anomalies && report.anomalies.length > 0) {
      parts.push('### 视觉异常');
      for (const a of report.anomalies) {
        const tag = a.severity === 'error' ? '🔴' : '🟡';
        parts.push(`- ${tag} [${a.type}] ${a.description}`);
      }
    }

    return parts.join('\n');
  }

  private mapSeverityToType(ruleName: string): ParseError['type'] {
    if (ruleName.startsWith('smw')) return 'smw';
    if (ruleName.startsWith('template')) return 'template';
    if (ruleName.startsWith('mw-parse')) return 'parser';
    return 'unknown';
  }
}
