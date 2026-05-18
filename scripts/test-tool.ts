#!/usr/bin/env tsx
/**
 * MCP 工具快速测试脚本
 * 通过 stdin/stdout 向 MCP 服务器发送 JSON-RPC 调用。
 *
 * 用法: npx tsx scripts/test-tool.ts <工具名> [JSON参数]
 *
 * 示例:
 *   npx tsx scripts/test-tool.ts wiki_search '{"query":"Main Page"}'
 *   npx tsx scripts/test-tool.ts wiki_read '{"page":"Main Page"}'
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const toolName = process.argv[2];
const rawArgs = process.argv[3] || '{}';

if (!toolName) {
  console.error('用法: tsx scripts/test-tool.ts <工具名> [JSON参数]');
  console.error('示例: tsx scripts/test-tool.ts wiki_search \'{"query":"Test"}\'');
  process.exit(1);
}

let args: Record<string, unknown>;
try {
  args = JSON.parse(rawArgs);
} catch {
  console.error('错误：参数必须是有效的 JSON');
  process.exit(1);
}

const serverPath = resolve(import.meta.dirname, '..', 'dist', 'index.js');

const child = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env },
});

let output = '';
let buffer = '';

child.stdout.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  // 尝试解析完整的 JSON-RPC 消息
  let boundary: number;
  while ((boundary = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, boundary).trim();
    buffer = buffer.slice(boundary + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1) {
        output = JSON.stringify(msg, null, 2);
      }
    } catch { /* 不完整消息 */ }
  }
});

child.on('close', () => {
  if (output) {
    console.log(output);
  } else {
    console.log('未收到响应（服务器可能缺少 MW_URL 环境变量）');
  }
});

// 发送初始化
child.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'test-tool', version: '0.1.0' },
  },
}) + '\n');

// 发送初始化完成通知
child.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  method: 'notifications/initialized',
}) + '\n');

// 发送工具调用
setTimeout(() => {
  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  }) + '\n');
}, 500);

// 超时后关闭
setTimeout(() => {
  child.kill();
}, 10000);
