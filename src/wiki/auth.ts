import crypto from 'node:crypto';
import type { AuthConfig, WikiConfig } from '../types.js';
import { AuthError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { fetchWithRetry } from '../utils/network.js';

/**
 * This wiki requires SESSDATA cookie to be present on every request,
 * even for bot-password login via the API. The value itself is not
 * validated — the wiki simply checks for the cookie's existence.
 * Without it, login fails with "session timed out".
 */
export class AuthManager {
  private cookies: string[] = [];
  private csrfToken: string | null = null;
  private _isAuthenticated = false;

  constructor(
    private readonly config: { wiki: WikiConfig; auth: AuthConfig }
  ) {}

  get isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  get csrf(): string | null {
    return this.csrfToken;
  }

  get cookieHeader(): string {
    return this.cookies.join('; ');
  }

  /** Extract just `name=value` from a raw Set-Cookie string, stripping attributes. */
  private static parseSetCookie(raw: string): string {
    const idx = raw.indexOf(';');
    return idx === -1 ? raw.trim() : raw.slice(0, idx).trim();
  }

  /** Set fake SESSDATA + session cookies so the wiki accepts our login.
   *  This wiki (biligame) requires SESSDATA cookie to be present on every
   *  API request — the value is not validated, only its existence matters. */
  private setFakeCookies(): void {
    const sessdata = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const sessionId = crypto.randomUUID().replace(/-/g, '');
    this.cookies = [
      `SESSDATA=${sessdata}`,
      `gamecenter_wiki__session=${sessionId}`,
    ];
    logger.info('Set fake SESSDATA and session cookies');
  }

  /** Merge Set-Cookie headers into our cookie jar, replacing by name. */
  private mergeCookies(setCookieHeaders: string[]): void {
    for (const raw of setCookieHeaders) {
      const parsed = AuthManager.parseSetCookie(raw);
      if (!parsed) continue;
      const name = parsed.split('=')[0];
      const idx = this.cookies.findIndex(c => c.startsWith(name + '='));
      if (idx >= 0) {
        this.cookies[idx] = parsed;
      } else {
        this.cookies.push(parsed);
      }
    }
  }

  async authenticate(): Promise<void> {
    // Step 0: set fake SESSDATA + session cookies before any request
    this.setFakeCookies();

    const { auth } = this.config;

    switch (auth.type) {
      case 'bot':
        await this.loginWithBotPassword(auth.username, auth.password);
        break;
      case 'oauth':
        throw new AuthError('OAuth not yet implemented');
      case 'cookie':
        throw new AuthError('Cookie auth not yet implemented');
    }

    await this.fetchCsrfToken();
    this._isAuthenticated = true;
    logger.info('Authenticated with MediaWiki');
  }

  private async loginWithBotPassword(username: string, password: string): Promise<void> {
    // Step 1: Get login token with fake SESSDATA + session cookies
    const tokenUrl = `${this.config.wiki.api}?action=query&meta=tokens&type=login&format=json`;
    const tokenResp = await fetchWithRetry(tokenUrl, {
      method: 'GET',
      headers: { Cookie: this.cookieHeader },
    });
    const tokenData = await tokenResp.json() as any;
    const loginToken = tokenData?.query?.tokens?.logintoken;
    if (!loginToken) throw new AuthError('Failed to get login token');

    // Merge server-set cookies (may refine our session)
    this.mergeCookies(tokenResp.headers.getSetCookie?.() || []);

    // Step 2: Login with our cookies (including fake SESSDATA)
    const loginResp = await fetchWithRetry(`${this.config.wiki.api}?action=login&format=json`, {
      body: new URLSearchParams({ lgname: username, lgpassword: password, lgtoken: loginToken }),
      headers: { Cookie: this.cookieHeader },
    });
    const loginResult = await loginResp.json() as any;

    // Update cookies from login response
    this.mergeCookies(loginResp.headers.getSetCookie?.() || []);

    if (loginResult?.login?.result !== 'Success') {
      throw new AuthError(`Login failed: ${loginResult?.login?.reason || loginResult?.login?.result || 'Unknown reason'}`);
    }

    logger.info(`Logged in as ${username}`);
  }

  private async fetchCsrfToken(): Promise<void> {
    const resp = await fetchWithRetry(`${this.config.wiki.api}?action=query&meta=tokens&format=json`, {
      method: 'GET',
      headers: { Cookie: this.cookieHeader },
    });
    const data = await resp.json() as any;
    this.csrfToken = data?.query?.tokens?.csrftoken;
    if (!this.csrfToken) throw new AuthError('Failed to get CSRF token');
  }

  async refreshCsrfToken(): Promise<void> {
    this.csrfToken = null;
    await this.fetchCsrfToken();
  }
}
