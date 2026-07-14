import crypto from 'node:crypto';
import type { AuthConfig } from '../types.js';
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
  private _username: string | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly auth: AuthConfig
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

  /** Resolved username from userinfo (cookie auth) or bot username. */
  get username(): string | null {
    return this._username;
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

  /** Parse a raw cookie header string into `name=value` pairs. */
  private static parseCookieHeader(header: string): string[] {
    return header
      .split(';')
      .map(c => c.trim())
      .filter(c => c.length > 0 && c.includes('='));
  }

  async authenticate(): Promise<void> {
    switch (this.auth.type) {
      case 'bot':
        this.setFakeCookies();
        await this.loginWithBotPassword(this.auth.username, this.auth.password);
        break;
      case 'cookie':
        await this.loginWithCookie(this.auth.cookies);
        break;
      case 'none':
        this._isAuthenticated = true;
        logger.info('Using fake session (read-only mode, no login)');
        return; // skip CSRF token fetch
    }

    await this.fetchCsrfToken();
    this._isAuthenticated = true;
    logger.info('Authenticated with MediaWiki');
  }

  private async loginWithCookie(cookies: string): Promise<void> {
    if (!cookies.trim()) {
      throw new AuthError('Cookie auth requires non-empty cookies');
    }

    this.cookies = AuthManager.parseCookieHeader(cookies);

    // Verify cookies by calling userinfo and extract the real username
    const userInfoUrl = `${this.apiUrl}?action=query&meta=userinfo&uiprop=name&format=json`;
    const userInfoResp = await fetchWithRetry(userInfoUrl, {
      method: 'GET',
      headers: { Cookie: this.cookieHeader },
    });
    const userInfoData = await userInfoResp.json() as any;

    if (userInfoData?.error) {
      throw new AuthError(`Cookie validation failed: ${userInfoData.error.info || userInfoData.error.code}`);
    }

    const userName = userInfoData?.query?.userinfo?.name;
    if (!userName) {
      throw new AuthError('Cookie validation failed: could not retrieve userinfo');
    }

    this._username = userName;
    logger.info(`Cookie auth validated for user ${userName}`);

    // Merge any Set-Cookie headers from the validation response
    this.mergeCookies(userInfoResp.headers.getSetCookie?.() || []);
  }

  private async loginWithBotPassword(username: string, password: string): Promise<void> {
    // Step 1: Get login token with fake SESSDATA + session cookies
    const tokenUrl = `${this.apiUrl}?action=query&meta=tokens&type=login&format=json`;
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
    const loginResp = await fetchWithRetry(`${this.apiUrl}?action=login&format=json`, {
      body: new URLSearchParams({ lgname: username, lgpassword: password, lgtoken: loginToken }),
      headers: { Cookie: this.cookieHeader },
    });
    const loginResult = await loginResp.json() as any;

    // Update cookies from login response
    this.mergeCookies(loginResp.headers.getSetCookie?.() || []);

    if (loginResult?.login?.result !== 'Success') {
      throw new AuthError(`Login failed: ${loginResult?.login?.reason || loginResult?.login?.result || 'Unknown reason'}`);
    }

    this._username = username;
    logger.info(`Logged in as ${username}`);
  }

  private async fetchCsrfToken(): Promise<void> {
    const resp = await fetchWithRetry(`${this.apiUrl}?action=query&meta=tokens&format=json`, {
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

  /** Full re-authentication: reset session and log in again from scratch. */
  async reauthenticate(): Promise<void> {
    this._isAuthenticated = false;
    this.csrfToken = null;
    this.cookies = [];
    this._username = null;
    logger.info('Session expired, performing full re-authentication...');
    await this.authenticate();
  }
}
