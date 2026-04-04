import { FastifyInstance } from 'fastify';
import { ok } from '../../lib/admin-envelope.js';
import { queryAll, queryOne } from '../../db/pg-helpers.js';

export default async function battlesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.requirePlatformAdmin);

  // GET /api/admin/battles — list battles with pagination
  fastify.get('/', async (req) => {
    const { limit = '50', offset = '0', status, domain } = req.query as Record<string, string>;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    try {
      let query = `
        SELECT b.id, b.challenger_id, b.defender_id, b.prompt, b.domain, b.status,
               b.winner_id, b.judge_model, b.judge_scores,
               b.challenger_elo_before, b.defender_elo_before,
               b.challenger_elo_after, b.defender_elo_after,
               b.spectators, b.created_at, b.completed_at,
               c.name as challenger_name, d.name as defender_name
        FROM battles b
        LEFT JOIN personas c ON c.id = b.challenger_id
        LEFT JOIN personas d ON d.id = b.defender_id
      `;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (status) {
        conditions.push(`b.status = $${idx}`);
        params.push(status);
        idx++;
      }
      if (domain) {
        conditions.push(`b.domain = $${idx}`);
        params.push(domain);
        idx++;
      }

      if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
      query += ` ORDER BY b.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
      params.push(lim, off);

      const battles = await queryAll(query, params);

      // Total count for pagination
      let countQuery = 'SELECT count(*)::int as total FROM battles';
      const countParams: unknown[] = [];
      const countConditions: string[] = [];
      let ci = 1;
      if (status) { countConditions.push(`status = $${ci}`); countParams.push(status); ci++; }
      if (domain) { countConditions.push(`domain = $${ci}`); countParams.push(domain); ci++; }
      if (countConditions.length) countQuery += ' WHERE ' + countConditions.join(' AND ');

      const countRow = await queryOne<{ total: number }>(countQuery, countParams);

      return ok({ battles, total: countRow?.total ?? 0 });
    } catch {
      return ok({ battles: [], total: 0 });
    }
  });

  // GET /api/admin/battles/:id — single battle with rounds + judgments
  fastify.get('/:id', async (req) => {
    const { id } = req.params as { id: string };

    try {
      const battle = await queryOne(`
        SELECT b.*, c.name as challenger_name, d.name as defender_name
        FROM battles b
        LEFT JOIN personas c ON c.id = b.challenger_id
        LEFT JOIN personas d ON d.id = b.defender_id
        WHERE b.id = $1
      `, [id]);

      if (!battle) return ok({ battle: null, rounds: [], judgments: [] });

      const rounds = await queryAll(
        'SELECT * FROM battle_rounds WHERE battle_id = $1 ORDER BY round_num ASC',
        [id]
      );

      const judgments = await queryAll(
        'SELECT * FROM battle_judgments WHERE battle_id = $1 ORDER BY created_at ASC',
        [id]
      );

      return ok({ battle, rounds, judgments });
    } catch {
      return ok({ battle: null, rounds: [], judgments: [] });
    }
  });

  // GET /api/admin/battles/leaderboard — agent RPG stats by elo
  fastify.get('/leaderboard', async () => {
    try {
      const rows = await queryAll(`
        SELECT s.template_id, s.elo, s.level, s.xp, s.quality, s.speed,
               s.efficiency, s.reliability, s.battle_count, s.dispatch_count,
               s.rarity, s.agent_class, s.stars,
               p.name as agent_name
        FROM agent_rpg_stats s
        LEFT JOIN personas p ON p.id = s.template_id
        ORDER BY s.elo DESC
      `);

      return ok({ leaderboard: rows });
    } catch {
      return ok({ leaderboard: [] });
    }
  });

  // GET /api/admin/battles/bonds — agent bonds by combo score
  fastify.get('/bonds', async () => {
    try {
      const rows = await queryAll(`
        SELECT ab.id, ab.agent_a_id, ab.agent_b_id,
               ab.chain_count, ab.success_count, ab.combo_score,
               ab.last_chained, ab.created_at,
               pa.name as agent_a_name, pb.name as agent_b_name
        FROM agent_bonds ab
        LEFT JOIN personas pa ON pa.id = ab.agent_a_id
        LEFT JOIN personas pb ON pb.id = ab.agent_b_id
        ORDER BY ab.combo_score DESC
      `);

      return ok({ bonds: rows });
    } catch {
      return ok({ bonds: [] });
    }
  });
}
