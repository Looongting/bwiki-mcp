import type { ToolDependencies } from './register.js';
import { fetchWithRetry } from '../utils/network.js';

interface WikiStatus {
  key: string;
  url: string;
  api: string;
  auth_type: string;
  is_default: boolean;
  status: 'online' | 'offline' | 'error' | 'unknown';
  status_message?: string;
}

export async function listWikis(deps: ToolDependencies, args: { check?: boolean }) {
  const check = args.check !== false; // 默认检查连通性
  const manager = deps.wikiClientManager;
  const defaultSite = manager.defaultSite;
  const siteKeys = manager.allSites;
  const authMode = deps.config.auth_mode;

  const results: WikiStatus[] = [];

  for (const key of siteKeys) {
    const config = manager.getSiteConfig(key);
    const entry: WikiStatus = {
      key,
      url: config.url,
      api: config.api,
      auth_type: authMode,
      is_default: key === defaultSite,
      status: 'unknown',
    };

    if (check) {
      try {
        // 轻量连通性测试：使用 siteinfo API，不需要认证
        const testUrl = `${config.api}?action=query&meta=siteinfo&format=json&formatversion=2`;
        const resp = await fetchWithRetry(testUrl, {
          method: 'GET',
        });
        const data = await resp.json() as any;
        if (data?.query?.general?.sitename) {
          entry.status = 'online';
          entry.status_message = `✅ ${data.query.general.sitename} — MediaWiki ${data.query.general.generator || '?'}`;
        } else {
          entry.status = 'error';
          entry.status_message = '⚠️ API 可达但未返回预期数据';
        }
      } catch (err) {
        entry.status = 'offline';
        const msg = err instanceof Error ? err.message : String(err);
        entry.status_message = `❌ 不可达: ${msg}`;
      }
    }

    results.push(entry);
  }

  // 构建输出
  const lines: string[] = [
    `## 已配置的 Wiki 站点`,
    `共 ${results.length} 个站点`,
    '',
  ];

  if (check) {
    const onlineCount = results.filter(r => r.status === 'online').length;
    const offlineCount = results.filter(r => r.status === 'offline').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    lines.push(`连通性: ${onlineCount} 在线 / ${offlineCount} 离线 / ${errorCount} 异常`);
    lines.push('');
  }

  for (const r of results) {
    const defaultTag = r.is_default ? ' ⭐默认' : '';
    lines.push(`### ${r.key}${defaultTag}`);
    lines.push(`- URL: ${r.url}`);
    lines.push(`- API: ${r.api}`);
    lines.push(`- 认证方式: ${r.auth_type}`);
    if (r.status_message) {
      lines.push(`- 状态: ${r.status_message}`);
    } else {
      lines.push(`- 状态: 未检查`);
    }
    lines.push('');
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}
