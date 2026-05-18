import type { ValidationReport } from '../types.js';

export function formatReport(report: ValidationReport): { markdown: string; json: string } {
  const markdown = report.summary || '无验证结果';

  const json = JSON.stringify(
    {
      page: report.page,
      error_count: (report.parse_errors?.length || 0) + (report.browser_errors?.length || 0),
      warning_count: (report.console_logs?.filter(l => l.level === 'warning').length || 0) +
        (report.anomalies?.filter(a => a.severity === 'warning').length || 0),
      parse_errors: report.parse_errors?.map(e => ({
        type: e.type,
        severity: e.severity,
        message: e.message.substring(0, 500),
      })) || [],
      browser_errors: report.browser_errors?.map(e => ({
        message: e.message.substring(0, 500),
      })) || [],
      network_errors: report.network_errors?.slice(0, 10).map(e => ({
        url: e.url,
        status: e.status,
        error: e.error,
      })) || [],
      has_screenshot: !!report.screenshot_path,
    },
    null,
    2
  );

  return { markdown, json };
}

export function mcpContent(report: ValidationReport): any[] {
  const { markdown, json } = formatReport(report);

  const content: any[] = [
    { type: 'text', text: markdown },
  ];

  // Attach JSON as a separate resource if there are errors
  if (json.length < 10000) {
    content.push({
      type: 'resource',
      resource: {
        text: json,
        mimeType: 'application/json',
        uri: 'data:application/json,' + encodeURIComponent(json),
      },
    });
  }

  return content;
}
