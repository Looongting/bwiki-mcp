import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { WikiClient } from '../wiki/api-client.js';

export function registerResources(server: Server, wikiClient: WikiClient): void {
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

    // wiki://{page}/wikitext
    const wikitextMatch = uri.match(/^wiki:\/\/(.+)\/wikitext$/);
    if (wikitextMatch) {
      const page = decodeURIComponent(wikitextMatch[1]);
      const result = await wikiClient.readPage(page);
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: result.exists ? result.content : `页面 "${page}" 不存在`,
        }],
      };
    }

    // wiki://{page}/meta
    const metaMatch = uri.match(/^wiki:\/\/(.+)\/meta$/);
    if (metaMatch) {
      const page = decodeURIComponent(metaMatch[1]);
      const result = await wikiClient.readPage(page);
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
