# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

`bwiki-mcp` 是一个 MCP（Model Context Protocol）服务器，通过 stdio 与 MCP 客户端通信，为 AI 提供 MediaWiki 的读取、编辑、解析、验证、浏览器捕获、SMW 查询、文件上传和管理类工具。npm 包名为 `bwiki-mcp`，提供 `bwiki-mcp` 和 `mw-mcp` 两个二进制入口。

## 常用命令

- `npm install` — 安装依赖
- `npm run dev` — 以 tsx watch 模式运行 `src/index.ts`
- `npm run build` — 将 `src/` 编译到 `dist/`
- `npm start` — 运行编译后的 `dist/index.js`
- `npm run setup` — 交互式配置向导
- `npm run check` — 检查配置文件中的站点连通性
- `npm run test-tool` — 快速测试单个 MCP 工具
- `npm test` — 一次性运行所有 Vitest 测试
- `npm run test:watch` — Vitest 监视模式
- `npx vitest run tests/<path>.test.ts` — 运行单个测试文件
- `npx playwright install chromium` — 安装验证/捕获工具所需的浏览器

## 构建与运行约束

- 项目为 ESM TypeScript，`tsconfig.json` 使用 `module: NodeNext` 和 `moduleResolution: NodeNext`。
- 源码根目录为 `src/`，编译输出目录为 `dist/`。
- `src/` 内部的所有 import 必须使用 `.js` 扩展名（NodeNext 要求）。
- 启动时从当前工作目录读取 `mediawiki-mcp.config.yaml`（或 `.yml` / `.json`），配置仅来源于此文件 + 代码内硬编码默认值，**不读取环境变量或 `.env`**。
- CI 在 Node 18/20/22 上运行类型检查、测试和构建；另有一个独立的 Playwright 浏览器测试 job；版本 tag 触发 npm 发布。

## 架构说明

### 服务生命周期（`src/index.ts`）

1. `loadConfig()` 加载并校验 `mediawiki-mcp.config.yaml`。
2. `WikiClientManager` 持有各站点的 `WikiClient` 实例。
3. `BrowserManager` 按需启动 Playwright 浏览器上下文。
4. `registerTools()` 与 `registerResources()` 注册 MCP 工具与资源处理器。
5. 通过 `StdioServerTransport` 连接 MCP 客户端。

### 多站点管理（`src/wiki/client-manager.ts`）

- 每个配置站点懒创建一个 `WikiClient`。
- `getClient(site?)` 在 `site` 为空时使用 `config.default_site`。
- 站点 key 必须匹配 `/^[a-zA-Z][a-zA-Z0-9_-]*$/`。

### 认证流程（`src/wiki/auth.ts`）

- 类型上支持 `bot`、`oauth`、`cookie`、`none`，但目前仅实现 `bot` 和 `none`。
- Bot 认证流程：生成虚拟 `SESSDATA` 和 session Cookie → 获取登录 token → 使用 Bot 密码调用 `action=login` → 获取 CSRF token。
- 虚拟 Cookie 是为 BiliWiki/biligame 等 Wiki 农场准备的：这些站点要求 API 请求必须携带 `SESSDATA`，但只检查存在性，不校验值。
- `WikiClient` 在请求遇到认证错误时会尝试一次完整的重新登录。

### 工具层（`src/tools/`）

- 所有工具的 schema 在 `src/tools/register.ts` 中静态声明。
- handler 通过 `await import('./<tool>-tool.js')` 懒加载；新增工具时请保持此模式。
- 每个工具都支持可选的 `site` 参数以切换目标站点。
- `wiki_edit` 支持两种编辑模式：全页替换（`content`）和查找替换（`old_string` + `new_string`），并支持 `dry_run` 和 `sandbox` 安全模式。
- `wiki_validate` 组合服务端解析、浏览器渲染、错误检测和可选截图。
- `wiki_autofix` 将内容发布到沙箱页面后执行完整验证，供 AI 迭代修复。

### 验证层（`src/validation/`）

- `detect.ts` 对渲染后的 HTML 进行正则匹配，覆盖内置 CSS 选择器规则、SMW 文本模式以及用户自定义规则。
- `rules.ts` 定义 `BUILT_IN_RULES`，并将配置文件中的 `custom_rules` 合并进来。
- 控制台日志先经过内置的 `NOISE_PATTERNS` 过滤（主要覆盖 BiliWiki/BWiki 平台噪音），再经过用户配置的 `validation.console_ignore` 正则过滤。
- 网络请求中的 301 重定向被视为正常行为并忽略。

### 安全层（`src/safety/`）

- `sandbox.ts` 将目标页面映射到 `User:${username}/Sandbox`（或配置中的 `sandbox_page` 模板）。
- `backup.ts` 在编辑前将页面内容备份到本地。
- `diff.ts` 生成 wikitext 差异，用于 `dry_run` 预览。

### 错误处理（`src/utils/errors.ts`）

- 基类为 `MediaWikiError`，子类包括 `AuthError`、`ApiError`、`ConfigError`、`BrowserError` 和 `ParameterCorruptedError`。
- `ParameterCorruptedError` 用于检测参数值被模板引擎污染为 `"undefined"` 的情况，这是 MCP 传输层对 `{{...}}` 进行模板插值时可能出现的。

### 工具函数

- `src/utils/network.ts` 提供 `fetchWithRetry`，带指数退避、默认 `User-Agent` 和 `Referer`，用于避免 WAF 拦截。
- `src/utils/logger.ts` 使用 `consola` 输出日志。

## 配置说明

完整示例见 `config.example.yaml`。关键节点：

- `default_site` — 未指定 `site` 时的默认站点。
- `sites.<key>.url` — Wiki 基础地址；`api` 默认为 `<url>/api.php`。
- `sites.<key>.auth` — Bot 用户名/密码，或 `type: none` 只读模式。
- `validation` — 截图、控制台/网络/SMW 错误开关、加载后等待时间、控制台噪音过滤、自定义规则。
- `safety` — `sandbox_first`、`sandbox_page`、`auto_backup`、`max_edits_per_minute`。
- `browser` — 无头模式、视口、语言。

## 测试说明

- 使用 Vitest，测试文件位于 `tests/`，尽量与 `src/` 结构对应。
- `tests/helpers.ts` 提供 `makeDefaultConfig()`、`makeMockWikiClient()` 和 `mockDeps()`。
- 网络相关测试通过 `vi.mock`/`vi.fn` 模拟 `fetch`、`AuthManager` 或 `WikiClient`，不访问真实 Wiki。
- 浏览器相关测试依赖 Playwright Chromium，在 CI 的独立 `browser` job 中运行。

## 新增工具的步骤

1. 如需新类型，在 `src/types.ts` 中定义输入/输出类型。
2. 创建 `src/tools/<name>-tool.ts`，导出异步 handler。
3. 在 `src/tools/register.ts` 中添加工具 schema 和 switch 分支。
4. 编写 `tests/tools/<name>-tool.test.ts`，使用 `tests/helpers.ts` 中的 `mockDeps()`。
5. 如工具面向用户，更新 `README.md`。
