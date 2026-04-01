/**
 * msg-bus.ts — Message Bus Event Service
 *
 * Provides structured audit logging for inter-gateway message envelopes.
 * Phase 29: msg_bus_events is the canonical audit table Phase 30 intelligence
 * loop reads to detect cross-model handoff patterns.
 *
 * Two functions only: logMsgBusEvent (before dispatch) + updateMsgBusEvent (after).
 */

import crypto from 'node:crypto';
import { pool } from '../db/client.js';

// ── Init / Update types ───────────────────────────────────────────────────────

export interface MsgBusEventInit {
  correlationId?: string;
  sourceAgent?: string;
  sourceGateway?: string;
  targetAgent?: string;
  targetGateway?: string;
  intent: string;
  payload: Record<string, unknown>;
  hopCount: number;
}

export interface MsgBusEventUpdate {
  status: 'delivered' | 'failed';
  dispatchLogId?: string;
  latencyMs?: number;
  responsePayload?: Record<string, unknown>;
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Insert a new msg_bus_events row before dispatch.
 * Returns the generated UUID so the caller can backfill after dispatch.
 *
 * Non-blocking contract: the caller wraps in try/catch and never blocks dispatch.
 * This function itself does NOT swallow errors — the caller decides.
 */
export async function logMsgBusEvent(init: MsgBusEventInit): Promise<string> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO msg_bus_events
       (id, correlation_id, source_agent, source_gateway, target_agent, target_gateway,
        intent, payload, hop_count, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', EXTRACT(EPOCH FROM NOW()))`,
    [
      id,
      init.correlationId ?? null,
      init.sourceAgent ?? null,
      init.sourceGateway ?? null,
      init.targetAgent ?? null,
      init.targetGateway ?? null,
      init.intent,
      JSON.stringify(init.payload),
      init.hopCount,
    ],
  );

  return id;
}

/**
 * Update an existing msg_bus_events row after dispatch completes (or fails).
 * Backfills dispatch_log_id, latency, response payload, and final status.
 *
 * Non-blocking contract: caller wraps in .catch(() => {}) — never awaited on the
 * hot path, but the function itself is not fire-and-forget internally.
 */
export async function updateMsgBusEvent(id: string, update: MsgBusEventUpdate): Promise<void> {
  await pool.query(
    `UPDATE msg_bus_events
     SET status           = $2,
         dispatch_log_id  = COALESCE($3, dispatch_log_id),
         latency_ms       = COALESCE($4, latency_ms),
         response_payload = COALESCE($5, response_payload),
         delivered_at     = CASE WHEN $2 = 'delivered' THEN EXTRACT(EPOCH FROM NOW()) ELSE delivered_at END
     WHERE id = $1`,
    [
      id,
      update.status,
      update.dispatchLogId ?? null,
      update.latencyMs ?? null,
      update.responsePayload ? JSON.stringify(update.responsePayload) : null,
    ],
  );
}
