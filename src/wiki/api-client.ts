import type { AppConfig, PageInfo, ParseResult, EditResult, SearchResult, RevisionEntry } from '../types.js';
import { AuthManager } from './auth.js';
import { ApiError } from '../utils/errors.js';
import { fetchWithRetry } from '../utils/network.js';
import { logger } from '../utils/logger.js';

export class WikiClient {
  private auth: AuthManager;

  constructor(private config: AppConfig) {
    this.auth = new AuthManager({ wiki: config.wiki, auth: config.auth });
  }

  get apiUrl(): string {
    return this.config.wiki.api;
  }

  get authManager(): AuthManager {
    return this.auth;
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.auth.isAuthenticated) {
      await this.auth.authenticate();
    }
  }

  // ─── Read page ─────────────────────────────────────────────
  async readPage(page: string): Promise<PageInfo> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content|ids',
      titles: page,
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;
    const pageData = data?.query?.pages?.[0];

    if (!pageData || pageData.missing) {
      return { title: page, content: '', exists: false, last_revision: 0 };
    }

    return {
      title: pageData.title,
      content: pageData.revisions?.[0]?.content || '',
      exists: true,
      last_revision: pageData.revisions?.[0]?.revid || 0,
    };
  }

  // ─── Parse wikitext ────────────────────────────────────────
  async parseWikitext(page?: string, text?: string): Promise<ParseResult> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'parse',
      format: 'json',
      formatversion: '2',
      prop: 'text|categories|modules|parsetree',
    });

    if (page) params.set('page', page);
    if (text) params.set('text', text);

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      throw new ApiError(`Parse error: ${data.error.info}`);
    }

    const parse = data.parse;

    // Extract errors from rendered HTML
    const errors = this.extractParseErrors(parse.text || '');

    return {
      html: parse.text || '',
      categories: parse.categories?.map((c: any) => c.title) || [],
      modules: parse.modules || [],
      errors,
    };
  }

  // ─── Edit page ─────────────────────────────────────────────
  async editPage(
    page: string,
    content: string,
    options: { summary?: string; minor?: boolean; bot?: boolean } = {}
  ): Promise<EditResult> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'edit',
      title: page,
      text: content,
      token: this.auth.csrf || '',
      format: 'json',
      formatversion: '2',
    });

    if (options.summary) params.set('summary', options.summary);
    if (options.minor) params.set('minor', '1');
    if (options.bot !== false) params.set('bot', '1');

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      // Token might be expired, try re-authenticating once
      if (data.error.code === 'badtoken') {
        logger.warn('CSRF token expired, re-authenticating...');
        await this.auth.refreshCsrfToken();
        return this.editPage(page, content, options);
      }
      throw new ApiError(`Edit failed: ${data.error.info}`, data.error.code);
    }

    return {
      success: data.edit?.result === 'Success',
      revision: data.edit?.newrevid,
      warnings: [],
    };
  }

  // ─── Search pages ──────────────────────────────────────────
  async searchPages(query: string, limit = 20, namespace = 0): Promise<SearchResult[]> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(Math.min(limit, 500)),
      srnamespace: String(namespace),
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;
    return data?.query?.search?.map((s: any) => ({
      title: s.title,
      page_id: s.pageid,
      snippet: s.snippet,
    })) || [];
  }

  // ─── Get history ───────────────────────────────────────────
  async getHistory(page: string, limit = 20): Promise<RevisionEntry[]> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      titles: page,
      rvprop: 'ids|timestamp|user|comment|minor',
      rvlimit: String(Math.min(limit, 500)),
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;
    return data?.query?.pages?.[0]?.revisions?.map((r: any) => ({
      revision: r.revid,
      timestamp: r.timestamp,
      user: r.user,
      comment: r.comment || '',
      minor: !!r.minor,
    })) || [];
  }

  // ─── Revert page ───────────────────────────────────────────
  async revertPage(page: string, targetRevision: number, summary?: string): Promise<EditResult> {
    // Read the target revision's content
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      titles: page,
      rvprop: 'content',
      rvlimit: '1',
      rvstartid: String(targetRevision),
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;
    const content = data?.query?.pages?.[0]?.revisions?.[0]?.content;

    if (content === undefined) {
      throw new ApiError(`Revision ${targetRevision} not found`);
    }

    return this.editPage(page, content, {
      summary: summary || `Reverted to revision ${targetRevision}`,
    });
  }

  // ─── Parse error extraction helper ─────────────────────────
  private extractParseErrors(html: string): import('../types.js').ParseError[] {
    const errors: import('../types.js').ParseError[] = [];

    // SMW errors
    const smwErrorMatch = html.match(/<div\s+class="[^"]*smw-error[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    if (smwErrorMatch) {
      for (const match of smwErrorMatch) {
        errors.push({
          type: 'smw',
          severity: 'error',
          message: match.replace(/<[^>]*>/g, '').trim(),
          context: match.substring(0, 300),
          selector: '.smw-error',
        });
      }
    }

    // Template errors
    const templateErrorMatch = html.match(/<strong\s+class="error"[^>]*>([\s\S]*?)<\/strong>/gi);
    if (templateErrorMatch) {
      for (const match of templateErrorMatch) {
        errors.push({
          type: 'template',
          severity: 'error',
          message: match.replace(/<[^>]*>/g, '').trim(),
          context: match.substring(0, 300),
          selector: 'strong.error',
        });
      }
    }

    // MediaWiki parser errors
    const mwErrorMatch = html.match(/<div\s+class="[^"]*mw-parse-error[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    if (mwErrorMatch) {
      for (const match of mwErrorMatch) {
        errors.push({
          type: 'parser',
          severity: 'error',
          message: match.replace(/<[^>]*>/g, '').trim(),
          context: match.substring(0, 300),
          selector: '.mw-parse-error',
        });
      }
    }

    return errors;
  }
}
