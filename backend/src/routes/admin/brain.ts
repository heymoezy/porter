/**
 * Admin Brain API — the data layer for the merged Brain screen (v6.31.0).
 *
 * The Brain screen replaces Intelligence + Dreams + Recall + Learnings (Moe
 * 2026-06-10: "junk screens that mean nothing to me and should probably all
 * be combined"). It answers three questions with REAL data only (never
 * placeholder zeros — a zero here means the query genuinely returned zero):
 *   1. What does Porter know?    → memory counts by layer + browser data
 *   2. What is it learning?      → pending proposals + candidates (triage)
 *   3. Who is it feeding?        → recall/injection/write flow in the last 24h
 */
import { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { ok } from '../../lib/envelope.js';

export default async function brainRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/brain/summary — header metrics, all real ──────────────
  fastify.get('/summary', async (_req, reply) => {
    const dayAgo = 'EXTRACT(epoch FROM now()) - 86400';
    const [directives, concepts, episodes, episodes24h, proposals, candidates, flow24h, agentRules] = await Promise.all([
      pool.query(`SELECT count(*)::int AS n FROM directives WHERE status='active'`),
      pool.query(`SELECT count(*)::int AS n FROM concepts WHERE status='active'`),
      pool.query(`SELECT count(*)::int AS n FROM episodes`),
      pool.query(`SELECT count(*)::int AS n FROM episodes WHERE created_at > ${dayAgo}`),
      pool.query(`SELECT count(*)::int AS n FROM memory_proposals WHERE status='pending'`),
      pool.query(`SELECT count(*)::int AS n FROM directives WHERE status='candidate'`),
      pool.query(
        `SELECT event_type, count(*)::int AS n FROM intellect_events
          WHERE created_at > ${dayAgo}
            AND event_type IN ('agent_memory_recall','agent_memory_write','correction.detected','session.end')
          GROUP BY event_type`,
      ),
      pool.query(`SELECT count(*)::int AS n FROM directives WHERE status='active' AND source_type='agent_learned'`),
    ]);
    const flow: Record<string, number> = {};
    for (const r of flow24h.rows) flow[r.event_type] = r.n;
    return reply.send(ok({
      directives_active: directives.rows[0].n,
      agent_learned_rules: agentRules.rows[0].n,
      concepts_active: concepts.rows[0].n,
      episodes_total: episodes.rows[0].n,
      episodes_24h: episodes24h.rows[0].n,
      proposals_pending: proposals.rows[0].n,
      candidates_pending: candidates.rows[0].n,
      recalls_24h: flow['agent_memory_recall'] ?? 0,
      memory_writes_24h: flow['agent_memory_write'] ?? 0,
      corrections_24h: flow['correction.detected'] ?? 0,
    }));
  });

  // ── GET /api/admin/brain/memory?kind=rules|knowledge|episodes&q=&scope=&limit= ──
  // One browser endpoint over the three real layers. FTS for knowledge
  // (concepts.search_vector); ILIKE for rules/episodes (small tables).
  fastify.get('/memory', async (request, reply) => {
    const q = request.query as { kind?: string; q?: string; scope?: string; limit?: string };
    const kind = ['rules', 'knowledge', 'episodes'].includes(String(q.kind)) ? String(q.kind) : 'rules';
    const search = String(q.q ?? '').trim();
    const scope = String(q.scope ?? '').trim(); // '', 'agent', 'project', 'global', 'workspace'
    const limit = Math.min(parseInt(String(q.limit ?? '60'), 10) || 60, 200);

    if (kind === 'rules') {
      const params: unknown[] = [];
      let where = `status = 'active'`;
      if (scope) { params.push(scope); where += ` AND scope = $${params.length}`; }
      if (search) { params.push(`%${search}%`); where += ` AND content ILIKE $${params.length}`; }
      params.push(limit);
      const rows = (await pool.query(
        `SELECT id, scope, scope_id, content, priority, source_type, created_at
           FROM directives WHERE ${where}
          ORDER BY priority DESC NULLS LAST, created_at DESC LIMIT $${params.length}`,
        params,
      )).rows;
      return reply.send(ok({ kind, rows }));
    }

    if (kind === 'episodes') {
      const params: unknown[] = [];
      let where = `1=1`;
      if (scope) { params.push(scope); where += ` AND scope = $${params.length}`; }
      if (search) { params.push(`%${search}%`); where += ` AND summary ILIKE $${params.length}`; }
      params.push(limit);
      const rows = (await pool.query(
        `SELECT id, scope, scope_id, summary AS content, gateway, created_at
           FROM episodes WHERE ${where}
          ORDER BY created_at DESC LIMIT $${params.length}`,
        params,
      )).rows;
      return reply.send(ok({ kind, rows }));
    }

    // knowledge (concepts) — FTS when searching, recency otherwise
    const params: unknown[] = [];
    let where = `status = 'active'`;
    if (scope) { params.push(scope); where += ` AND scope = $${params.length}`; }
    let orderBy = 'created_at DESC';
    if (search) {
      params.push(search);
      where += ` AND search_vector @@ websearch_to_tsquery('english', $${params.length})`;
      orderBy = `ts_rank(search_vector, websearch_to_tsquery('english', $${params.length})) DESC`;
    }
    params.push(limit);
    const rows = (await pool.query(
      `SELECT id, scope, scope_id, content, source_type, trust_tier, use_count, created_at
         FROM concepts WHERE ${where}
        ORDER BY ${orderBy} LIMIT $${params.length}`,
      params,
    )).rows;
    return reply.send(ok({ kind, rows }));
  });

  // ── GET /api/admin/brain/feed?limit= — the synapse feed (live flow) ──────
  // Normalized recent intellect events for the left rail. Honest: only events
  // that actually happened; the UI shows "quiet" when empty.
  fastify.get('/feed', async (request, reply) => {
    const limit = Math.min(parseInt(String((request.query as { limit?: string }).limit ?? '40'), 10) || 40, 100);
    const rows = (await pool.query(
      `SELECT id, event_type, source_type, details_json, created_at
         FROM intellect_events
        ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )).rows;
    return reply.send(ok({ events: rows }));
  });
}
