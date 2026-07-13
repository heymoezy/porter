#!/usr/bin/env node
/**
 * Porter MCP — stdio entrypoint (#37).
 *
 * porter-mcp.ts only EXPORTS a factory; nothing ever connected it to a
 * transport, which is why the server existed but no CLI could actually run it.
 * This is the launchable process a Bridge CLI (claude / codex / grok /
 * antigravity) spawns over stdio.
 *
 * Register with, e.g.:
 *   claude mcp add-json porter '{"type":"stdio","command":"npx","args":["tsx",
 *     "/home/lobster/projects/Porter/backend/src/mcp/porter-mcp-stdio.ts"]}' --scope user
 *
 * FAIL-OPEN: if Porter's DB is unreachable the tools return cold/empty rather
 * than throwing — a CLI must never be blocked from starting because the
 * knowledge backbone happens to be down.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPorterMcpServer } from './porter-mcp.js';

async function main(): Promise<void> {
  const server = createPorterMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel — never log to it. Diagnostics go to stderr.
  process.stderr.write('[porter-mcp] connected over stdio\n');
}

main().catch((e) => {
  process.stderr.write(`[porter-mcp] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
