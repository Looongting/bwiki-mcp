import { readFile, access } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { AppConfig, AuthConfig, BrowserConfig, SafetyConfig, SiteConfig, ValidationConfig } from './types.js';
import { ConfigError } from './utils/errors.js';
import { logger } from './utils/logger.js';

const DEFAULT_CONFIG: Partial<AppConfig> = {
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

function parseAuth(raw: any): AuthConfig {
  if (!raw || !raw.type) throw new ConfigError('auth.type is required');
  switch (raw.type) {
    case 'bot':
      if (!raw.username) throw new ConfigError('auth.username is required for bot auth');
      if (!raw.password) throw new ConfigError('auth.password is required for bot auth');
      return { type: 'bot', username: raw.username, password: raw.password };
    case 'oauth':
      return { type: 'oauth', consumer_key: raw.consumer_key, consumer_secret: raw.consumer_secret, access_token: raw.access_token, access_secret: raw.access_secret };
    case 'cookie':
      return { type: 'cookie', cookie_file: raw.cookie_file };
    case 'none':
      return { type: 'none' };
    default:
      throw new ConfigError(`Unsupported auth type: ${raw.type}`);
  }
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

  const sites: Record<string, SiteConfig> = {};
  for (const key of Object.keys(parsed.sites)) {
    if (!SITE_KEY_PATTERN.test(key)) {
      throw new ConfigError(`Invalid site key: "${key}". Must match /^[a-zA-Z][a-zA-Z0-9_-]*$/`);
    }
    const s = parsed.sites[key];
    sites[key] = {
      url: s.url,
      api: s.api || deriveApiUrl(s.url),
      auth: parseAuth(s.auth),
    };
  }

  const config: AppConfig = {
    default_site: defaultSite,
    sites,
    validation: { ...DEFAULT_CONFIG.validation, ...parsed.validation } as ValidationConfig,
    safety: { ...DEFAULT_CONFIG.safety, ...parsed.safety } as SafetyConfig,
    browser: { ...DEFAULT_CONFIG.browser, ...parsed.browser } as BrowserConfig,
  };

  return config;
}
