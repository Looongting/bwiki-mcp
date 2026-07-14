import { readFile, access } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { AppConfig, BrowserConfig, CookieCredentials, SafetyConfig, SiteConfig, ValidationConfig } from './types.js';
import { ConfigError } from './utils/errors.js';
import { logger } from './utils/logger.js';

const DEFAULT_CONFIG: Partial<AppConfig> = {
  auth_mode: 'bot',
  validation: {
    screenshot: true,
    console_errors: true,
    network_errors: true,
    smw_errors: true,
    wait_after_load: 3000,
    custom_rules: [],
    console_ignore: [],
  },
  safety: {
    sandbox_first: false,
    sandbox_page: 'User:${username}/Sandbox',
    auto_backup: true,
    max_edits_per_minute: 10,
  },
  browser: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: 'en',
  },
};

const SITE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function deriveApiUrl(wikiUrl: string): string {
  const base = wikiUrl.replace(/\/+$/, '');
  if (base.includes('api.php')) return base;
  return `${base}/api.php`;
}

function parseBotCredentials(raw: any): { username: string; password: string } | undefined {
  if (!raw) return undefined;
  if (!raw.username) throw new ConfigError('site.bot.username is required when bot auth is configured');
  if (!raw.password) throw new ConfigError('site.bot.password is required when bot auth is configured');
  return { username: raw.username, password: raw.password };
}

function parseCookieCredentials(raw: any): CookieCredentials | undefined {
  if (!raw) return undefined;
  if (!raw.cookies) throw new ConfigError('cookie.cookies is required when cookie auth is configured');
  return { cookies: raw.cookies };
}

function parseAuthMode(raw: any): 'bot' | 'cookie' | 'none' {
  const mode = raw || 'bot';
  if (mode !== 'bot' && mode !== 'cookie' && mode !== 'none') {
    throw new ConfigError(`auth_mode must be "bot", "cookie" or "none", got "${mode}"`);
  }
  return mode;
}

async function findConfigFile(): Promise<string | null> {
  const candidates = [
    './mediawiki-mcp.config.yaml',
    './mediawiki-mcp.config.yml',
    './mediawiki-mcp.config.json',
  ];

  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch { /* not found */ }
  }

  return null;
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = await findConfigFile();
  if (!configPath) {
    throw new ConfigError(
      'No configuration found. Create mediawiki-mcp.config.yaml in the project root.'
    );
  }

  logger.info(`Loaded config from ${configPath}`);
  const content = await readFile(configPath, 'utf-8');
  const parsed = parseYaml(content) as any;

  if (!parsed.sites || typeof parsed.sites !== 'object') {
    throw new ConfigError('Config must contain a "sites" map with at least one entry');
  }

  const defaultSite: string = parsed.default_site || Object.keys(parsed.sites)[0];
  if (!parsed.sites[defaultSite]) {
    throw new ConfigError(`default_site "${defaultSite}" not found in sites`);
  }

  const authMode = parseAuthMode(parsed.auth_mode);

  const sites: Record<string, SiteConfig> = {};
  for (const key of Object.keys(parsed.sites)) {
    if (!SITE_KEY_PATTERN.test(key)) {
      throw new ConfigError(`Invalid site key: "${key}". Must match /^[a-zA-Z][a-zA-Z0-9_-]*$/`);
    }
    const s = parsed.sites[key];
    const bot = parseBotCredentials(s.bot);

    if (authMode === 'bot' && !bot) {
      throw new ConfigError(`auth_mode is "bot" but site "${key}" is missing bot credentials`);
    }

    sites[key] = {
      url: s.url,
      api: s.api || deriveApiUrl(s.url),
      bot,
    };
  }

  const cookie = parseCookieCredentials(parsed.cookie);
  if (authMode === 'cookie' && !cookie) {
    throw new ConfigError('auth_mode is "cookie" but top-level "cookie" credentials are missing');
  }

  const config: AppConfig = {
    default_site: defaultSite,
    auth_mode: authMode,
    cookie,
    sites,
    validation: { ...DEFAULT_CONFIG.validation, ...parsed.validation } as ValidationConfig,
    safety: { ...DEFAULT_CONFIG.safety, ...parsed.safety } as SafetyConfig,
    browser: { ...DEFAULT_CONFIG.browser, ...parsed.browser } as BrowserConfig,
  };

  return config;
}
