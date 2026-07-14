import type { AuthConfig, SiteConfig, PageInfo, ParseResult, EditResult, SearchResult, RevisionEntry, BatchReadResult, CategoryMembersResult, PaginatedResult } from '../types.js';
import { AuthManager } from './auth.js';
import { ApiError } from '../utils/errors.js';
import { fetchWithRetry } from '../utils/network.js';
import { logger } from '../utils/logger.js';

export class WikiClient {
  private auth: AuthManager;
  private authRetried = false;

  constructor(private config: SiteConfig, auth: AuthConfig) {
    this.auth = new AuthManager(config.api, auth);
  }

  get apiUrl(): string {
    return this.config.api;
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

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Read failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.readPage(page);
      }
      throw new ApiError(`Read failed: ${data.error.info}`, data.error.code);
    }

    const pageData = data?.query?.pages?.[0];

    if (!pageData || pageData.missing) {
      this.authRetried = false;
      return { title: page, content: '', exists: false, last_revision: 0 };
    }

    this.authRetried = false;
    return {
      title: pageData.title,
      content: pageData.revisions?.[0]?.content || '',
      exists: true,
      last_revision: pageData.revisions?.[0]?.revid || 0,
    };
  }

  // ─── Batch read pages ───────────────────────────────────────
  async batchReadPages(pages: string[]): Promise<BatchReadResult> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content|ids',
      titles: pages.join('|'),
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Batch read failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.batchReadPages(pages);
      }
      throw new ApiError(`Batch read failed: ${data.error.info}`, data.error.code);
    }

    this.authRetried = false;
    const pageArray = (data?.query?.pages ?? []) as any[];
    return {
      pages: pageArray.map((p: any) => ({
        title: p.title,
        content: p.revisions?.[0]?.content ?? '',
        exists: !p.missing,
        last_revision: p.revisions?.[0]?.revid ?? 0,
      })),
      missing_count: pageArray.filter((p: any) => p.missing).length,
    };
  }

  // ─── Category members ────────────────────────────────────────
  async getCategoryMembers(category: string, limit = 50, offset?: string): Promise<CategoryMembersResult> {
    await this.ensureAuthenticated();

    const cmtitle = category.startsWith('Category:') ? category : `Category:${category}`;

    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle,
      cmlimit: String(Math.min(limit, 500)),
      format: 'json',
      formatversion: '2',
    });

    if (offset) {
      try {
        const continueParams = JSON.parse(offset) as Record<string, string>;
        for (const [key, value] of Object.entries(continueParams)) {
          params.set(key, String(value));
        }
      } catch {
        // Fallback: treat offset as raw cmcontinue value
        params.set('cmcontinue', offset);
      }
    }

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Category members failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.getCategoryMembers(category, limit, offset);
      }
      throw new ApiError(`Category members failed: ${data.error.info}`, data.error.code);
    }

    this.authRetried = false;
    return {
      members: (data?.query?.categorymembers ?? []).map((m: any) => ({
        title: m.title,
        page_id: m.pageid,
        ns: m.ns,
        sortkey: m.sortkey,
      })),
      has_more: !!(data?.continue?.cmcontinue),
      continue_cursor: data?.continue ? JSON.stringify(data.continue) : undefined,
    };
  }

  // ─── Parse wikitext ────────────────────────────────────────
  async parseWikitext(page?: string, text?: string, title?: string): Promise<ParseResult> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'parse',
      format: 'json',
      formatversion: '2',
      prop: 'text|categories|modules|parsetree|displaytitle|parsewarnings|templates|images|headhtml',
    });

    if (page) params.set('page', page);
    if (text) params.set('text', text);
    if (title && !page) params.set('title', title); // Context for text-mode parsing

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Parse failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.parseWikitext(page, text, title);
      }
      throw new ApiError(`Parse error: ${data.error.info}`);
    }

    this.authRetried = false;
    const parse = data.parse;

    // Extract errors from rendered HTML and parsewarnings
    const errors = this.extractParseErrors(parse.text || '');
    const warnings = this.extractParseWarnings(parse.parsewarnings || [], parse.text || '');

    return {
      html: parse.text || '',
      displaytitle: parse.displaytitle,
      categories: parse.categories?.map((c: any) => c['*'] || c.title || c) || [],
      modules: parse.modules || [],
      templates: parse.templates?.map((t: any) => t['*'] || t.title || t) || [],
      images: parse.images || [],
      parsewarnings: warnings,
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
      if (data.error.code === 'badtoken') {
        // CSRF token expired — refresh and retry once
        logger.warn('CSRF token expired, refreshing...');
        await this.auth.refreshCsrfToken();
        this.authRetried = false;
        return this.editPage(page, content, options);
      }
      // Session might have fully expired (permissiondenied etc.)
      // Try full re-authentication once before giving up
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Edit failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.editPage(page, content, options);
      }
      throw new ApiError(`Edit failed: ${data.error.info}`, data.error.code);
    }

    this.authRetried = false;
    return {
      success: data.edit?.result === 'Success',
      revision: data.edit?.newrevid,
      warnings: [],
    };
  }

  // ─── Search pages ──────────────────────────────────────────
  async searchPages(query: string, limit = 20, namespace = 0, offset?: string): Promise<PaginatedResult<SearchResult>> {
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

    if (offset) {
      try {
        const continueParams = JSON.parse(offset) as Record<string, string>;
        for (const [key, value] of Object.entries(continueParams)) {
          params.set(key, String(value));
        }
      } catch {
        // Fallback: treat offset as raw sroffset value
        params.set('sroffset', offset);
      }
    }

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Search failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.searchPages(query, limit, namespace, offset);
      }
      throw new ApiError(`Search failed: ${data.error.info}`, data.error.code);
    }

    this.authRetried = false;
    return {
      items: (data?.query?.search ?? []).map((s: any) => ({
        title: s.title,
        page_id: s.pageid,
        snippet: s.snippet,
      })),
      has_more: !!(data?.continue?.sroffset),
      continue_cursor: data?.continue ? JSON.stringify(data.continue) : undefined,
    };
  }

  // ─── Get history ───────────────────────────────────────────
  async getHistory(page: string, limit = 20, offset?: string): Promise<PaginatedResult<RevisionEntry>> {
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

    if (offset) {
      try {
        const continueParams = JSON.parse(offset) as Record<string, string>;
        for (const [key, value] of Object.entries(continueParams)) {
          params.set(key, String(value));
        }
      } catch {
        // Fallback: treat offset as raw rvcontinue value
        params.set('rvcontinue', offset);
      }
    }

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`History failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.getHistory(page, limit, offset);
      }
      throw new ApiError(`History failed: ${data.error.info}`, data.error.code);
    }

    this.authRetried = false;
    return {
      items: (data?.query?.pages?.[0]?.revisions ?? []).map((r: any) => ({
        revision: r.revid,
        timestamp: r.timestamp,
        user: r.user,
        comment: r.comment || '',
        minor: !!r.minor,
      })),
      has_more: !!(data?.continue?.rvcontinue),
      continue_cursor: data?.continue ? JSON.stringify(data.continue) : undefined,
    };
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

  // ─── Get revision ──────────────────────────────────────────
  async getRevision(revId: number, page?: string): Promise<import('../types.js').RevisionResult> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      revids: String(revId),
      rvprop: 'content|ids|timestamp|user|comment|flags',
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      throw new ApiError(`Get revision failed: ${data.error.info}`, data.error.code);
    }

    const pageData = data?.query?.pages?.[0];
    if (!pageData || pageData.missing) {
      throw new ApiError(`Revision ${revId} not found`);
    }

    const rev = pageData.revisions?.[0];
    if (!rev) {
      throw new ApiError(`Revision ${revId} not found`);
    }

    return {
      revision: rev.revid,
      page_title: pageData.title,
      content: rev.content || '',
      timestamp: rev.timestamp,
      user: rev.user || '',
      comment: rev.comment || '',
      minor: !!rev.minor,
    };
  }

  // ─── Prefix search ──────────────────────────────────────────
  async prefixSearch(query: string, limit = 20, namespace = 0): Promise<import('../types.js').PaginatedResult<import('../types.js').SearchResult>> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      list: 'prefixsearch',
      pssearch: query,
      pslimit: String(Math.min(limit, 500)),
      psnamespace: String(namespace),
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      throw new ApiError(`Prefix search failed: ${data.error.info}`, data.error.code);
    }

    return {
      items: (data?.query?.prefixsearch ?? []).map((p: any) => ({
        title: p.title,
        page_id: p.pageid,
        snippet: p.title,
      })),
      has_more: !!(data?.continue?.psoffset),
      continue_cursor: data?.continue ? JSON.stringify(data.continue) : undefined,
    };
  }

  // ─── Get recent changes ─────────────────────────────────────
  async getRecentChanges(
    options: { limit?: number; namespace?: number; user?: string; type?: string; offset?: string } = {}
  ): Promise<import('../types.js').PaginatedResult<import('../types.js').RecentChange>> {
    await this.ensureAuthenticated();

    const params = new URLSearchParams({
      action: 'query',
      list: 'recentchanges',
      rcprop: 'title|ids|timestamp|user|comment|flags|sizes',
      rclimit: String(Math.min(options.limit ?? 20, 500)),
      format: 'json',
      formatversion: '2',
    });

    if (options.namespace !== undefined) params.set('rcnamespace', String(options.namespace));
    if (options.user) params.set('rcuser', options.user);
    if (options.type) params.set('rctype', options.type);

    if (options.offset) {
      try {
        const continueParams = JSON.parse(options.offset) as Record<string, string>;
        for (const [key, value] of Object.entries(continueParams)) {
          params.set(key, String(value));
        }
      } catch {
        params.set('rccontinue', options.offset);
      }
    }

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (!this.authRetried) {
        this.authRetried = true;
        logger.warn(`Recent changes failed (${data.error.code}), trying full re-authentication...`);
        await this.auth.reauthenticate();
        return this.getRecentChanges(options);
      }
      throw new ApiError(`Recent changes failed: ${data.error.info}`, data.error.code);
    }

    this.authRetried = false;
    return {
      items: (data?.query?.recentchanges ?? []).map((rc: any) => ({
        title: rc.title,
        page_id: rc.pageid,
        revision: rc.revid,
        type: rc.type,
        user: rc.user,
        timestamp: rc.timestamp,
        comment: rc.comment || '',
        minor: !!rc.minor,
        bot: !!rc.bot,
        new_page: rc.type === 'new',
        ns: rc.ns,
        old_revision: rc.old_revid,
      })),
      has_more: !!(data?.continue?.rccontinue),
      continue_cursor: data?.continue ? JSON.stringify(data.continue) : undefined,
    };
  }

  // ─── Get file info ──────────────────────────────────────────
  async getFile(filename: string): Promise<import('../types.js').FileInfo> {
    await this.ensureAuthenticated();

    const fullName = filename.startsWith('File:') ? filename : `File:${filename}`;

    const params = new URLSearchParams({
      action: 'query',
      prop: 'imageinfo',
      titles: fullName,
      iiprop: 'url|size|mime|user|timestamp',
      format: 'json',
      formatversion: '2',
    });

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      throw new ApiError(`Get file failed: ${data.error.info}`, data.error.code);
    }

    const pageData = data?.query?.pages?.[0];
    if (!pageData || pageData.missing) {
      return { filename: fullName, url: '', description_url: '', exists: false };
    }

    const ii = pageData.imageinfo?.[0];
    return {
      filename: pageData.title,
      url: ii?.url || '',
      description_url: ii?.descriptionurl || '',
      size_bytes: ii?.size,
      width: ii?.width,
      height: ii?.height,
      mime: ii?.mime,
      uploader: ii?.user,
      uploaded_at: ii?.timestamp,
      exists: true,
    };
  }

  // ─── Delete page ────────────────────────────────────────────
  async deletePage(page: string, reason?: string): Promise<{ success: boolean; message: string }> {
    await this.ensureAuthenticated();

    if (!this.auth.csrf) {
      await this.auth.refreshCsrfToken();
    }

    const params = new URLSearchParams({
      action: 'delete',
      title: page,
      token: this.auth.csrf || '',
      format: 'json',
      formatversion: '2',
    });

    if (reason) params.set('reason', reason);

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (data.error.code === 'badtoken') {
        logger.warn('CSRF token expired, refreshing...');
        await this.auth.refreshCsrfToken();
        return this.deletePage(page, reason);
      }
      throw new ApiError(`Delete failed: ${data.error.info}`, data.error.code);
    }

    return { success: true, message: `页面 "${page}" 已删除。` };
  }

  // ─── Undelete page ──────────────────────────────────────────
  async undeletePage(page: string, reason?: string): Promise<{ success: boolean; message: string }> {
    await this.ensureAuthenticated();

    if (!this.auth.csrf) {
      await this.auth.refreshCsrfToken();
    }

    const params = new URLSearchParams({
      action: 'undelete',
      title: page,
      token: this.auth.csrf || '',
      format: 'json',
      formatversion: '2',
    });

    if (reason) params.set('reason', reason);

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (data.error.code === 'badtoken') {
        logger.warn('CSRF token expired, refreshing...');
        await this.auth.refreshCsrfToken();
        return this.undeletePage(page, reason);
      }
      throw new ApiError(`Undelete failed: ${data.error.info}`, data.error.code);
    }

    return { success: true, message: `页面 "${page}" 已恢复。` };
  }

  // ─── Upload file ────────────────────────────────────────────

  async uploadFile(options: {
    filename: string;
    file_url?: string;
    file_path?: string;
    comment?: string;
    text?: string;
  }): Promise<import('../types.js').UploadFileResult> {
    await this.ensureAuthenticated();

    if (!this.auth.csrf) {
      await this.auth.refreshCsrfToken();
    }

    const { filename, file_url, file_path, comment, text } = options;

    if (file_url) {
      return this.uploadFromUrl(filename, file_url, comment, text);
    }

    if (file_path) {
      return this.uploadFromPath(filename, file_path, comment, text);
    }

    throw new ApiError('必须提供 file_url 或 file_path 之一作为文件来源');
  }

  /** Upload file from a remote URL — MediaWiki downloads it server-side. */
  private async uploadFromUrl(
    filename: string,
    file_url: string,
    comment?: string,
    text?: string,
  ): Promise<import('../types.js').UploadFileResult> {
    const params = new URLSearchParams({
      action: 'upload',
      filename,
      url: file_url,
      token: this.auth.csrf || '',
      format: 'json',
      formatversion: '2',
      ignorewarnings: '1',
    });

    if (comment) params.set('comment', comment);
    if (text) params.set('text', text);

    const resp = await fetchWithRetry(this.apiUrl, {
      body: params,
      headers: { Cookie: this.auth.cookieHeader },
    });

    const data = await resp.json() as any;

    if (data.error) {
      if (data.error.code === 'badtoken') {
        logger.warn('CSRF token expired, refreshing...');
        await this.auth.refreshCsrfToken();
        return this.uploadFromUrl(filename, file_url, comment, text);
      }
      throw new ApiError(`Upload failed: ${data.error.info}`, data.error.code);
    }

    return this.parseUploadResponse(data, filename, 'URL');
  }

  /** Upload a local file via multipart/form-data. */
  private async uploadFromPath(
    filename: string,
    file_path: string,
    comment?: string,
    text?: string,
  ): Promise<import('../types.js').UploadFileResult> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const fileBuffer = await fs.readFile(file_path);
    const baseName = path.basename(file_path);

    const formData = new FormData();
    formData.append('action', 'upload');
    formData.append('filename', filename);
    formData.append('token', this.auth.csrf || '');
    formData.append('format', 'json');
    formData.append('formatversion', '2');
    formData.append('ignorewarnings', '1');
    formData.append('file', new Blob([fileBuffer]), baseName);

    if (comment) formData.append('comment', comment);
    if (text) formData.append('text', text);

    const data = await this.fetchFormData(formData);

    if (data.error) {
      if (data.error.code === 'badtoken') {
        logger.warn('CSRF token expired, refreshing...');
        await this.auth.refreshCsrfToken();
        return this.uploadFromPath(filename, file_path, comment, text);
      }
      throw new ApiError(`Upload failed: ${data.error.info}`, data.error.code);
    }

    return this.parseUploadResponse(data, filename, '本地');
  }

  /** Send a FormData request with retry logic (simplified). */
  private async fetchFormData(formData: FormData): Promise<any> {
    const DEFAULT_UA = 'MediaWiki-MCP/0.1.0 (Bot; +https://github.com/mediawiki-mcp)';
    const MAX_RETRIES = 2;
    const TIMEOUT = 60_000; // uploads can be slow

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);

      try {
        const resp = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'User-Agent': DEFAULT_UA,
            Referer: this.apiUrl.replace('/api.php', '/index.php'),
            Cookie: this.auth.cookieHeader,
          },
          body: formData,
          signal: controller.signal,
        });
        return await resp.json();
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error('Upload: unreachable');
  }

  /** Parse standard upload API response. */
  private parseUploadResponse(
    data: any,
    filename: string,
    source: string,
  ): import('../types.js').UploadFileResult {
    if (data.upload?.result === 'Success') {
      return {
        success: true,
        filename: data.upload.filename || filename,
        url: data.upload.imageinfo?.url,
        message: `文件 "${data.upload.filename || filename}" 已从${source}上传成功。`,
      };
    }

    if (data.upload?.result === 'Warning') {
      return {
        success: true,
        filename: data.upload.filename || filename,
        url: data.upload.imageinfo?.url,
        message: `文件 "${data.upload.filename || filename}" 已上传（有警告）。`,
      };
    }

    throw new ApiError(`Upload returned unexpected result: ${JSON.stringify(data)}`);
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

  /** Extract human-readable warnings from the MediaWiki API parsewarnings list. */
  private extractParseWarnings(parsewarnings: string[], html: string): string[] {
    const warnings: string[] = [];

    // API-level parsewarnings (plain text)
    for (const w of parsewarnings) {
      if (w && !warnings.includes(w)) {
        warnings.push(w);
      }
    }

    // Also detect warnings embedded in the rendered HTML
    // (some warnings only appear inline, not in the parsewarnings array)
    const warningDivMatch = html.match(/<span\s+class="[^"]*warning[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);
    if (warningDivMatch) {
      for (const match of warningDivMatch) {
        const text = match.replace(/<[^>]*>/g, '').trim();
        if (text && !warnings.includes(text)) {
          warnings.push(text);
        }
      }
    }

    return warnings;
  }
}
