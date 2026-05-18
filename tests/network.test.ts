import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry } from '../src/utils/network.js';

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('成功时应返回响应', async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await fetchWithRetry('https://example.com/api.php');
    expect(result.status).toBe(200);
  });

  it('失败重试后应最终成功', async () => {
    const mockResponse = { ok: true, status: 200 };
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockResponse as any);

    const result = await fetchWithRetry('https://example.com/api.php');
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重试用尽后应抛出错误', { timeout: 15000 }, async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockRejectedValue(new Error('Persistent error'));

    await expect(fetchWithRetry('https://example.com/api.php')).rejects.toThrow('Persistent error');
    // retries=3 时，fetch 会被调用 4 次（首次 + 3 次重试）
    expect(fetchMock.mock.calls.length).toBe(4);
  });

  it('应设置正确的请求头', async () => {
    const mockResponse = { ok: true, status: 200 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await fetchWithRetry('https://wiki.example.com/api.php', {
      body: new URLSearchParams({ action: 'query' }),
    });

    const callArgs = fetchMock.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options.headers as Record<string, string>;

    expect(headers['User-Agent']).toContain('MediaWiki-MCP');
    expect(headers['Referer']).toBe('https://wiki.example.com/index.php');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('应合并额外的请求头', async () => {
    const mockResponse = { ok: true, status: 200 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await fetchWithRetry('https://example.com/api.php', {
      headers: { 'Cookie': 'test=cookie' },
    });

    const callArgs = fetchMock.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['Cookie']).toBe('test=cookie');
  });
});
