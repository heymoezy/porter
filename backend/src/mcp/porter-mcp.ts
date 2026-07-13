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

  // ── Universal memory (#37 R1/R2) — the reason this server exists ────────
  // Every CLI re-derives the same project state from zero each session. These
  // three make that unnecessary: open warm, leave a handoff, stay cheap.
  server.registerTool(
    'porter_bootstrap',
    {
      title: 'Bootstrap this session (warm context)',
      description:
        'CALL THIS FIRST, at the start of a session. Returns the warm "hot context" packet for a ' +
        'project: where the last session got to (CHECKPOINT.md latest), any handoff left for you, ' +
        'and POINTERS to drill into on demand. Hard-capped (~900 tokens) — it names files rather ' +
        'than inlining them, so bootstrapping stays cheap. On a fresh install it honestly returns ' +
        'status "cold" and you simply work from the repo; it never fabricates history.',
      inputSchema: {
        project: z.string().trim().min(1).describe('Project key, e.g. "ymc.capital" (a directory name under /home/lobster/projects).'),
        scope: z.string().trim().optional().describe('Optional tenant scope (default "default").'),
      },
    },
    async ({ project, scope }) => {
      const { getHot } = await import('../services/intellect/hot-context.js');
      return textResult(await getHot(project, scope ?? 'default'));
    }
  );

  server.registerTool(
    'porter_write_memory',
    {
      title: 'Leave a note/handoff for the next session',
      description:
        'Write runtime memory for a project. kind="handoff" passes your warm state to the NEXT ' +
        'session mid-flight (without ending yours) — use it before a risky step, a long pause, or ' +
        'when you have learned something the next session must not rediscover. It surfaces at the ' +
        'top of that session\'s porter_bootstrap. This is RUNTIME memory only: durable meaning is ' +
        'promoted into the vault separately, so you cannot pollute the knowledge graph from here.',
      inputSchema: {
        project: z.string().trim().min(1).describe('Project key, e.g. "ymc.capital".'),
        body: z.string().trim().min(1).describe('What the next session needs to know. Be specific and short.'),
        kind: z.enum(['handoff', 'note']).default('handoff').describe('handoff = state for the next session; note = an observation.'),
        gateway: z.string().trim().optional().describe('Which CLI you are (claude_cli | codex_cli | grok_cli | antigravity_cli).'),
        scope: z.string().trim().optional(),
      },
    },
    async ({ project, body, kind, gateway, scope }) => {
      const { appendHandoff, recomputeHot } = await import('../services/intellect/hot-context.js');
      await appendHandoff({ project, scope, kind, body, gateway: gateway ?? null });
      const hot = await recomputeHot({ project, scope, gateway: gateway ?? null });
      return textResult({ written: true, hot });
    }
  );

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

  // ── porter_which_tool: the anti-reinstall lookup (R8) ─────────────────────
  // Ask Porter "where is tool X / is it installed?" and get the canonical
  // absolute path + version + status from the tools registry, instead of
  // `which`-ing your own PATH, missing it, and reinstalling somewhere new.
  const TOOL_ALIASES: Record<string, string> = {
    soffice: 'libreoffice',
    'libre-office': 'libreoffice',
    chromium: 'playwright',
    chrome: 'puppeteer',
    'ms-playwright': 'playwright',
  };
  server.registerTool(
    'porter_which_tool',
    {
      title: 'Locate a tool (registry lookup)',
      description:
        'Answer "where is tool X / is it installed?" from Porter\'s canonical tools registry. ' +
        'Returns the real absolute canonical_path, version, kind (binary|npm|browser), status ' +
        '(present|missing|drift), and — if missing or drifted — an install_recipe. ' +
        'ALWAYS call this before installing playwright/puppeteer/libreoffice or any dev tool: ' +
        'Porter already owns the canonical location, so you reuse it instead of reinstalling elsewhere.',
      inputSchema: {
        name: z.string().trim().min(1).describe('Tool name/key, e.g. "playwright", "libreoffice", "node", "puppeteer".'),
      },
    },
    async ({ name }) => {
      const raw = name.toLowerCase().trim();
      const key = TOOL_ALIASES[raw] ?? raw;
      const { rows } = await pool.query<{
        tool_key: string; detected: number; version: string; kind: string;
        canonical_path: string; alt_paths: string; how_detected: string;
        install_recipe: string; status: string; health: string; source: string;
      }>(
        `SELECT tool_key, detected, version, kind, canonical_path, alt_paths,
                how_detected, install_recipe, status, health, source
           FROM environment_tools WHERE tool_key = $1`,
        [key]
      );
      if (rows.length === 0) {
        return textResult({
          found: false, query: name, resolvedKey: key,
          note: `No registry entry for "${key}". Porter does not track this tool yet — do NOT assume it is absent from the system. Ask an admin to add it, or check GET /api/admin/tools/registry.`,
        });
      }
      const r = rows[0];
      let altPaths: string[] = [];
      if (r.alt_paths) { try { altPaths = JSON.parse(r.alt_paths); } catch { altPaths = []; } }
      const status = r.status || (r.detected ? 'present' : 'missing');
      return textResult({
        found: true,
        key: r.tool_key,
        installed: !!r.detected,
        status,
        kind: r.kind || 'binary',
        version: r.version,
        canonicalPath: r.canonical_path || null,
        altPaths,
        howDetected: r.how_detected,
        source: r.source,
        installRecipe: status === 'present' ? null : (r.install_recipe || null),
        guidance:
          status === 'present'
            ? `Use it at: ${r.canonical_path}. Do NOT reinstall.`
            : status === 'drift'
              ? `Multiple builds present (drift): ${altPaths.join(', ')}. Use canonical ${r.canonical_path}; prune the rest per install_recipe.`
              : `Not installed. Follow install_recipe — install to the canonical location, do NOT scatter a new copy.`,
      });
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
