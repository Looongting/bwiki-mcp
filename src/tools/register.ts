import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { AppConfig } from '../types.js';
import type { WikiClientManager } from '../wiki/client-manager.js';
import type { BrowserManager } from '../browser/manager.js';

export interface ToolDependencies {
  wikiClientManager: WikiClientManager;
  browserManager: BrowserManager;
  config: AppConfig;
}

export function registerTools(server: Server, deps: ToolDependencies): void {
  // Tool definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'wiki_read',
        description: '读取 MediaWiki 页面的原始 Wikitext 内容。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面标题' },
            section: { type: 'number', description: '章节编号（可选）' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page'],
        },
      },
      {
        name: 'wiki_edit',
        description: '创建或更新 MediaWiki 页面。支持 dry_run（仅预览差异不保存）和 sandbox（发布到沙箱页面）模式。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面标题' },
            content: { type: 'string', description: '新的 Wikitext 内容' },
            summary: { type: 'string', description: '编辑摘要' },
            minor: { type: 'boolean', description: '标记为小编辑' },
            bot: { type: 'boolean', description: '标记为机器人编辑（默认 true）' },
            dry_run: { type: 'boolean', description: '仅预览差异，不保存' },
            sandbox: { type: 'boolean', description: '发布到沙箱页面而非真实页面' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page', 'content'],
        },
      },
      {
        name: 'wiki_parse',
        description: '将 Wikitext 解析为渲染后的 HTML（服务器端），可检测模板/SMW/解析器错误。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面标题（解析当前版本）' },
            text: { type: 'string', description: '原始 Wikitext 文本（优先级高于 page）' },
            mobile: { type: 'boolean', description: '移动端视图' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
        },
      },
      {
        name: 'wiki_validate',
        description: '完整页面验证：服务端解析 + 浏览器渲染 + 错误检测 + 截图。返回结构化错误报告。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '要验证的页面标题' },
            text: { type: 'string', description: '可选，验证原始文本而非页面内容' },
            screenshot: { type: 'boolean', description: '是否截图（默认 true）' },
            browser: { type: 'boolean', description: '是否使用浏览器检测（默认 true）' },
            rules: { type: 'array', items: { type: 'string' }, description: '要应用的检测规则名称' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
        },
      },
      {
        name: 'wiki_browser_capture',
        description: '使用浏览器打开页面，捕获控制台日志、网络错误和截图。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面完整 URL 或页面标题' },
            wait_ms: { type: 'number', description: '加载后等待时间（毫秒，默认 3000）' },
            screenshot: { type: 'boolean', description: '是否截图（默认 true）' },
            full_page: { type: 'boolean', description: '是否整页截图（默认 true）' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page'],
        },
      },
      {
        name: 'wiki_search',
        description: '搜索 MediaWiki 页面。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            limit: { type: 'number', description: '返回结果数（默认 20，最大 500）' },
            namespace: { type: 'number', description: '命名空间（默认 0）' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['query'],
        },
      },
      {
        name: 'wiki_smw_query',
        description: '执行 Semantic MediaWiki 查询。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SMW 查询字符串，例如 [[Category:Cities]] [[Population::>1000000]]' },
            format: { type: 'string', description: '输出格式（table, list, json, count，默认 table）' },
            limit: { type: 'number', description: '最大结果数（默认 50）' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['query'],
        },
      },
      {
        name: 'wiki_diff',
        description: '显示页面当前版本与指定内容的差异。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面标题' },
            from_revision: { type: 'number', description: '旧修订版本号（默认当前版本）' },
            to_content: { type: 'string', description: '要对比的新内容' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page'],
        },
      },
      {
        name: 'wiki_history',
        description: '获取页面的修订历史。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面标题' },
            limit: { type: 'number', description: '返回条目数（默认 20）' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page'],
        },
      },
      {
        name: 'wiki_revert',
        description: '将页面恢复到指定修订版本。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '页面标题' },
            revision: { type: 'number', description: '要恢复到的修订版本号' },
            summary: { type: 'string', description: '恢复原因' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page', 'revision'],
        },
      },
      {
        name: 'wiki_autofix',
        description: '自动修复循环：将内容发布到沙箱 → 执行完整验证 → 返回结构化错误报告和修复建议。AI 根据结果修正内容后再次调用此工具，形成修复闭环。使用 site 参数指定目标站点。',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: '目标页面标题' },
            content: { type: 'string', description: '要验证和修复的 Wikitext 内容' },
            iteration: { type: 'number', description: '当前迭代次数（从 1 开始，默认 1）' },
            max_iterations: { type: 'number', description: '最大迭代次数（默认 5）' },
            enable_browser: { type: 'boolean', description: '是否启用浏览器检测（默认 true）' },
            site: { type: 'string', description: '目标站点名称，留空使用默认站点' },
          },
          required: ['page', 'content'],
        },
      },
    ],
  }));

  // Tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'wiki_read': {
          const { read } = await import('./read-tool.js');
          return await read(deps, args as any);
        }
        case 'wiki_edit': {
          const { edit } = await import('./edit-tool.js');
          return await edit(deps, args as any);
        }
        case 'wiki_parse': {
          const { parse } = await import('./parse-tool.js');
          return await parse(deps, args as any);
        }
        case 'wiki_validate': {
          const { validate } = await import('./validate-tool.js');
          return await validate(deps, args as any);
        }
        case 'wiki_browser_capture': {
          const { capture } = await import('./browser-tool.js');
          return await capture(deps, args as any);
        }
        case 'wiki_search': {
          const { search } = await import('./search-tool.js');
          return await search(deps, args as any);
        }
        case 'wiki_smw_query': {
          const { smwQuery } = await import('./smw-tool.js');
          return await smwQuery(deps, args as any);
        }
        case 'wiki_diff': {
          const { diff } = await import('./diff-tool.js');
          return await diff(deps, args as any);
        }
        case 'wiki_history': {
          const { history } = await import('./history-tool.js');
          return await history(deps, args as any);
        }
        case 'wiki_revert': {
          const { revert } = await import('./revert-tool.js');
          return await revert(deps, args as any);
        }
        case 'wiki_autofix': {
          const { autofix } = await import('./autofix-tool.js');
          return await autofix(deps, args as any);
        }
        default:
          throw new Error(`未知工具: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `错误: ${message}` }],
        isError: true,
      };
    }
  });
}
