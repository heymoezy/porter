/**
 * events.ts — THE one log. "What happened?", answered in one place.
 *
 * Moe, 2026-08-03, on the Buzz repo's unified event log: *"take this opportunity
 * to consolidate everything — having all of these various logs is a mess — one
 * log is the best idea. one source of truth."*
 *
 * ⚠️ THIS IS NOT A MERGE OF EVERY TABLE, AND THAT IS DELIBERATE. Before building
 * it, the actual surfaces were counted: `tom_sent_log` (845), `tom_jobs`,
 * `tom_tasks` (54), `tom_knowledge` (14), `document_reviews` (492),
 * `contact_activities` (952), `agent_jobs` (4,518), `agent_activity` (9,317),
 * `agent_messages` (2,977), `intellect_events` (38,956), plus file logs. Several
 * of those are NOT logs — `tom_tasks` is a queue, `tom_knowledge` is knowledge,
 * `document_reviews` is a compliance record with a named reviewer. Folding them
 * into one table would destroy the meaning each carries, which is the same
 * mistake as merging two Ollama release notes because they look alike.
 *
 * The split that actually holds:
 *   · ONE truth for **what happened** — an append-only event stream. This.
 *   · ONE truth per domain for **what is** — the existing tables, untouched.
 *
 * ⚠️ IT REUSES `intellect_events` RATHER THAN CREATING AN ELEVENTH TABLE. That
 * table is already exactly this shape (id, event_type, source_type, details_json,
 * created_at) and already holds 38,956 rows. A new `events` table would have made
 * the count worse while claiming to fix it. The gap was never a missing table —
 * it was that ymc's side (sends, filings, releases) never reached this one.
 *
 * ⚠️ ADDITIVE, NEVER AUTHORITATIVE. A writer records here IN ADDITION to its own
 * table, never instead of it. `tom_sent_log` remains what proves a message was
 * handed to the gateway; this makes it findable next to everything else that
 * happened that day. Nothing may read this log to decide whether an action
 * already occurred — that is what the domain tables are for, and an append-only
 * stream with a best-effort writer is the wrong thing to gate on.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';

/** Cap so one caller cannot pull the whole 38k-row history into a reply. */
const MAX_LIMIT = 200;

export async function eventsV1Routes(fastify: FastifyInstance): Promise<void> {
  /**
   * Record one event.
   *
   * `source` namespaces the writer (`ymc.send`, `ymc.filing`, `ymc.release`,
   * `porter.dream`…) so the stream stays readable when everything writes to it.
   */
  fastify.post('/', async (request, reply) => {
    const body = (request.body || {}) as {
      type?: unknown; source?: unknown; details?: unknown; at?: unknown;
    };
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    if (!type || !source) {
      return reply.code(400).send(err('INVALID_INPUT', 'type and source are required', request.id));
    }
    const details = body.details && typeof body.details === 'object' ? body.details : {};
    // A caller-supplied timestamp is honoured so a backfill lands on the day the
    // thing HAPPENED, not the day it was imported — otherwise a backfill makes
    // every historical event look like it occurred this afternoon.
    const at = Number.isFinite(Number(body.at)) ? Number(body.at) : Date.now() / 1000;

    const id = randomUUID();
    await pool.query(
      `INSERT INTO intellect_events (id, event_type, source_type, details_json, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [id, type, source, JSON.stringify(details), at],
    );
    return reply.send(ok({ id, type, source, at }, request.id));
  });

  /**
   * Search it. This is the point of the whole thing: one question, one answer.
   *
   * `q` matches the JSON payload as text — deliberately crude. The details of an
   * event have no fixed shape across a dozen writers, and a schema strict enough
   * to index properly is a schema that rejects the next writer.
   */
  fastify.get('/', async (request, reply) => {
    const qs = (request.query || {}) as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(qs.limit) || 50, 1), MAX_LIMIT);
    const since = Number.isFinite(Number(qs.since_hours)) ? Number(qs.since_hours) : 24;

    const where: string[] = [`created_at > EXTRACT(EPOCH FROM now()) - $1`];
    const params: unknown[] = [since * 3600];
    if (qs.source) { params.push(`${qs.source}%`); where.push(`source_type LIKE $${params.length}`); }
    if (qs.type) { params.push(`${qs.type}%`); where.push(`event_type LIKE $${params.length}`); }
    if (qs.q) { params.push(`%${qs.q}%`); where.push(`details_json::text ILIKE $${params.length}`); }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT id, event_type, source_type, details_json,
              to_timestamp(created_at) AS at
         FROM intellect_events
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return reply.send(ok({ count: rows.length, events: rows }, request.id));
  });

  /** What kinds of thing happened, and how often. The "is anything broken" view. */
  fastify.get('/summary', async (request, reply) => {
    const qs = (request.query || {}) as Record<string, string | undefined>;
    const since = Number.isFinite(Number(qs.since_hours)) ? Number(qs.since_hours) : 24;
    const { rows } = await pool.query(
      `SELECT source_type, event_type, count(*)::int AS n,
              to_timestamp(max(created_at)) AS last_at
         FROM intellect_events
        WHERE created_at > EXTRACT(EPOCH FROM now()) - $1
        GROUP BY source_type, event_type
        ORDER BY n DESC
        LIMIT 60`,
      [since * 3600],
    );
    return reply.send(ok({ since_hours: since, kinds: rows }, request.id));
  });
}
