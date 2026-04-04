import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function forgeRunsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/forge-runs — list pipeline runs
  fastify.get('/', async (req) => {
    const { limit = '50', status } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 200);

    try {
      let query = `
        SELECT fp.id, fp.template_id, fp.agent_id, fp.station, fp.status,
               fp.wave, fp.attempt, fp.max_attempts, fp.tokens_used,
               fp.worker_id, fp.created_at, fp.updated_at, fp.started_at,
               fp.completed_at, fp.error,
               p.name as agent_name
        FROM forge_pipeline fp
        LEFT JOIN personas p ON p.id = fp.agent_id
      `;
      const params: unknown[] = [];
      let idx = 1;

      if (status) {
        query += ` WHERE fp.status = $${idx}`;
        params.push(status);
        idx++;
      }

      query += ` ORDER BY fp.created_at DESC LIMIT $${idx}`;
      params.push(lim);

      const runs = await queryAll(query, params);
      return ok({ runs, total: runs.length });
    } catch {
      return ok({ runs: [], total: 0 });
    }
  });

  // GET /api/admin/forge-runs/stats — aggregate stats
  fastify.get('/stats', async () => {
    try {
      const statusCounts = await queryAll<{ status: string; count: number }>(
        `SELECT status, count(*)::int as count FROM forge_pipeline GROUP BY status`
      );

      const totals = await queryOne<{ total_tokens: number; avg_quality: number; total_runs: number }>(
        `SELECT coalesce(sum(tokens_used), 0)::int as total_tokens,
                coalesce(avg(fsr.quality_score), 0)::float as avg_quality,
                count(*)::int as total_runs
         FROM forge_pipeline fp
         LEFT JOIN forge_station_runs fsr ON fsr.pipeline_id = fp.id`
      );

      return ok({
        statusCounts,
        totalTokens: totals?.total_tokens ?? 0,
        avgQuality: totals?.avg_quality ?? 0,
        totalRuns: totals?.total_runs ?? 0,
      });
    } catch {
      return ok({ statusCounts: [], totalTokens: 0, avgQuality: 0, totalRuns: 0 });
    }
  });

  // GET /api/admin/forge-runs/:id — single pipeline with station runs
  fastify.get('/:id', async (req) => {
    const { id } = req.params as { id: string };

    try {
      const pipeline = await queryOne(
        `SELECT fp.*, p.name as agent_name
         FROM forge_pipeline fp
         LEFT JOIN personas p ON p.id = fp.agent_id
         WHERE fp.id = $1`,
        [id]
      );

      if (!pipeline) {
        return ok({ pipeline: null, stationRuns: [] });
      }

      const stationRuns = await queryAll(
        `SELECT id, pipeline_id, station, phase, status,
                writer_model, checker_model, quality_score,
                rubric, qa_rationale, files_touched, skills_assigned,
                tools_mapped, cost_reserved, cost_actual, tokens_used,
                created_at, updated_at, started_at, completed_at
         FROM forge_station_runs
         WHERE pipeline_id = $1
         ORDER BY created_at ASC`,
        [id]
      );

      return ok({ pipeline, stationRuns });
    } catch {
      return ok({ pipeline: null, stationRuns: [] });
    }
  });
}
