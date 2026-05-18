import { describe, it, expect, vi, beforeEach } from 'vitest';

// 在模块级别定义 mock，以便 vi.mock factory 可以访问
const mockAuth = {
  isAuthenticated: false,
  authenticate: vi.fn().mockResolvedValue(undefined),
  cookieHeader: 'test=cookie',
  csrf: 'test-csrf-token',
  refreshCsrfToken: vi.fn().mockResolvedValue(undefined),
};

const mockFetchResponse = (data: any) => ({
  json: () => Promise.resolve(data),
});

vi.mock('../../src/utils/network.js', () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock('../../src/wiki/auth.js', () => ({
  AuthManager: vi.fn().mockImplementation(() => mockAuth),
}));

import { WikiClient } from '../../src/wiki/api-client.js';
import { fetchWithRetry } from '../../src/utils/network.js';

describe('WikiClient', () => {
  const mockConfig: any = {
    wiki: { url: 'https://wiki.example.com', api: 'https://wiki.example.com/api.php' },
    auth: { type: 'bot', username: 'TestBot', password: 'testpass' },
  };

  let client: WikiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthenticated = false;
    client = new WikiClient(mockConfig);
  });

  describe('readPage', () => {
    it('应从 API 响应中解析页面信息', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            pages: [{ title: 'TestPage', revisions: [{ content: 'page content', revid: 123 }] }],
          },
        })
      );

      const result = await client.readPage('TestPage');
      expect(result.title).toBe('TestPage');
      expect(result.content).toBe('page content');
      expect(result.exists).toBe(true);
      expect(result.last_revision).toBe(123);
    });

    it('应返回页面不存在的状态', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            pages: [{ title: 'MissingPage', missing: true }],
          },
        })
      );

      const result = await client.readPage('MissingPage');
      expect(result.exists).toBe(false);
      expect(result.content).toBe('');
    });
  });

  describe('searchPages', () => {
    it('应解析搜索结果', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            search: [
              { title: 'Result1', pageid: 1, snippet: 'snippet1' },
              { title: 'Result2', pageid: 2, snippet: 'snippet2' },
            ],
          },
        })
      );

      const results = await client.searchPages('test');
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Result1');
    });

    it('无结果时应返回空数组', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({ query: { search: [] } })
      );

      const results = await client.searchPages('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('应解析修订历史', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            pages: [{
              revisions: [
                { revid: 3, timestamp: '2024-01-01T00:00:00Z', user: 'User1', comment: 'fix', minor: true },
                { revid: 2, timestamp: '2024-01-02T00:00:00Z', user: 'User2', comment: 'edit', minor: false },
              ],
            }],
          },
        })
      );

      const history = await client.getHistory('TestPage');
      expect(history.length).toBe(2);
      expect(history[0].revision).toBe(3);
      expect(history[0].minor).toBe(true);
    });
  });

  describe('editPage', () => {
    it('编辑成功时应返回结果', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({ edit: { result: 'Success', newrevid: 456 } })
      );

      const result = await client.editPage('TestPage', 'new content', { summary: 'test' });
      expect(result.success).toBe(true);
      expect(result.revision).toBe(456);
    });

    it('badtoken 时应重新认证并重试', async () => {
      mockAuth.isAuthenticated = true;
      let attempts = 0;
      (fetchWithRetry as any).mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return mockFetchResponse({ error: { code: 'badtoken', info: 'Bad token' } });
        }
        return mockFetchResponse({ edit: { result: 'Success', newrevid: 789 } });
      });

      const result = await client.editPage('TestPage', 'content');
      expect(result.success).toBe(true);
      expect(mockAuth.refreshCsrfToken).toHaveBeenCalled();
    });
  });
});
