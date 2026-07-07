/**
 * Porter MCP — the headless knowledge server.
 *
 * Endgame: "Porter installs inside Claude as an MCP server, injecting vault
 * knowledge, reducing token burn, controlling files/agents/tools." This is
 * that server, alpha cut. Claude Code (or any MCP stdio client) launches
 * server.ts as a subprocess; this file wires the McpServer instance + tools.
 *
 * Every tool is a thin, read-only wrapper over the SAME data the HTTP vault
 * routes serve (routes/v1/vault.ts) — reached via a DIRECT in-process pg
 * pool connection (db/client.ts), not an HTTP round-trip. That's the
 * "prefer in-process services" path: this process already has full access
 * to Postgres (same DATABASE_URL contract as the Fastify backend), so a
 * localhost HTTP hop + service-token header would only add latency and a
 * second thing to configure for zero benefit. Nothing here WRITES to the
 * vault — this is a read-only knowledge surface for now.
 *
 * Scope-generic by design: 'ymc' is only the CLI's default argument value,
 * never hardcoded into a query. A fresh Porter install with an empty vault
 * answers every tool honestly (empty results, not fake data).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pool } from '../db/client.js';
import { searchVaultNodes } from './vault-lookup.js';
import { buildContextPack } from './context-pack.js';
import { selectProduct, listFilesForScope, listServicesForScope, listPorterTools } from './registry.js';

const DEFAULT_SCOPE = 'ymc';

function textResult(payload: unknown) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function createPorterMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'porter', version: '0.1.0' },
    {
      instructions:
        'Porter is the knowledge backbone for this workspace. Prefer these tools over re-reading ' +
        'the repo or re-deriving facts: porter_search_vault to find nodes, porter_get_context_pack ' +
        'to get a tight capped brief on a topic (the main token-reduction tool), porter_select_product ' +
        'to pin the active scope for the session, and porter_list_files/_services/_tools to see what a ' +
        'scope has registered. Default scope is "ymc" unless the session has selected another.',
    }
  );

  // Session-local active scope (this process = one Claude session over stdio).
  let activeScope = DEFAULT_SCOPE;

  server.registerTool(
    'porter_select_product',
    {
      title: 'Select active product/scope',
      description:
        "Set the active product/scope for this session (default 'ymc'). Subsequent calls to the " +
        'other porter_* tools default to this scope when their own scope argument is omitted. ' +
        'Returns whether the scope has a registered vault schema, and its ancestor chain if the ' +
        'products registry exists yet (it is being built separately; degrades to scope-only until then).',
      inputSchema: {
        scope: z.string().trim().min(1).default(DEFAULT_SCOPE).describe('The app_scope / product identifier to activate, e.g. "ymc".'),
      },
    },
    async ({ scope }) => {
      activeScope = scope;
      const result = await selectProduct(scope);
      return textResult(result);
    }
  );

  server.registerTool(
    'porter_search_vault',
    {
      title: 'Search the vault',
      description:
        'Search Porter\'s vault knowledge graph for a query. Returns the most relevant nodes ' +
        '(id/title/type/layer) matched by title or artifact content, within a scope. Use this to ' +
        'find WHAT exists before pulling a full context pack.',
      inputSchema: {
        query: z.string().trim().min(1).describe('Free-text search query.'),
        scope: z.string().trim().min(1).optional().describe('Scope to search (defaults to the active/selected scope, else "ymc").'),
        layer: z.enum(['data', 'learning']).optional().describe('Restrict to one vault layer.'),
      },
    },
    async ({ query, scope, layer }) => {
      const resolvedScope = scope || activeScope;
      const hits = await searchVaultNodes(resolvedScope, query, { layer });
      return textResult({ scope: resolvedScope, query, count: hits.length, nodes: hits });
    }
  );

  server.registerTool(
    'porter_get_context_pack',
    {
      title: 'Get a capped context pack for a topic',
      description:
        'THE token-reduction tool. Returns a tight, capped Markdown brief (~2k tokens max) built ' +
        'from the relevant vault nodes for a topic — their key content and sources — so Claude can ' +
        'read this instead of grepping the repo or a data room. Always try this before falling back ' +
        'to file search when the answer might already be in the vault.',
      inputSchema: {
        topic: z.string().trim().min(1).describe('The topic/question to build a context pack for, e.g. "Edward Chen workout".'),
        scope: z.string().trim().min(1).optional().describe('Scope to pull from (defaults to the active/selected scope, else "ymc").'),
      },
    },
    async ({ topic, scope }) => {
      const resolvedScope = scope || activeScope;
      const pack = await buildContextPack(resolvedScope, topic);
      return textResult(pack.markdown);
    }
  );

  server.registerTool(
    'porter_list_files',
    {
      title: 'List files for a scope',
      description:
        'List files known to a scope. Reads from the products/registry when it exists; otherwise ' +
        'falls back to the vault\'s own file-shaped artifacts (raw_file / external_url) for that scope.',
      inputSchema: {
        scope: z.string().trim().min(1).optional().describe('Scope to list (defaults to the active/selected scope, else "ymc").'),
      },
    },
    async ({ scope }) => {
      const resolvedScope = scope || activeScope;
      const result = await listFilesForScope(resolvedScope);
      return textResult({ scope: resolvedScope, ...result });
    }
  );

  server.registerTool(
    'porter_list_services',
    {
      title: 'List services for a scope',
      description:
        'List services registered under a scope. Reads from the products/registry when it exists; ' +
        'otherwise falls back to vault nodes of a service-shaped declared type for that scope, or an ' +
        'honest empty result with a note when neither is available.',
      inputSchema: {
        scope: z.string().trim().min(1).optional().describe('Scope to list (defaults to the active/selected scope, else "ymc").'),
      },
    },
    async ({ scope }) => {
      const resolvedScope = scope || activeScope;
      const result = await listServicesForScope(resolvedScope);
      return textResult({ scope: resolvedScope, ...result });
    }
  );

  server.registerTool(
    'porter_list_tools',
    {
      title: 'List Porter tools',
      description:
        'List tools Porter knows about. Reads from the products/registry when it exists; otherwise ' +
        "falls back to Porter's own global tool catalog.",
      inputSchema: {},
    },
    async () => {
      const result = await listPorterTools();
      return textResult(result);
    }
  );

  // ── Optional MCP resource: a compact per-scope vault summary ──────────────
  // porter-vault://{scope} — node/edge counts by type+layer. Cheap, cacheable
  // orientation read a client can pull without spending a tool call.
  server.registerResource(
    'porter-vault-summary',
    new ResourceTemplate('porter-vault://{scope}', { list: undefined }),
    {
      title: 'Porter vault summary',
      description: 'Node/edge counts by type and layer for a vault scope.',
      mimeType: 'application/json',
    },
    async (uri, { scope }) => {
      const scopeStr = Array.isArray(scope) ? scope[0] : scope;
      const nodeCounts = (await pool.query(
        `SELECT layer, type, COUNT(*)::int AS count FROM vault_nodes WHERE app_scope = $1 GROUP BY layer, type ORDER BY layer, type`,
        [scopeStr]
      )).rows;
      const edgeCount = (await pool.query(`SELECT COUNT(*)::int AS c FROM vault_edges WHERE app_scope = $1`, [scopeStr])).rows[0] as { c: number };
      const body = { scope: scopeStr, nodesByTypeLayer: nodeCounts, edgeCount: edgeCount.c };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }] };
    }
  );

  return server;
}
