import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthConfig, SiteConfig } from '../../src/types.js';

// 在模块级别定义 mock，以便 vi.mock factory 可以访问
const mockAuth = {
  isAuthenticated: false,
  authenticate: vi.fn().mockResolvedValue(undefined),
  cookieHeader: 'test=cookie',
  csrf: 'test-csrf-token',
  refreshCsrfToken: vi.fn().mockResolvedValue(undefined),
  username: 'TestBot',
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
  const mockConfig: SiteConfig = {
    url: 'https://wiki.example.com',
    api: 'https://wiki.example.com/api.php',
    bot: { username: 'TestBot', password: 'testpass' },
  };
  const mockAuthConfig: AuthConfig = { type: 'bot', username: 'TestBot', password: 'testpass' };

  let client: WikiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthenticated = false;
    client = new WikiClient(mockConfig, mockAuthConfig);
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

  describe('batchReadPages', () => {
    it('应批量解析多个页面', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            pages: [
              { title: 'Page1', revisions: [{ content: 'content1', revid: 1 }] },
              { title: 'Page2', revisions: [{ content: 'content2', revid: 2 }] },
            ],
          },
        })
      );

      const result = await client.batchReadPages(['Page1', 'Page2']);
      expect(result.pages.length).toBe(2);
      expect(result.pages[0].title).toBe('Page1');
      expect(result.pages[0].content).toBe('content1');
      expect(result.pages[1].title).toBe('Page2');
      expect(result.missing_count).toBe(0);
    });

    it('应正确统计缺失页面', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            pages: [
              { title: 'Page1', revisions: [{ content: 'ok', revid: 1 }] },
              { title: 'Missing', missing: true },
            ],
          },
        })
      );

      const result = await client.batchReadPages(['Page1', 'Missing']);
      expect(result.missing_count).toBe(1);
      expect(result.pages[1].exists).toBe(false);
    });
  });

  describe('getCategoryMembers', () => {
    it('应解析分类成员', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            categorymembers: [
              { title: 'Page1', pageid: 1, ns: 0 },
              { title: 'Template:X', pageid: 10, ns: 10, sortkey: 'X' },
            ],
          },
        })
      );

      const result = await client.getCategoryMembers('SomeCategory');
      expect(result.members.length).toBe(2);
      expect(result.members[0].title).toBe('Page1');
      expect(result.members[1].sortkey).toBe('X');
      expect(result.has_more).toBe(false);
    });

    it('应自动补全 Category: 前缀', async () => {
      mockAuth.isAuthenticated = true;
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({ query: { categorymembers: [] } })
      );
      (fetchWithRetry as any).mockImplementation(fetchMock);

      await client.getCategoryMembers('Cities');

      // 检查 URLSearchParams body 中是否包含 Category: 前缀
      const callArgs = fetchMock.mock.calls[0][1];
      expect(callArgs.body.toString()).toContain('cmtitle=Category%3ACities');
    });

    it('已有 Category: 前缀时不应重复', async () => {
      mockAuth.isAuthenticated = true;
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({ query: { categorymembers: [] } })
      );
      (fetchWithRetry as any).mockImplementation(fetchMock);

      await client.getCategoryMembers('Category:Cities');

      const callArgs = fetchMock.mock.calls[0][1];
      const body = callArgs.body.toString();
      // 应该只出现一次 Category:
      const matches = (body.match(/Category%3A/g) || []).length;
      expect(matches).toBe(1);
    });

    it('有更多成员时应返回分页信息', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            categorymembers: [{ title: 'A', pageid: 1, ns: 0 }],
          },
          continue: { cmcontinue: 'page|abc', continue: '-||' },
        })
      );

      const result = await client.getCategoryMembers('BigCategory');
      expect(result.has_more).toBe(true);
      expect(result.continue_cursor).toBeDefined();
    });
  });

  describe('searchPages', () => {
    it('应解析搜索结果并返回分页信息', async () => {
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

      const result = await client.searchPages('test');
      expect(result.items.length).toBe(2);
      expect(result.items[0].title).toBe('Result1');
      expect(result.has_more).toBe(false);
    });

    it('无结果时应返回空数组', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({ query: { search: [] } })
      );

      const result = await client.searchPages('nonexistent');
      expect(result.items).toEqual([]);
    });

    it('有更多结果时应返回游标', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            search: [{ title: 'Result1', pageid: 1, snippet: 's' }],
          },
          continue: { sroffset: 20, continue: '-||' },
        })
      );

      const result = await client.searchPages('test');
      expect(result.has_more).toBe(true);
      expect(result.continue_cursor).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('应解析修订历史并返回分页信息', async () => {
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

      const result = await client.getHistory('TestPage');
      expect(result.items.length).toBe(2);
      expect(result.items[0].revision).toBe(3);
      expect(result.items[0].minor).toBe(true);
      expect(result.has_more).toBe(false);
    });

    it('有更多修订时应返回游标', async () => {
      mockAuth.isAuthenticated = true;
      (fetchWithRetry as any).mockResolvedValue(
        mockFetchResponse({
          query: {
            pages: [{
              revisions: [{ revid: 1, timestamp: '2024-01-01T00:00:00Z', user: 'U', comment: '', minor: false }],
            }],
          },
          continue: { rvcontinue: '20240101000000|1', continue: '-||' },
        })
      );

      const result = await client.getHistory('TestPage');
      expect(result.has_more).toBe(true);
      expect(result.continue_cursor).toBeDefined();
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
