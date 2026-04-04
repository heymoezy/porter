/**
 * Mail learning service — audit trail for all learning decisions.
 * Records when messages are summarized, embedded, promoted to memory,
 * ignored, or trigger unsubscribes.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';

// ── Types ────────────────────────────────────────────────────────────────

interface LearningEventRow {
  id: string;
  message_id: string;
  agent_id: string | null;
  skill_id: string | null;
  event_type: string;
  payload_json: unknown;
  created_at: number | null;
}

// ── Log Learning Event ──────────────────────────────────────────────────

export async function logLearningEvent(opts: {
  messageId: string;
  agentId?: string;
  skillId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;
  await pool.query(
    `INSERT INTO mail_learning_events (id, message_id, agent_id, skill_id, event_type, payload_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      id,
      opts.messageId,
      opts.agentId ?? null,
      opts.skillId ?? null,
      opts.eventType,
      JSON.stringify(opts.payload ?? {}),
      now,
    ],
  );
  return { id };
}

// ── Query Learning Events ───────────────────────────────────────────────

export async function getLearningEvents(opts?: {
  agentId?: string;
  messageId?: string;
  eventType?: string;
  limit?: number;
}): Promise<LearningEventRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts?.agentId) {
    conditions.push(`agent_id = $${idx++}`);
    params.push(opts.agentId);
  }
  if (opts?.messageId) {
    conditions.push(`message_id = $${idx++}`);
    params.push(opts.messageId);
  }
  if (opts?.eventType) {
    conditions.push(`event_type = $${idx++}`);
    params.push(opts.eventType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts?.limit ?? 100;
  params.push(limit);

  const { rows } = await pool.query<LearningEventRow>(
    `SELECT * FROM mail_learning_events ${where} ORDER BY created_at DESC LIMIT $${idx}`,
    params,
  );
  return rows;
}
