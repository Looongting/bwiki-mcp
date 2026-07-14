import type { AppConfig, AuthConfig, SiteConfig } from '../types.js';
import { WikiClient } from './api-client.js';
import { ConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Manages multiple WikiClient instances, one per configured site.
 * Clients are created lazily on first access.
 */
export class WikiClientManager {
  private clients = new Map<string, WikiClient>();
  private siteConfigs: Map<string, SiteConfig>;

  constructor(
    private config: AppConfig
  ) {
    this.siteConfigs = new Map(Object.entries(config.sites));
  }

  get defaultSite(): string {
    return this.config.default_site;
  }

  get allSites(): string[] {
    return Array.from(this.siteConfigs.keys());
  }

  getSiteConfig(site?: string): SiteConfig {
    const name = site || this.config.default_site;
    const siteConfig = this.siteConfigs.get(name);
    if (!siteConfig) {
      throw new ConfigError(`Unknown site: "${name}". Available sites: ${this.allSites.join(', ')}`);
    }
    return siteConfig;
  }

  private resolveAuth(siteConfig: SiteConfig): AuthConfig {
    switch (this.config.auth_mode) {
      case 'bot':
        if (!siteConfig.bot) {
          throw new ConfigError(`auth_mode is "bot" but site is missing bot credentials`);
        }
        return { type: 'bot', username: siteConfig.bot.username, password: siteConfig.bot.password };
      case 'cookie':
        if (!this.config.cookie) {
          throw new ConfigError(`auth_mode is "cookie" but top-level cookie credentials are missing`);
        }
        return { type: 'cookie', cookies: this.config.cookie.cookies };
      case 'none':
        return { type: 'none' };
    }
  }

  getClient(site?: string): WikiClient {
    const name = site || this.config.default_site;
    let client = this.clients.get(name);
    if (!client) {
      const siteConfig = this.getSiteConfig(name);
      const auth = this.resolveAuth(siteConfig);
      client = new WikiClient(siteConfig, auth);
      this.clients.set(name, client);
      logger.info(`Created WikiClient for site "${name}" (${siteConfig.url})`);
    }
    return client;
  }
}
