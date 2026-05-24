import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { WikiClientManager } from '../wiki/client-manager.js';

export function registerResources(server: Server, wikiClientManager: WikiClientManager): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'wiki://help/overview',
        name: 'Wiki 工具概览',
        description: 'MediaWiki MCP 工具使用说明',
        mimeType: 'text/plain',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'wiki://help/overview') {
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: `# MediaWiki MCP 工具

可用工具列表：
- wiki_read      - 读取页面原始 Wikitext
- wiki_edit      - 创建/更新页面（支持沙箱和干运行）
- wiki_parse     - 解析 Wikitext 为 HTML（服务端渲染）
- wiki_validate  - 完整验证管道（解析 + 浏览器 + 截图）
- wiki_browser_capture - 浏览器页面捕获（控制台/网络/截图）
- wiki_search    - 搜索页面
- wiki_smw_query - 执行 SMW 查询
- wiki_diff      - 显示版本差异
- wiki_history   - 获取修订历史
- wiki_revert    - 回滚到指定版本`,
        }],
      };
    }

    // wiki://{site}/{page}/wikitext (site optional)
    const wikitextMatch = uri.match(/^wiki:\/\/(?:([a-zA-Z][a-zA-Z0-9_-]*)\/)?(.+)\/wikitext$/);
    if (wikitextMatch) {
      const site = wikitextMatch[1] || undefined;
      const page = decodeURIComponent(wikitextMatch[2]);
      const client = wikiClientManager.getClient(site);
      const result = await client.readPage(page);
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: result.exists ? result.content : `页面 "${page}" 不存在`,
        }],
      };
    }

    // wiki://{site}/{page}/meta (site optional)
    const metaMatch = uri.match(/^wiki:\/\/(?:([a-zA-Z][a-zA-Z0-9_-]*)\/)?(.+)\/meta$/);
    if (metaMatch) {
      const site = metaMatch[1] || undefined;
      const page = decodeURIComponent(metaMatch[2]);
      const client = wikiClientManager.getClient(site);
      const result = await client.readPage(page);
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            title: result.title,
            exists: result.exists,
            last_revision: result.last_revision,
            length: result.content.length,
          }, null, 2),
        }],
      };
    }

    throw new Error(`未知资源: ${uri}`);
  });
}
