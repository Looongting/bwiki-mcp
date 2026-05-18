#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { WikiClient } from './wiki/api-client.js';
import { BrowserManager } from './browser/manager.js';
import { registerTools } from './tools/register.js';
import { registerResources } from './resources/register.js';
import { logger } from './utils/logger.js';

async function main() {
  const config = await loadConfig();

  const wikiClient = new WikiClient(config);
  const browserManager = new BrowserManager(config.browser);

  const server = new Server(
    {
      name: 'mediawiki-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  registerTools(server, { wikiClient, browserManager, config });
  registerResources(server, wikiClient);

  // Error handling
  server.onerror = (err) => {
    logger.error(`MCP Server error: ${err.message}`);
  };

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await browserManager.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await browserManager.cleanup();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MediaWiki MCP server ready');
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
