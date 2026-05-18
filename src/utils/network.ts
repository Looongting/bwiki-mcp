const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;

export interface FetchOptions {
  method?: string;
  body?: URLSearchParams;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

const DEFAULT_UA = 'MediaWiki-MCP/0.1.0 (Bot; +https://github.com/mediawiki-mcp)';

export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, method = 'POST', body, headers: extraHeaders } = options;

  // Always set UA and Referer to avoid WAF blocks (e.g. Cloudflare 504)
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_UA,
    'Referer': url.includes('api.php') ? url.replace('/api.php', '/index.php') : url,
    'Content-Type': 'application/x-www-form-urlencoded',
    ...extraHeaders,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      // exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Unreachable');
}
