#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { logger } from '../utils/logger.js';

async function ask(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input, output });
  const hint = defaultVal ? ` (${defaultVal})` : '';
  const answer = await rl.question(`${question}${hint}: `);
  rl.close();
  return answer.trim() || defaultVal || '';
}

async function askPassword(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${question}: `);
  rl.close();
  return answer.trim();
}

async function askYesNo(question: string, defaultVal = true): Promise<boolean> {
  const hint = defaultVal ? '(Y/n)' : '(y/N)';
  const answer = (await ask(`${question} ${hint}`, defaultVal ? 'y' : 'n')).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

export async function runWizard(): Promise<void> {
  logger.info('MediaWiki MCP 设置向导\n');

  const url = await ask('Wiki 站点 URL（例如 https://wiki.example.com）');
  if (!url) {
    logger.error('Wiki URL 不能为空');
    process.exit(1);
  }

  const username = await ask('Bot 用户名', 'Bot');
  const password = await askPassword('Bot 密码');
  if (!password) {
    logger.error('密码不能为空');
    process.exit(1);
  }

  const sandboxFirst = await askYesNo('默认使用沙箱页面？', true);
  const screenshot = await askYesNo('启用截图？', true);

  // Build config
  const config = {
    wiki: { url },
    auth: { type: 'bot', username, password },
    validation: {
      screenshot,
      console_errors: true,
      network_errors: true,
      smw_errors: true,
      wait_after_load: 3000,
      custom_rules: [],
    },
    safety: {
      sandbox_first: sandboxFirst,
      sandbox_page: 'User:${username}/Sandbox',
      auto_backup: true,
      max_edits_per_minute: 10,
    },
    browser: {
      headless: true,
      viewport: { width: 1280, height: 720 },
      locale: 'en',
    },
  };

  const yaml = stringifyYaml(config);

  const configDir = `${process.env['HOME'] || process.env['USERPROFILE'] || '.'}/.config/mediawiki-mcp`;
  const configPath = `${configDir}/config.yaml`;

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, yaml, 'utf-8');

  logger.success(`配置已保存到 ${configPath}\n`);

  console.log(`
下一步：
1. 将以下内容添加到你的 Claude Code 配置中：

   {
     "mcpServers": {
       "mediawiki": {
         "command": "npx",
         "args": ["-y", "mediawiki-mcp"]
       }
     }
   }

   编辑 ~/.claude/settings.json 或项目的 .claude/settings.json

2. 重新启动 Claude Code

3. 尝试调用 wiki_read 工具读取一个页面
`);
}

function stringifyYaml(obj: any, indent = ''): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    const prefix = indent + key + ':';
    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(prefix);
      lines.push(stringifyYaml(value, indent + '  '));
    } else if (Array.isArray(value)) {
      // empty array
      lines.push(prefix + ' []');
    } else if (typeof value === 'boolean') {
      lines.push(prefix + ' ' + (value ? 'true' : 'false'));
    } else if (typeof value === 'number') {
      lines.push(prefix + ' ' + value);
    } else {
      const str = String(value);
      if (str.includes(':') || str.includes('#') || str.includes('{')) {
        lines.push(prefix + ' "' + str + '"');
      } else {
        lines.push(prefix + ' ' + str);
      }
    }
  }
  return lines.join('\n');
}

// Run directly
runWizard().catch((err) => {
  logger.error(`设置失败: ${err.message}`);
  process.exit(1);
});
