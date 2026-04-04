import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryOne, queryAll } from '../../db/pg-helpers.js';

export default async function costsRoutes(fastify: FastifyInstance) {
  // All routes require platform_admin
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/costs — Cost summary (overview)
  fastify.get('/', async () => {
    try {
      // Totals
      const totals = await queryOne<{
        total_cost: number;
        total_dispatches: number;
        total_input: number;
        total_output: number;
        total_cached: number;
      }>(
        `SELECT
           COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
           COUNT(*)::int as total_dispatches,
           COALESCE(SUM(input_tokens), 0)::bigint as total_input,
           COALESCE(SUM(output_tokens), 0)::bigint as total_output,
           COALESCE(SUM(cached_tokens), 0)::bigint as total_cached
         FROM bridge_dispatch_log`
      );

      // By gateway (join gateways for name)
      const byGateway = await queryAll<{
        gateway_id: string;
        gateway_name: string;
        dispatches: number;
        total_cost: number;
        total_input: number;
        total_output: number;
        avg_latency: number;
      }>(
        `SELECT
           b.gateway_id,
           COALESCE(g.name, b.gateway_id) as gateway_name,
           COUNT(*)::int as dispatches,
           COALESCE(SUM(b.estimated_cost_usd), 0) as total_cost,
           COALESCE(SUM(b.input_tokens), 0)::bigint as total_input,
           COALESCE(SUM(b.output_tokens), 0)::bigint as total_output,
           COALESCE(AVG(b.latency_ms), 0)::int as avg_latency
         FROM bridge_dispatch_log b
         LEFT JOIN gateways g ON g.id = b.gateway_id
         GROUP BY b.gateway_id, g.name
         ORDER BY SUM(b.estimated_cost_usd) DESC NULLS LAST`
      );

      // By model
      const byModel = await queryAll<{
        model_name: string;
        dispatches: number;
        total_cost: number;
        total_input: number;
        total_output: number;
        avg_latency: number;
      }>(
        `SELECT
           model_name,
           COUNT(*)::int as dispatches,
           COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
           COALESCE(SUM(input_tokens), 0)::bigint as total_input,
           COALESCE(SUM(output_tokens), 0)::bigint as total_output,
           COALESCE(AVG(latency_ms), 0)::int as avg_latency
         FROM bridge_dispatch_log
         GROUP BY model_name
         ORDER BY SUM(estimated_cost_usd) DESC NULLS LAST`
      );

      // Daily costs (last 30 days from dispatch log)
      const dailyCosts = await queryAll<{
        day: string;
        dispatches: number;
        cost: number;
        input_tokens: number;
        output_tokens: number;
      }>(
        `SELECT
           TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as day,
           COUNT(*)::int as dispatches,
           COALESCE(SUM(estimated_cost_usd), 0) as cost,
           COALESCE(SUM(input_tokens), 0)::bigint as input_tokens,
           COALESCE(SUM(output_tokens), 0)::bigint as output_tokens
         FROM bridge_dispatch_log
         WHERE created_at > EXTRACT(epoch FROM now()) - 2592000
         GROUP BY day
         ORDER BY day ASC`
      );

      // Token usage daily (aggregated table)
      const tokenDaily = await queryAll<{
        date: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        request_count: number;
      }>(
        `SELECT date, model, input_tokens, output_tokens, request_count
         FROM token_usage_daily
         ORDER BY date DESC
         LIMIT 90`
      );

      return ok({
        totals: totals ?? { total_cost: 0, total_dispatches: 0, total_input: 0, total_output: 0, total_cached: 0 },
        byGateway,
        byModel,
        dailyCosts,
        tokenDaily,
      });
    } catch (e) {
      return ok({
        totals: { total_cost: 0, total_dispatches: 0, total_input: 0, total_output: 0, total_cached: 0 },
        byGateway: [],
        byModel: [],
        dailyCosts: [],
        tokenDaily: [],
      });
    }
  });

  // GET /api/admin/costs/dispatches — Recent dispatches with cost
  fastify.get('/dispatches', async (request) => {
    const { gateway, model, limit: lim } = request.query as Record<string, string>;
    const limit = Math.min(parseInt(lim) || 100, 500);

    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];
      let paramIdx = 0;

      if (gateway) {
        paramIdx++;
        conditions.push(`gateway_id = $${paramIdx}`);
        params.push(gateway);
      }
      if (model) {
        paramIdx++;
        conditions.push(`model_name = $${paramIdx}`);
        params.push(model);
      }

      paramIdx++;
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const dispatches = await queryAll(
        `SELECT id, gateway_id, model_name, input_tokens, output_tokens,
                cached_tokens, estimated_cost_usd, latency_ms, intent,
                outcome_score, created_at, source_agent, target_agent,
                project_id, chat_id, username
         FROM bridge_dispatch_log
         ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        [...params, limit]
      );

      return ok({ dispatches });
    } catch {
      return ok({ dispatches: [] });
    }
  });

  // GET /api/admin/costs/by-agent — Cost by agent
  fastify.get('/by-agent', async () => {
    try {
      const byAgent = await queryAll<{
        agent_id: string;
        source_agent: string;
        dispatches: number;
        total_cost: number;
        total_input: number;
        total_output: number;
        avg_latency: number;
      }>(
        `SELECT
           COALESCE(agent_id, source_agent, 'unknown') as agent_id,
           COALESCE(source_agent, agent_id, 'unknown') as source_agent,
           COUNT(*)::int as dispatches,
           COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
           COALESCE(SUM(input_tokens), 0)::bigint as total_input,
           COALESCE(SUM(output_tokens), 0)::bigint as total_output,
           COALESCE(AVG(latency_ms), 0)::int as avg_latency
         FROM bridge_dispatch_log
         GROUP BY COALESCE(agent_id, source_agent, 'unknown'),
                  COALESCE(source_agent, agent_id, 'unknown')
         ORDER BY SUM(estimated_cost_usd) DESC NULLS LAST`
      );

      return ok({ byAgent });
    } catch {
      return ok({ byAgent: [] });
    }
  });

  // GET /api/admin/costs/by-project — Cost by project
  fastify.get('/by-project', async () => {
    try {
      const byProject = await queryAll<{
        project_id: string;
        project_name: string;
        dispatches: number;
        total_cost: number;
        total_input: number;
        total_output: number;
        avg_latency: number;
      }>(
        `SELECT
           COALESCE(b.project_id, 'none') as project_id,
           COALESCE(p.name, b.project_id, 'No Project') as project_name,
           COUNT(*)::int as dispatches,
           COALESCE(SUM(b.estimated_cost_usd), 0) as total_cost,
           COALESCE(SUM(b.input_tokens), 0)::bigint as total_input,
           COALESCE(SUM(b.output_tokens), 0)::bigint as total_output,
           COALESCE(AVG(b.latency_ms), 0)::int as avg_latency
         FROM bridge_dispatch_log b
         LEFT JOIN projects p ON p.id = b.project_id
         GROUP BY b.project_id, p.name
         ORDER BY SUM(b.estimated_cost_usd) DESC NULLS LAST`
      );

      return ok({ byProject });
    } catch {
      return ok({ byProject: [] });
    }
  });
}
