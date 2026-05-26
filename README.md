# BWIKI-MCP

[![GitHub](https://img.shields.io/badge/GitHub-Looongting/mediawiki--mcp-blue?logo=github)](https://github.com/Looongting/mediawiki-mcp)
[![npm](https://img.shields.io/npm/v/bwiki-mcp?logo=npm)](https://www.npmjs.com/package/bwiki-mcp)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

将 AI 辅助编程（Claude Code）与 MediaWiki 编辑连接起来的 MCP 服务器，实现页面自动读写、服务端渲染验证、浏览器级错误检测和 AI 自动修复闭环。（原名 MediaWiki-MCP）

## 功能特性

- **读写 Wiki 页面** — AI 通过 `wiki_read` / `wiki_edit` 直接读写 MediaWiki 页面
- **服务端解析** — 渲染 Wikitext 并检测模板、SMW、解析器错误
- **浏览器验证** — 基于 Playwright 的控制台错误、网络请求失败、截图捕获
- **SMW 查询** — 执行语义 MediaWiki 查询（`#ask` 解析器函数或 API）
- **安全机制** — 沙箱模式、干运行差异预览、自动备份、修订历史
- **AI 反馈闭环** — AI 自动编排：编辑 → 验证 → 修复 → 重新验证直至通过

## 快速开始

### 前置条件

- Node.js 18+
- 一个具有 API 访问权限的 MediaWiki 站点（写操作需要 `action=edit` 权限）
- Playwright 浏览器（用于浏览器验证）：`npx playwright install chromium`

### 安装

#### 从 GitHub 安装（推荐）

```bash
git clone https://github.com/Looongting/mediawiki-mcp.git
cd mediawiki-mcp
npm install
npm run build
```

#### 从 npm 安装

```bash
npm install -g bwiki-mcp
```

### 配置方式

**方式 A：配置文件（推荐）**

将 `config.example.yaml` 复制为项目根目录下的 `mediawiki-mcp.config.yaml`：

```yaml
default_site: mywiki

sites:
  mywiki:
    url: https://wiki.example.com
    auth:
      type: bot
      username: YourBot@YourBot
      password: your-bot-password

  another:
    url: https://another.wiki.com
    auth:
      type: bot
      username: AnotherBot@AnotherBot
      password: another-bot-password

safety:
  sandbox_first: true
  auto_backup: true
```

**方式 B：设置向导**

```bash
npm run setup
```

### 添加到 MCP 客户端

全局安装后，在 MCP 客户端配置中直接使用 `bwiki-mcp` 命令：

```json
{
  "mcpServers": {
    "mediawiki": {
      "command": "bwiki-mcp",
      "args": []
    }
  }
}
```

如果从 GitHub 克隆运行，则指向项目目录：

```json
{
  "mcpServers": {
    "mediawiki": {
      "command": "node",
      "args": ["path/to/mediawiki-mcp/dist/index.js"]
    }
  }
}
```

服务器启动时会自动读取项目根目录下的 `mediawiki-mcp.config.yaml`。详见 [config.example.yaml](config.example.yaml)。

## 可用工具

| 工具 | 描述 | 关键参数 |
|------|------|---------|
| `wiki_read` | 读取页面的原始 Wikitext | `page`, `section` |
| `wiki_edit` | 创建或更新页面 | `page`, `content`, `summary`, `dry_run`, `sandbox` |
| `wiki_parse` | 将 Wikitext 解析为渲染后的 HTML | `page`, `text`, `mobile` |
| `wiki_validate` | 完整验证：解析 + 浏览器 + 截图 | `page`, `text`, `screenshot`, `browser`, `rules` |
| `wiki_browser_capture` | 浏览器捕获：控制台、网络、截图 | `page`, `wait_ms`, `screenshot`, `full_page` |
| `wiki_search` | 搜索页面 | `query`, `limit`, `namespace` |
| `wiki_smw_query` | 执行 SMW 查询 | `query`, `format`, `limit` |
| `wiki_diff` | 显示版本差异 | `page`, `from_revision`, `to_content` |
| `wiki_history` | 获取修订历史 | `page`, `limit` |
| `wiki_revert` | 回滚到指定版本 | `page`, `revision`, `summary` |

## 使用示例

### 基本读写

```
读取页面 → wiki_read(page: "Main Page")
编辑页面 → wiki_edit(page: "Sandbox/Test", content: "== Hello ==\n新内容")
仅预览  → wiki_edit(page: "Sandbox/Test", content: "...", dry_run: true)
沙箱模式 → wiki_edit(page: "ProductionPage", content: "...", sandbox: true)
```

### 验证流程

```
1. 解析 → wiki_parse(page: "MyPage")
   → 检测 SMW 错误、模板错误、解析器错误

2. 浏览器验证 → wiki_validate(page: "MyPage", browser: true)
   → 解析错误 + 控制台错误 + 网络错误 + 截图

3. 仅浏览器捕获 → wiki_browser_capture(page: "https://...")
   → 完整控制台日志、网络请求、页面截图
```

### SMW 查询

```
查询城市 → wiki_smw_query(query: "[[Category:Cities]] [[Population::>1000000]]")
```

### 版本管理

```
查看历史 → wiki_history(page: "MyPage", limit: 10)
显示差异 → wiki_diff(page: "MyPage", to_content: "新的 wikitext")
回滚    → wiki_revert(page: "MyPage", revision: 12345)
```

## 项目结构

```
src/
├── index.ts              — MCP 服务器入口
├── config.ts             — 配置加载（环境变量 > 配置文件 > 默认值）
├── types.ts              — 共享 TypeScript 类型定义
├── wiki/
│   ├── api-client.ts     — MediaWiki API 客户端（读、写、解析、搜索）
│   ├── auth.ts           — Bot 密码认证与 Cookie 管理
│   └── smw.ts            — 语义 MediaWiki 查询执行
├── browser/
│   └── manager.ts        — Playwright 浏览器自动化
├── validation/
│   ├── detect.ts         — 错误检测引擎（HTML + 浏览器 + 摘要）
│   ├── rules.ts          — 内置和自定义检测规则
│   └── reporter.ts       — 验证报告格式化（JSON/Markdown）
├── tools/                — MCP 工具处理器（每个工具一个文件）
│   ├── register.ts       — 工具注册与路由
│   ├── read-tool.ts      — wiki_read
│   ├── edit-tool.ts      — wiki_edit
│   ├── parse-tool.ts     — wiki_parse
│   ├── validate-tool.ts  — wiki_validate
│   ├── browser-tool.ts   — wiki_browser_capture
│   ├── search-tool.ts    — wiki_search
│   ├── smw-tool.ts       — wiki_smw_query
│   ├── diff-tool.ts      — wiki_diff
│   ├── history-tool.ts   — wiki_history
│   └── revert-tool.ts    — wiki_revert
├── safety/
│   ├── sandbox.ts        — 沙箱页面管理器
│   ├── backup.ts         — 编辑前自动备份
│   └── diff.ts           — 差异对比生成
├── resources/
│   └── register.ts       — MCP 资源端点
├── setup/
│   └── wizard.ts         — 交互式设置向导
└── utils/
    ├── errors.ts         — 错误类
    ├── logger.ts         — 日志（consola）
    └── network.ts        — HTTP 请求带重试
```

## 检测规则

### 内置规则

| 规则 | CSS 选择器 | 严重级别 |
|------|-----------|---------|
| SMW 解析错误 | `.smw-parse-error` | error |
| SMW 查询错误 | `.smw-error` | error |
| SMW 无结果 | `.smw-results:empty, .smw-table:empty` | warning |
| 模板错误 | `strong.error, span.error, .error` | error |
| MW 解析错误 | `.mw-parse-error` | error |
| 页面不存在（红链） | `a.new` | warning |

此外还包括文本模式检测：
- 中文 SMW 错误信息
- 未渲染的 Wikitext（`{{...}}` 模式）
- 语义 MediaWiki 查询语法错误

### 控制台噪音过滤

不同 Wiki 站点有大量自带插件、统计脚本和小工具，它们的控制台输出是**正常噪音**，并非页面渲染错误。
若不过滤，这些噪音会淹没真正的错误信息，影响 AI 判断。

**内置已过滤的模式**（30+ 条正则）涵盖常见平台噪音：
```
BLoader / BwikiTune              平台基础库加载日志
bili-mirror / bili-fe-mirror     B站镜像
getData(dbUserName)              用户配置未初始化
GAME_PB_INS / game-report        游戏数据上报
Report PV / 页面浏览量            PV 统计
jquery 事件触发 / DOMContentLoaded  页面生命周期
Widget:*版载入                   小工具加载
VSCode Button extension          编辑按钮扩展
...
```
完整列表见 `src/validation/detect.ts` 中的 `NOISE_PATTERNS` 数组。

**你也可以添加 Wiki 专属过滤规则**，在配置文件中写入正则表达式：

```yaml
validation:
  console_ignore:
    - "^MyExtension.*log$"       # 匹配以 "MyExtension" 开头的日志
    - "SomeNoise"                 # 匹配包含 "SomeNoise" 的条目
    - "特定插件名"                 # 你的站点特有的日志
```

> **提示：** 如果你发现某个控制台日志总是出现且与页面错误无关，把它加到 `console_ignore` 列表中，AI 在验证时就会自动忽略它，让报告更干净。

## 配置参考

完整配置项见 [config.example.yaml](config.example.yaml)：

```yaml
default_site: mywiki                      # 默认目标站点

sites:                                    # 多站点配置
  mywiki:
    url: https://wiki.example.com         # 站点地址
    api: https://wiki.example.com/api.php # API 地址（可选，自动推导）
    auth:
      type: bot                           # 目前仅实现 "bot" 模式
      username: YourBot@YourBot           # Bot 用户名
      password: your-bot-password          # Bot 密码

validation:
  screenshot: true                        # 验证时是否截图
  console_errors: true                    # 捕获浏览器控制台错误
  network_errors: true                    # 捕获失败的网络请求
  smw_errors: true                        # 检测渲染 HTML 中的 SMW 错误
  wait_after_load: 3000                   # 页面加载后等待时间（毫秒）
  console_ignore: []                      # 从控制台日志中过滤的正则模式
  custom_rules: []                        # 自定义检测规则

safety:
  sandbox_first: false                    # 编辑是否默认使用沙箱
  sandbox_page: "User:${username}/Sandbox" # 沙箱页面模板
  auto_backup: true                       # 编辑前自动备份
  max_edits_per_minute: 10                # 编辑频率限制

browser:
  headless: true                          # 无头模式
  viewport:
    width: 1280
    height: 720
  locale: en
```

## 开发

```bash
# 安装依赖
npm install

# 监视模式开发
npm run dev

# 编译 TypeScript
npm run build

# 运行测试
npm test                    # 单次运行
npm run test:watch          # 监视模式

# 安装 Playwright 浏览器
npx playwright install chromium

# 运行设置向导
npm run setup
```

### 测试

测试文件位于 `tests/` 目录，与 `src/` 结构对应。使用 Vitest。

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npx vitest run tests/validation/detect.test.ts

# 带覆盖率运行
npx vitest run --coverage
```

### 添加新工具

1. 在 `src/tools/my-tool.ts` 中创建导出的处理函数
2. 在 `src/tools/register.ts` 中添加工具定义和处理路由
3. 在 `src/types.ts` 中添加输入类型
4. 在 `tests/tools/my-tool.test.ts` 中编写测试

## 认证流程

服务器使用 MediaWiki 的 `action=login` API 配合 Bot 密码进行认证。认证流程：

1. 在每次请求前设置会话 Cookie（SESSDATA） — 某些 Wiki 农场（如 BiliWiki）要求
2. 通过 `action=query&meta=tokens&type=login` 获取登录令牌
3. 通过 `action=login` 提交凭据
4. 获取 CSRF 令牌用于编辑操作
5. CSRF 令牌过期时（badtoken 错误）自动重新认证

### Cookie 处理

某些 Wiki 农场要求每次 API 请求都携带 `SESSDATA` Cookie（甚至在登录前）。客户端为此生成一个虚拟的 SESSDATA UUID。真实的认证 Cookie 从服务端的 `Set-Cookie` 响应中合并。

## 错误处理

错误按类别进行分类处理：

- `ConfigError` — 配置缺失或无效
- `AuthError` — 认证失败
- `ApiError` — MediaWiki API 错误
- `BrowserError` — Playwright 浏览器故障

## 分享给他人

本项目托管在 GitHub：[Looongting/mediawiki-mcp](https://github.com/Looongting/mediawiki-mcp)，npm 包名为 [bwiki-mcp](https://www.npmjs.com/package/bwiki-mcp)。

其他人使用只需三步：

```bash
npm install -g bwiki-mcp
```

或从 GitHub 克隆：

```bash
git clone https://github.com/Looongting/mediawiki-mcp.git
cd mediawiki-mcp
npm install && npm run build
```

然后在 MCP 客户端中按上方的配置方式填入自己的 Wiki 地址和 Bot 凭据即可。

> 每个使用者需要自己在 Wiki 上申请独立的 Bot 账号，请勿共用凭据。

## 许可证

MIT
