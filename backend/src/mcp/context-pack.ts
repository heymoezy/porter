/**
 * Porter MCP — the token-reduction tool's builder.
 *
 * porter_get_context_pack(topic, scope) exists so a Claude Code session can
 * ask Porter for a tight Markdown brief instead of grepping the repo /
 * re-deriving facts already sitting in the vault. This module does the
 * search -> content-resolve -> cap work; porter-mcp.ts just wires it to the
 * MCP tool surface.
 */

import { pool } from '../db/client.js';
import { searchVaultNodes, resolveNodeContent, getChildren, getRelatedEdges } from './vault-lookup.js';

const MAX_PACK_CHARS = 8000; // ~2k tokens at ~4 chars/token — the whole point of this tool
const MAX_NODE_CHARS = 1400; // per-node content slice before the pack-level cap kicks in
const MAX_NODES = 6;

export interface ContextPack {
  scope: string;
  topic: string;
  markdown: string;
  nodeCount: number;
  approxTokens: number;
  truncated: boolean;
}

/**
 * Build a capped Markdown context pack for `topic` within `scope`. Never
 * throws on "nothing found" — returns an honest empty pack instead, so the
 * calling tool can report that plainly rather than erroring.
 */
export async function buildContextPack(scope: string, topic: string): Promise<ContextPack> {
  const hits = await searchVaultNodes(scope, topic, { limit: MAX_NODES * 2 });

  if (hits.length === 0) {
    const registered = (await pool.query(`SELECT 1 FROM vault_schemas WHERE app_scope = $1`, [scope])).rows.length > 0;
    const markdown = registered
      ? `# Context pack: "${topic}" (scope: ${scope})\n\nNo vault nodes matched this topic in scope "${scope}". Try a broader query or check porter_search_vault for related terms.`
      : `# Context pack: "${topic}" (scope: ${scope})\n\nScope "${scope}" has no registered vault schema yet — nothing to search.`;
    return { scope, topic, markdown, nodeCount: 0, approxTokens: Math.ceil(markdown.length / 4), truncated: false };
  }

  const sections: string[] = [`# Context pack: "${topic}" (scope: ${scope})`, ''];
  let used = sections.join('\n').length;
  let nodeCount = 0;
  let truncated = false;

  for (const hit of hits.slice(0, MAX_NODES)) {
    const [{ content, source }, children, edges] = await Promise.all([
      resolveNodeContent(scope, hit.id),
      getChildren(scope, hit.id),
      getRelatedEdges(scope, hit.id),
    ]);

    const lines: string[] = [];
    lines.push(`## ${hit.title}`);
    lines.push(`*type: ${hit.type} · layer: ${hit.layer} · id: ${hit.id}*`);
    if (content) {
      const slice = content.length > MAX_NODE_CHARS ? content.slice(0, MAX_NODE_CHARS) + ' …[truncated]' : content;
      lines.push('');
      lines.push(slice);
    } else {
      lines.push('');
      lines.push('_(no content artifact resolvable for this node — title/type only)_');
    }
    if (children.length) {
      lines.push('');
      lines.push(`Children: ${children.map((c) => `${c.title} (${c.type})`).join(', ')}`);
    }
    if (edges.length) {
      lines.push('');
      lines.push(`Related: ${edges.map((e) => `${e.kind} ${e.direction === 'out' ? '→' : '←'} ${e.title} (${e.type})`).join(', ')}`);
    }
    if (source) {
      lines.push('');
      lines.push(`Source: ${source}`);
    }
    lines.push('');

    const block = lines.join('\n');
    if (used + block.length > MAX_PACK_CHARS && nodeCount > 0) {
      truncated = true;
      break; // keep at least one node even if it alone exceeds the cap; stop before the next
    }
    sections.push(block);
    used += block.length;
    nodeCount++;
  }

  if (hits.length > nodeCount) truncated = true;

  const markdown = sections.join('\n').slice(0, MAX_PACK_CHARS + 500); // hard backstop
  return {
    scope,
    topic,
    markdown,
    nodeCount,
    approxTokens: Math.ceil(markdown.length / 4),
    truncated,
  };
}
