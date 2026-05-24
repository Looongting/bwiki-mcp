// Shared type definitions for mediawiki-mcp

// ─── Configuration ────────────────────────────────────────────
export interface WikiConfig {
  url: string;
  api: string;
}

export type AuthConfig =
  | { type: 'bot'; username: string; password: string }
  | { type: 'oauth'; consumer_key: string; consumer_secret: string; access_token: string; access_secret: string }
  | { type: 'cookie'; cookie_file: string }
  | { type: 'none' };

export interface SiteConfig extends WikiConfig {
  auth: AuthConfig;
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
  categories: string[];
  modules: string[];
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

// ─── MCP Tool Inputs ──────────────────────────────────────────
export interface ReadInput {
  page: string;
  section?: number;
  site?: string;
}

export interface EditInput {
  page: string;
  content: string;
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

export interface HistoryInput {
  page: string;
  limit?: number;
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
  site?: string;
}
