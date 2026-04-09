/**
 * Intellect API routes — context delivery, event stream, feedback.
 *
 * GET /api/v1/intellect/context?project=X  — scoped memory for CLI session
 * GET /api/v1/intellect/events              — recent Intellect events (polling)
 * POST /api/v1/intellect/validate            — trigger manual memory validation
 * POST /api/v1/intellect/feedback            — user feedback on Intellect decisions
 */

import { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { runMemoryValidation } from '../../services/intellect/memory-validator.js';

interface DirectiveRow {
  id: string;
  scope: string;
  scope_id: string | null;
  content: string;
  priority: number;
  verified_at: number | null;
}

interface ConceptRow {
  id: string;
  scope: string;
  scope_id: string | null;
  content: string;
  trust_tier: string;
  confidence_score: number;
}

interface EpisodeRow {
  id: string;
  scope_id: string | null;
  summary: string;
  files_changed_json: unknown;
  created_at: number;
}

interface IntellectEventRow {
  id: string;
  event_type: string;
  source_type: string;
  details_json: unknown;
  created_at: number;
}

export default async function intellectRoutes(fastify: FastifyInstance) {
  // ── GET /context — scoped memory for CLI session injection ────────────

  fastify.get('/context', async (request, reply) => {
    const { project, scope } = request.query as { project?: string; scope?: string };

    // Fetch system directives (always apply)
    const { rows: systemDirectives } = await pool.query<DirectiveRow>(
      `SELECT id, scope, scope_id, content, priority, verified_at
       FROM directives
       WHERE status = 'active' AND scope = 'workspace'
       ORDER BY priority DESC`
    );

    // Fetch project-scoped directives if project specified
    let projectDirectives: DirectiveRow[] = [];
    if (project) {
      const { rows } = await pool.query<DirectiveRow>(
        `SELECT id, scope, scope_id, content, priority, verified_at
         FROM directives
         WHERE status = 'active' AND scope = 'project' AND scope_id = $1
         ORDER BY priority DESC`,
        [project]
      );
      projectDirectives = rows;
    }

    // Fetch relevant concepts (global + project-scoped)
    const conceptQuery = project
      ? `SELECT id, scope, scope_id, content, trust_tier, confidence_score
         FROM concepts
         WHERE status = 'active' AND (scope = 'global' OR (scope = 'project' AND scope_id = $1))
         ORDER BY confidence_score DESC, last_used_at DESC NULLS LAST
         LIMIT 20`
      : `SELECT id, scope, scope_id, content, trust_tier, confidence_score
         FROM concepts
         WHERE status = 'active' AND scope = 'global'
         ORDER BY confidence_score DESC, last_used_at DESC NULLS LAST
         LIMIT 10`;
    const { rows: concepts } = await pool.query<ConceptRow>(
      conceptQuery,
      project ? [project] : []
    );

    // Fetch recent episodes for this project
    let episodes: EpisodeRow[] = [];
    if (project) {
      const { rows } = await pool.query<EpisodeRow>(
        `SELECT id, scope_id, summary, files_changed_json, created_at
         FROM episodes
         WHERE scope = 'project' AND scope_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [project]
      );
      episodes = rows;
    }

    // Format as markdown for CLI injection
    const sections: string[] = [];

    sections.push('## Porter Context');
    if (project) sections.push(`Project: **${project}**`);
    sections.push('');

    if (systemDirectives.length > 0) {
      sections.push('### System Directives');
      for (const d of systemDirectives.slice(0, 15)) {
        sections.push(`- ${d.content}`);
      }
      sections.push('');
    }

    if (projectDirectives.length > 0) {
      sections.push(`### Project Directives (${project})`);
      for (const d of projectDirectives) {
        sections.push(`- ${d.content}`);
      }
      sections.push('');
    }

    if (episodes.length > 0) {
      sections.push('### Recent Sessions');
      for (const e of episodes) {
        const when = new Date(e.created_at * 1000).toISOString().split('T')[0];
        sections.push(`- **${when}**: ${e.summary}`);
      }
      sections.push('');
    }

    if (concepts.length > 0) {
      sections.push('### Relevant Concepts');
      for (const c of concepts.slice(0, 8)) {
        sections.push(`- ${c.content.substring(0, 200)}${c.content.length > 200 ? '...' : ''}`);
      }
    }

    const contextText = sections.join('\n');

    return reply.send(ok({
      context: contextText,
      stats: {
        systemDirectives: systemDirectives.length,
        projectDirectives: projectDirectives.length,
        episodes: episodes.length,
        concepts: concepts.length,
      },
    }));
  });

  // ── GET /events — recent Intellect decisions (polling) ────────────────

  fastify.get('/events', async (request, reply) => {
    const { limit = '50', since } = request.query as { limit?: string; since?: string };
    const lim = Math.min(parseInt(limit, 10) || 50, 200);

    const { rows } = since
      ? await pool.query<IntellectEventRow>(
          `SELECT id, event_type, source_type, details_json, created_at
           FROM intellect_events
           WHERE created_at > $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [parseFloat(since), lim]
        )
      : await pool.query<IntellectEventRow>(
          `SELECT id, event_type, source_type, details_json, created_at
           FROM intellect_events
           ORDER BY created_at DESC
           LIMIT $1`,
          [lim]
        );

    return reply.send(ok({ events: rows, count: rows.length }));
  });

  // ── GET /stream — SSE stream of Intellect events ──────────────────────

  fastify.get('/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send heartbeat + poll for new events every 3 seconds
    let lastTimestamp = Date.now() / 1000;
    const interval = setInterval(async () => {
      try {
        const { rows } = await pool.query<IntellectEventRow>(
          `SELECT id, event_type, source_type, details_json, created_at
           FROM intellect_events
           WHERE created_at > $1
           ORDER BY created_at ASC
           LIMIT 20`,
          [lastTimestamp]
        );
        if (rows.length > 0) {
          lastTimestamp = rows[rows.length - 1].created_at;
          for (const event of rows) {
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        } else {
          reply.raw.write(`:heartbeat\n\n`);
        }
      } catch (e) {
        console.error('[intellect:stream] error', e);
      }
    }, 3000);

    request.raw.on('close', () => {
      clearInterval(interval);
      reply.raw.end();
    });
  });

  // ── POST /validate — trigger manual memory validation ────────────────

  fastify.post('/validate', async (_request, reply) => {
    try {
      await runMemoryValidation();
      return reply.send(ok({ triggered: true }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send(err('VALIDATION_FAILED', message));
    }
  });

  // ── GET /stats — Intellect system stats ──────────────────────────────

  fastify.get('/stats', async (_request, reply) => {
    const { rows: memStats } = await pool.query<{
      total: string;
      valid: string;
      broken: string;
      stale: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'valid')::text AS valid,
         COUNT(*) FILTER (WHERE status = 'broken')::text AS broken,
         COUNT(*) FILTER (WHERE status = 'stale')::text AS stale
       FROM memory_references`
    );

    const { rows: eventStats } = await pool.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
       FROM intellect_events
       WHERE created_at > EXTRACT(EPOCH FROM NOW()) - 86400
       GROUP BY event_type`
    );

    const { rows: episodeCount } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM episodes`
    );

    return reply.send(ok({
      references: memStats[0] || { total: '0', valid: '0', broken: '0', stale: '0' },
      events24h: eventStats,
      episodes: parseInt(episodeCount[0]?.count || '0', 10),
    }));
  });
}
