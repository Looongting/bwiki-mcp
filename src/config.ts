import { readFile, access } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AppConfig, AuthConfig, BrowserConfig, SafetyConfig, ValidationConfig, WikiConfig } from './types.js';
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

function deriveApiUrl(wikiUrl: string): string {
  const base = wikiUrl.replace(/\/+$/, '');
  if (base.includes('api.php')) return base;
  return `${base}/api.php`;
}

// Try to load .env file from project or parent directory
function tryLoadDotenv(): void {
  const candidates = [
    '.env',
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        let key = '';
        let val = '';
        if (trimmed.includes('=')) {
          const eqIdx = trimmed.indexOf('=');
          key = trimmed.slice(0, eqIdx).trim();
          val = trimmed.slice(eqIdx + 1).trim();
        } else if (trimmed.includes(':')) {
          // Only treat as KEY:VAL if the part before : is a valid env var name
          const colonIdx = trimmed.indexOf(':');
          const candidate = trimmed.slice(0, colonIdx).trim();
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)) {
            key = candidate;
            val = trimmed.slice(colonIdx + 1).trim();
          }
        }
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
      logger.info(`Loaded env vars from ${file}`);
      return;
    }
  }
}

// Normalize env var names: support BOT_NAME/BOT_PASSWORD/WIKI_URL aliases
function normalizeEnv(): void {
  const aliases: Record<string, string> = {
    BOT_NAME: 'MW_USERNAME',
    BOT_PASSWORD: 'MW_PASSWORD',
    WIKI_URL: 'MW_URL',
    WIKI_API: 'MW_API',
  };
  for (const [from, to] of Object.entries(aliases)) {
    if (process.env[from] && !process.env[to]) {
      process.env[to] = process.env[from];
    }
  }
}

function loadAuthFromEnv(): AuthConfig | null {
  const type = process.env['MW_AUTH_TYPE'] || 'bot';

  switch (type) {
    case 'bot':
      return {
        type: 'bot',
        username: requireEnv('MW_USERNAME'),
        password: requireEnv('MW_PASSWORD'),
      };
    default:
      throw new ConfigError(`Unsupported auth type from env: ${type}`);
  }
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new ConfigError(`Environment variable ${name} is required`);
  return val;
}

function loadConfigFromEnv(): Partial<AppConfig> | null {
  if (!process.env['MW_URL']) return null;

  const url = process.env['MW_URL'];
  const auth = loadAuthFromEnv();

  return {
    wiki: {
      url,
      api: process.env['MW_API'] || deriveApiUrl(url),
    },
    ...(auth ? { auth } : {}),
  };
}

async function findConfigFile(): Promise<string | null> {
  const candidates = [
    './mediawiki-mcp.config.yaml',
    './mediawiki-mcp.config.yml',
    './mediawiki-mcp.config.json',
    process.env['MW_CONFIG'] || null,
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch { /* not found */ }
  }

  // also try XDG / user home
  const home = process.env['HOME'] || process.env['USERPROFILE'];
  if (home) {
    const homeConfig = `${home}/.config/mediawiki-mcp/config.yaml`;
    try {
      await access(homeConfig);
      return homeConfig;
    } catch { /* not found */ }
  }

  return null;
}

async function loadConfigFromFile(path: string): Promise<Partial<AppConfig>> {
  const content = await readFile(path, 'utf-8');
  const parsed = parseYaml(content) as any;

  const wiki: WikiConfig = {
    url: parsed.wiki?.url,
    api: parsed.wiki?.api || deriveApiUrl(parsed.wiki?.url || ''),
  };

  let auth: AuthConfig | undefined;
  if (parsed.auth) {
    if (parsed.auth.type === 'bot') {
      auth = {
        type: 'bot',
        username: parsed.auth.username,
        password: parsed.auth.password,
      };
    } else if (parsed.auth.type === 'oauth') {
      auth = {
        type: 'oauth',
        consumer_key: parsed.auth.consumer_key,
        consumer_secret: parsed.auth.consumer_secret,
        access_token: parsed.auth.access_token,
        access_secret: parsed.auth.access_secret,
      };
    } else if (parsed.auth.type === 'cookie') {
      auth = {
        type: 'cookie',
        cookie_file: parsed.auth.cookie_file,
      };
    }
  }

  const config: Partial<AppConfig> = { wiki };
  if (auth) config.auth = auth;

  if (parsed.validation) {
    const merged = { ...DEFAULT_CONFIG.validation, ...parsed.validation } as import('./types.js').ValidationConfig;
    if (Array.isArray(parsed.validation.console_ignore)) {
      merged.console_ignore = parsed.validation.console_ignore;
    }
    config.validation = merged;
  }
  if (parsed.safety) config.safety = { ...DEFAULT_CONFIG.safety, ...parsed.safety };
  if (parsed.browser) config.browser = { ...DEFAULT_CONFIG.browser, ...parsed.browser };

  return config;
}

export async function loadConfig(): Promise<AppConfig> {
  // Auto-load .env file and normalize var names
  tryLoadDotenv();
  normalizeEnv();

  // Priority: env vars > config file > defaults
  const envConfig = loadConfigFromEnv();
  if (envConfig?.wiki) {
    logger.info('Loaded config from environment variables');
    return mergeConfig(envConfig);
  }

  const configPath = await findConfigFile();
  if (configPath) {
    logger.info(`Loaded config from ${configPath}`);
    const fileConfig = await loadConfigFromFile(configPath);
    return mergeConfig(fileConfig);
  }

  throw new ConfigError(
    'No configuration found. Set MW_URL environment variable or create mediawiki-mcp.config.yaml'
  );
}

function mergeConfig(partial: Partial<AppConfig>): AppConfig {
  if (!partial.wiki?.url) throw new ConfigError('wiki.url is required');

  const auth = partial.auth;
  if (!auth) throw new ConfigError('Authentication config is required');

  return {
    wiki: {
      url: partial.wiki.url,
      api: partial.wiki.api || deriveApiUrl(partial.wiki.url),
    },
    auth,
    validation: { ...DEFAULT_CONFIG.validation, ...partial.validation } as ValidationConfig,
    safety: { ...DEFAULT_CONFIG.safety, ...partial.safety } as SafetyConfig,
    browser: { ...DEFAULT_CONFIG.browser, ...partial.browser } as BrowserConfig,
  };
}
