import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/network.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { AuthManager } from '../../src/wiki/auth.js';
import { fetchWithRetry } from '../../src/utils/network.js';
import type { AuthConfig } from '../../src/types.js';

const API_URL = 'https://wiki.example.com/api.php';

describe('AuthManager - cookie auth', () => {
  beforeEach(() => {
    vi.mocked(fetchWithRetry).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应使用 cookies 完成认证并缓存用户名', async () => {
    vi.mocked(fetchWithRetry)
      .mockResolvedValueOnce(makeJsonResponse({
        query: { userinfo: { name: 'CookieUser' } },
      }))
      .mockResolvedValueOnce(makeJsonResponse({
        query: { tokens: { csrftoken: 'abc+\\' } },
      }));

    const auth: AuthConfig = { type: 'cookie', cookies: 'SESSDATA=real' };
    const manager = new AuthManager(API_URL, auth);

    await manager.authenticate();

    expect(manager.isAuthenticated).toBe(true);
    expect(manager.username).toBe('CookieUser');
    expect(manager.csrf).toBe('abc+\\');
    expect(manager.cookieHeader).toContain('SESSDATA=real');
  });

  it('userinfo 返回错误时应抛出 AuthError', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValueOnce(makeJsonResponse({
      error: { code: 'badtoken', info: 'Invalid session' },
    }));

    const auth: AuthConfig = { type: 'cookie', cookies: 'SESSDATA=bad' };
    const manager = new AuthManager(API_URL, auth);

    await expect(manager.authenticate()).rejects.toThrow(/Cookie validation failed/);
  });

  it('缺少 cookies 时应抛出 AuthError', async () => {
    const auth: AuthConfig = { type: 'cookie', cookies: '' };
    const manager = new AuthManager(API_URL, auth);

    await expect(manager.authenticate()).rejects.toThrow(/Cookie auth requires non-empty cookies/);
  });

  it('reauthenticate 应清空状态并重新认证', async () => {
    vi.mocked(fetchWithRetry)
      .mockResolvedValueOnce(makeJsonResponse({ query: { userinfo: { name: 'U1' } } }))
      .mockResolvedValueOnce(makeJsonResponse({ query: { tokens: { csrftoken: 'c1' } } }))
      .mockResolvedValueOnce(makeJsonResponse({ query: { userinfo: { name: 'U2' } } }))
      .mockResolvedValueOnce(makeJsonResponse({ query: { tokens: { csrftoken: 'c2' } } }));

    const auth: AuthConfig = { type: 'cookie', cookies: 'SESSDATA=first' };
    const manager = new AuthManager(API_URL, auth);

    await manager.authenticate();
    expect(manager.username).toBe('U1');

    await manager.reauthenticate();
    expect(manager.username).toBe('U2');
    expect(fetchWithRetry).toHaveBeenCalledTimes(4);
  });
});

describe('AuthManager - bot auth', () => {
  beforeEach(() => {
    vi.mocked(fetchWithRetry).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('bot 认证仍应设置伪造的 SESSDATA 和 session cookies', async () => {
    vi.mocked(fetchWithRetry)
      .mockResolvedValueOnce(makeJsonResponse({ query: { tokens: { logintoken: 'login-token' } } }))
      .mockResolvedValueOnce(makeJsonResponse({ login: { result: 'Success' } }))
      .mockResolvedValueOnce(makeJsonResponse({ query: { tokens: { csrftoken: 'csrf-token' } } }));

    const auth: AuthConfig = { type: 'bot', username: 'TestBot', password: 'secret' };
    const manager = new AuthManager(API_URL, auth);

    await manager.authenticate();

    expect(manager.isAuthenticated).toBe(true);
    expect(manager.username).toBe('TestBot');
    expect(manager.cookieHeader).toContain('SESSDATA=');
    expect(manager.cookieHeader).toContain('gamecenter_wiki__session=');
  });
});

function makeJsonResponse(body: any): Response {
  return {
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}
