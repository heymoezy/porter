import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { v4 as uuidv4 } from 'uuid';

// Valid feedback event types
const VALID_EVENT_TYPES = ['positive', 'negative', 'correction', 'retry', 'abandon', 'success'] as const;
type FeedbackEventType = (typeof VALID_EVENT_TYPES)[number];

export default async function feedbackV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // POST /api/v1/feedback/:dispatchId
  // Body: { event_type: 'positive' | 'negative' | ..., note?: string }
  // Auth: requireAuth
  fastify.post<{ Params: { dispatchId: string }; Body: { event_type: string; note?: string } }>(
    '/:dispatchId',
    { preHandler: [fastify.requireAuth] },
    async (request, reply) => {
      const { dispatchId } = request.params;
      const body = request.body as { event_type?: string; note?: string } | null;

      const eventType = body?.event_type?.trim() as FeedbackEventType | undefined;
      const note = body?.note?.trim() || null;

      // Validate event_type
      if (!eventType || !(VALID_EVENT_TYPES as readonly string[]).includes(eventType)) {
        return reply
          .code(400)
          .send(err('INVALID_INPUT', `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`));
      }

      // Look up the dispatch in bridge_dispatch_log
      let dispatchRow: { agent_id: string | null; skills_used: unknown } | undefined;
      try {
        const result = await pool.query(
          `SELECT agent_id, skills_used FROM bridge_dispatch_log WHERE id = $1 LIMIT 1`,
          [dispatchId]
        );
        dispatchRow = result.rows[0] as typeof dispatchRow;
      } catch (e: any) {
        return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to query dispatch log'));
      }

      if (!dispatchRow || !dispatchRow.agent_id) {
        return reply.code(404).send(err('NOT_FOUND', 'Dispatch not found'));
      }

      const personaId = dispatchRow.agent_id;

      // Parse selected skills from skills_used JSONB
      let selectedSkills: Array<{ skillId: string; name: string }> = [];
      try {
        const skillsUsed =
          typeof dispatchRow.skills_used === 'string'
            ? JSON.parse(dispatchRow.skills_used)
            : dispatchRow.skills_used;

        if (skillsUsed?.selected && Array.isArray(skillsUsed.selected)) {
          selectedSkills = skillsUsed.selected
            .filter((s: unknown): s is { skillId: string; name: string } =>
              typeof s === 'object' && s !== null && 'skillId' in s
            )
            .map((s: { skillId: string; name: string }) => ({
              skillId: s.skillId,
              name: s.name ?? s.skillId,
            }));
        }
      } catch {
        // Malformed skills_used — treat as no skills
      }

      // No selected skills — acknowledge gracefully
      if (selectedSkills.length === 0) {
        return reply.send(ok({ created: 0 }));
      }

      const skillIds = selectedSkills.map((s) => s.skillId);

      try {
        // Insert skill_feedback_events for each selected skill
        for (const skill of selectedSkills) {
          await pool.query(
            `INSERT INTO skill_feedback_events (id, persona_id, skill_id, dispatch_id, event_type, note)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuidv4(), personaId, skill.skillId, dispatchId, eventType, note]
          );
        }

        // Batch-update persona_skills counters + recompute effectiveness_score
        // Uses COALESCE(skill_id, skill_name) for backwards compat with pre-Phase-31 rows
        await pool.query(
          `UPDATE persona_skills
           SET positive_feedback_count = CASE
                 WHEN $3 = 'positive'
                 THEN COALESCE(positive_feedback_count, 0) + 1
                 ELSE COALESCE(positive_feedback_count, 0)
               END,
               negative_feedback_count = CASE
                 WHEN $3 = 'negative'
                 THEN COALESCE(negative_feedback_count, 0) + 1
                 ELSE COALESCE(negative_feedback_count, 0)
               END,
               times_completed = COALESCE(times_completed, 0) + 1,
               effectiveness_score = CASE
                 WHEN (
                       COALESCE(positive_feedback_count, 0) +
                       CASE WHEN $3 = 'positive' THEN 1 ELSE 0 END +
                       COALESCE(negative_feedback_count, 0) +
                       CASE WHEN $3 = 'negative' THEN 1 ELSE 0 END
                      ) > 0
                 THEN (
                       COALESCE(positive_feedback_count, 0) +
                       CASE WHEN $3 = 'positive' THEN 1 ELSE 0 END
                      )::float
                      / (
                         COALESCE(positive_feedback_count, 0) +
                         CASE WHEN $3 = 'positive' THEN 1 ELSE 0 END +
                         COALESCE(negative_feedback_count, 0) +
                         CASE WHEN $3 = 'negative' THEN 1 ELSE 0 END
                        )
                 ELSE NULL
               END
           WHERE persona_id = $1
             AND COALESCE(skill_id, skill_name) = ANY($2)`,
          [personaId, skillIds, eventType]
        );
      } catch (e: any) {
        return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to persist feedback'));
      }

      return reply.send(ok({ created: selectedSkills.length }));
    }
  );
}
