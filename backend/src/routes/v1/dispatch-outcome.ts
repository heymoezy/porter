/**
 * dispatch-outcome.ts — POST /api/v1/dispatches/:id/outcome
 *
 * SIN-03: Score a dispatch result (1-5) to feed back into routing confidence.
 * Stores outcome_score + outcome_note on the bridge_dispatch_log row, then
 * triggers an async confidence cache refresh so the routing engine adapts.
 *
 * Phase 41, Plan 03
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/client.js';
import { refreshConfidence } from '../../services/bridge/routing-confidence.js';

export async function dispatchOutcomeRoutes(app: FastifyInstance) {
  // SIN-03: Score a dispatch outcome
  app.post<{
    Params: { id: string };
    Body: { score: number; note?: string };
  }>('/dispatches/:id/outcome', async (req, reply) => {
    const { id } = req.params;
    const { score, note } = req.body ?? {};

    // Validate score: must be an integer from 1 to 5
    if (score == null || score < 1 || score > 5 || !Number.isInteger(score)) {
      return reply.status(400).send({
        error: 'invalid_score',
        message: 'Score must be an integer from 1 to 5',
      });
    }

    // Verify dispatch exists
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM bridge_dispatch_log WHERE id = $1',
      [id],
    );
    if (rows.length === 0) {
      return reply.status(404).send({
        error: 'dispatch_not_found',
        message: `Dispatch ${id} not found`,
      });
    }

    // Persist outcome
    await pool.query(
      `UPDATE bridge_dispatch_log
       SET outcome_score = $1, outcome_note = $2
       WHERE id = $3`,
      [score, note ?? null, id],
    );

    // Trigger async confidence refresh — fire-and-forget, never blocks response
    refreshConfidence().catch(() => {});

    return reply.send({ ok: true, dispatch_id: id, score, note: note ?? null });
  });
}
