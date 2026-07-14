// Shared type definitions for mediawiki-mcp

// ─── Configuration ────────────────────────────────────────────
export interface WikiConfig {
  url: string;
  api: string;
}

export type AuthConfig =
  | { type: 'bot'; username: string; password: string }
  | { type: 'cookie'; cookies: string }
  | { type: 'none' };

export interface BotCredentials {
  username: string;
  password: string;
}

export interface CookieCredentials {
  cookies: string;
}

export type AuthMode = 'bot' | 'cookie' | 'none';

export interface SiteConfig extends WikiConfig {
  bot?: BotCredentials;
}

export interface ValidationConfig {
  screenshot: boolean;
  console_errors: boolean;
  network_errors: boolean;
  smw_errors: boolean;
  wait_after_load: number;
  custom_rules: CustomRule[];
  /** Regex patterns for console log entries to ignore as noise (e.g. platform gadget logs). */
  console_ignore?: string[];
}

export interface CustomRule {
  name: string;
  selector: string;
  match?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface SafetyConfig {
  sandbox_first: boolean;
  sandbox_page: string;
  auto_backup: boolean;
  max_edits_per_minute: number;
}

export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  locale: string;
}

export interface AppConfig {
  default_site: string;
  auth_mode: AuthMode;
  cookie?: CookieCredentials;
  sites: Record<string, SiteConfig>;
  validation: ValidationConfig;
  safety: SafetyConfig;
  browser: BrowserConfig;
}

// ─── MediaWiki API ────────────────────────────────────────────
export interface PageInfo {
  title: string;
  content: string;
  exists: boolean;
  last_revision: number;
}

export interface ParseResult {
  html: string;
  /** Rendered page title (may differ from input for displaytitle magic words) */
  displaytitle?: string;
  categories: string[];
  modules: string[];
  /** Templates used in the page (title → ns mapping) */
  templates: string[];
  /** Images used in the page */
  images: string[];
  /** Parser warnings (non-fatal issues) */
  parsewarnings: string[];
  errors: ParseError[];
}

export interface EditResult {
  success: boolean;
  revision?: number;
  sandbox_page?: string;
  diff?: string;
  warnings: string[];
}

export interface SearchResult {
  title: string;
  page_id: number;
  snippet: string;
}

export interface SmwQueryResult {
  results: Record<string, any>[];
  format: string;
  count: number;
  errors: string[];
  raw: string;
}

export interface RevisionEntry {
  revision: number;
  timestamp: string;
  user: string;
  comment: string;
  minor: boolean;
}

// ─── Errors & Validation ──────────────────────────────────────
export interface ParseError {
  type: 'template' | 'smw' | 'parser' | 'category' | 'unknown';
  severity: 'error' | 'warning';
  message: string;
  context: string;
  selector: string;
}

export interface BrowserConsoleEntry {
  level: string;
  text: string;
  timestamp: number;
}

export interface BrowserNetworkEntry {
  url: string;
  status: number;
  method: string;
  error?: string;
}

export interface BrowserPageError {
  message: string;
  stack?: string;
}

export interface VisualAnomaly {
  type: 'empty_area' | 'missing_content' | 'raw_wikitext' | 'layout_break';
  severity: 'error' | 'warning';
  description: string;
}

export interface ValidationReport {
  page: string;
  parse_errors: ParseError[];
  browser_errors: BrowserPageError[];
  console_logs: BrowserConsoleEntry[];
  network_errors: BrowserNetworkEntry[];
  anomalies: VisualAnomaly[];
  screenshot_path?: string;
  summary: string;
}

export interface BrowserCaptureResult {
  url: string;
  screenshot?: string;
  console_entries: BrowserConsoleEntry[];
  network_entries: BrowserNetworkEntry[];
  page_errors: BrowserPageError[];
  dom_snapshot?: string;
}

// ─── Batch Read ───────────────────────────────────────────────
export interface BatchPageResult {
  title: string;
  content: string;
  exists: boolean;
  last_revision: number;
}

export interface BatchReadResult {
  pages: BatchPageResult[];
  missing_count: number;
}

// ─── Category Members ─────────────────────────────────────────
export interface CategoryMember {
  title: string;
  page_id: number;
  ns: number;
  sortkey?: string;
}

export interface CategoryMembersResult {
  members: CategoryMember[];
  has_more: boolean;
  continue_cursor?: string;
}

// ─── Unified Pagination ───────────────────────────────────────
export interface PaginatedResult<T> {
  items: T[];
  has_more: boolean;
  continue_cursor?: string;
}

// ─── MCP Tool Inputs ──────────────────────────────────────────
export interface ReadInput {
  page: string;
  section?: number;
  site?: string;
}

export interface EditInput {
  page: string;
  content?: string;
  /** 要在页面中查找的文本（与 new_string 配合，执行查找替换） */
  old_string?: string;
  /** 替换后的文本（与 old_string 配合） */
  new_string?: string;
  /** 替换所有匹配项（默认 false，仅替换首个） */
  replace_all?: boolean;
  summary?: string;
  minor?: boolean;
  bot?: boolean;
  dry_run?: boolean;
  sandbox?: boolean;
  site?: string;
}

export interface ParseInput {
  page?: string;
  text?: string;
  /** 解析文本时使用的虚拟页面标题（帮助解析器正确处理相对链接和模板参数，不影响实际页面） */
  title?: string;
  mobile?: boolean;
  site?: string;
}

export interface ValidateInput {
  page?: string;
  text?: string;
  screenshot?: boolean;
  browser?: boolean;
  rules?: string[];
  site?: string;
}

export interface SmwQueryInput {
  query: string;
  format?: string;
  limit?: number;
  site?: string;
}

export interface BrowserCaptureInput {
  page: string;
  wait_ms?: number;
  screenshot?: boolean;
  full_page?: boolean;
  site?: string;
}

export interface DiffInput {
  page: string;
  from_revision?: number;
  to_content?: string;
  site?: string;
}

export interface RevertInput {
  page: string;
  revision: number;
  summary?: string;
  site?: string;
}

export interface SearchInput {
  query: string;
  limit?: number;
  namespace?: number;
  offset?: string;
  site?: string;
}

export interface HistoryInput {
  page: string;
  limit?: number;
  offset?: string;
  site?: string;
}

export interface BatchReadInput {
  pages: string[];
  site?: string;
}

export interface CategoryMembersInput {
  category: string;
  limit?: number;
  offset?: string;
  site?: string;
}

// ─── P1: New tool types ─────────────────────────────────────────

export interface RevisionResult {
  revision: number;
  page_title: string;
  content: string;
  timestamp: string;
  user: string;
  comment: string;
  minor: boolean;
}

export interface GetRevisionInput {
  page?: string;
  revision: number;
  site?: string;
}

export interface FileInfo {
  filename: string;
  url: string;
  description_url: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  mime?: string;
  uploader?: string;
  uploaded_at?: string;
  exists: boolean;
}

export interface GetFileInput {
  filename: string;
  site?: string;
}

export interface RecentChange {
  title: string;
  page_id: number;
  revision: number;
  type: 'edit' | 'new' | 'log' | 'categorize' | 'external';
  user: string;
  timestamp: string;
  comment: string;
  minor: boolean;
  bot: boolean;
  new_page: boolean;
  ns: number;
  old_revision: number;
}

export interface RecentChangesInput {
  limit?: number;
  namespace?: number;
  user?: string;
  type?: string;
  offset?: string;
  site?: string;
}

export interface DeletePageInput {
  page: string;
  reason?: string;
  confirm: boolean;
  site?: string;
}

export interface UndeletePageInput {
  page: string;
  reason?: string;
  confirm: boolean;
  site?: string;
}

export interface UploadFileInput {
  filename: string;
  /** 本地文件路径（与 file_url 二选一） */
  file_path?: string;
  /** 远程文件 URL（与 file_path 二选一） */
  file_url?: string;
  comment?: string;
  /** 文件描述页面内容（可选） */
  text?: string;
  site?: string;
}

export interface UploadFileResult {
  success: boolean;
  filename: string;
  url?: string;
  message: string;
}
