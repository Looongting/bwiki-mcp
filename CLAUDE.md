# mediawiki-mcp

用于 AI 辅助 MediaWiki 编辑的 MCP 服务器，包含自动错误检测和修复闭环。

## 命令
- `npm run dev` — tsx 监视模式开发
- `npm run build` — 编译 TypeScript 到 dist/
- `npm start` — 运行编译后的 JS
- `npm run setup` — 运行交互式配置向导
- `npm run check` — 检查配置连通性
- `npm run test-tool` — 快速测试 MCP 工具
- `npm test` — 运行所有 Vitest 测试
- `npm run test:watch` — 监视模式运行测试
- `npx vitest run tests/validation/detect.test.ts` — 运行特定测试

## 项目结构
- `src/index.ts` — MCP 服务器入口
- `src/config.ts` — 配置加载（环境变量 > 配置文件 > 默认值；支持 .env）
- `src/types.ts` — 共享 TypeScript 类型
- `src/wiki/` — MediaWiki API 客户端（读、写、解析、搜索、SMW）
- `src/browser/` — Playwright 自动化（浏览器管理、控制台/网络捕获）
- `src/validation/` — 错误检测引擎和规则
- `src/tools/` — MCP 工具处理器（每个工具一个文件，在 register.ts 中注册）
- `src/safety/` — 沙箱、备份、差异对比
- `src/setup/` — 交互式设置向导
- `src/resources/` — MCP 资源端点
- `src/utils/` — 错误类、日志、网络工具
- `tests/` — 与 src/ 结构对应的 Vitest 测试

## 架构说明
- 工具使用懒加载（`await import()`）导入处理函数
- 认证流程：虚拟 SESSDATA Cookie → 登录令牌 → Bot 密码认证 → CSRF 令牌
- `validation/detect.ts` 中的噪音模式过滤 BiliWiki 特定控制台日志
- 配置优先级：环境变量 > 配置文件 > 默认值

## 测试
- 使用 `npm test` 运行测试
- 在 `tests/` 目录中添加与 `src/` 模块路径对应的测试
- 依赖网络的测试使用 `vi.mock` 模拟 fetch/AuthManager
