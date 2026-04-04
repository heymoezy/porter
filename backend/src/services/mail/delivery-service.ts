/**
 * Delivery service — tracks per-recipient delivery attempts for outbound mail.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface DeliveryRow {
  id: string;
  message_id: string;
  recipient: string;
  attempt: number;
  status: string;
  smtp_response: string | null;
  remote_mx: string | null;
  queued_at: number | null;
  completed_at: number | null;
  created_at: number | null;
}

// ── Create Delivery ─────────────────────────────────────────────────────

export async function createDelivery(opts: {
  messageId: string;
  recipient: string;
  status: string; // 'queued' | 'sent' | 'delivered' | 'deferred' | 'bounced' | 'failed'
  smtpResponse?: string;
  remoteMx?: string;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;

  await pool.query(
    `INSERT INTO mail_deliveries (id, message_id, recipient, status, smtp_response, remote_mx, queued_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [id, opts.messageId, opts.recipient, opts.status, opts.smtpResponse ?? null, opts.remoteMx ?? null, now],
  );

  return { id };
}

// ── Update Status ───────────────────────────────────────────────────────

export async function updateDeliveryStatus(
  deliveryId: string,
  status: string,
  smtpResponse?: string,
): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE mail_deliveries SET status = $1, smtp_response = COALESCE($2, smtp_response), completed_at = $3 WHERE id = $4`,
    [status, smtpResponse ?? null, now, deliveryId],
  );
}

// ── Query by Message ────────────────────────────────────────────────────

export async function getDeliveriesByMessage(messageId: string): Promise<DeliveryRow[]> {
  const { rows } = await pool.query<DeliveryRow>(
    `SELECT * FROM mail_deliveries WHERE message_id = $1 ORDER BY created_at ASC`,
    [messageId],
  );
  return rows;
}

// ── Recent Deliveries (admin diagnostics) ───────────────────────────────

export async function getRecentDeliveries(opts?: {
  status?: string;
  limit?: number;
}): Promise<DeliveryRow[]> {
  const limit = opts?.limit ?? 50;

  if (opts?.status) {
    const { rows } = await pool.query<DeliveryRow>(
      `SELECT * FROM mail_deliveries WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
      [opts.status, limit],
    );
    return rows;
  }

  const { rows } = await pool.query<DeliveryRow>(
    `SELECT * FROM mail_deliveries ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
