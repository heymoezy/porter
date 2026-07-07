#!/usr/bin/env node
/**
 * Porter MCP — bin entry.
 *
 * Runnable directly (`node dist/mcp/server.js` after `npm run build`, or
 * `npx tsx src/mcp/server.ts` for dev/quick verification). Claude Code
 * launches this as a subprocess over the stdio transport — see the
 * mcpServers registration note in this directory's README section of the
 * ship report for the exact ~/.claude.json entry.
 *
 * Talks directly to Postgres via the same DATABASE_URL contract as the
 * Fastify backend (db/client.ts) — no HTTP, no service token, no running
 * porter-fastify process required. Logging goes to stderr only: stdout is
 * reserved for the MCP JSON-RPC stream.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPorterMcpServer } from './porter-mcp.js';
import { pool } from '../db/client.js';

async function main() {
  const server = createPorterMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[porter-mcp] connected over stdio');

  const shutdown = async (signal: string) => {
    console.error(`[porter-mcp] ${signal} — closing`);
    try {
      await server.close();
    } finally {
      await pool.end().catch(() => {});
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[porter-mcp] fatal', e);
  process.exit(1);
});
