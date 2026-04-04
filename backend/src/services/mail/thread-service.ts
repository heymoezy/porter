/**
 * Thread service — resolves incoming messages to threads and provides
 * thread listing/detail queries.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Strip Re:/Fwd:/FW: prefixes and trim whitespace */
export function canonicalizeSubject(subject: string): string {
  return subject.replace(/^(re|fwd|fw)\s*:\s*/gi, '').trim();
}

// ── Thread Resolution ────────────────────────────────────────────────────

export async function resolveThread(opts: {
  mailboxId: string;
  internetMessageId?: string;
  inReplyTo?: string;
  referencesHeader?: string;
  subject: string;
  fromAddress: string;
  direction: 'inbound' | 'outbound';
}): Promise<{ threadId: string; isNew: boolean }> {
  const now = Date.now() / 1000;

  // 1. Try In-Reply-To header
  if (opts.inReplyTo) {
    const { rows } = await pool.query<{ thread_id: string }>(
      `SELECT thread_id FROM mail_messages WHERE internet_message_id = $1 AND thread_id IS NOT NULL LIMIT 1`,
      [opts.inReplyTo],
    );
    if (rows.length > 0) {
      const threadId = rows[0].thread_id;
      await touchThread(threadId, opts.fromAddress, now);
      return { threadId, isNew: false };
    }
  }

  // 2. Try References header (space-separated message-ids)
  if (opts.referencesHeader) {
    const refs = opts.referencesHeader.split(/\s+/).filter(Boolean);
    if (refs.length > 0) {
      // Build a parameterised ANY query
      const { rows } = await pool.query<{ thread_id: string }>(
        `SELECT thread_id FROM mail_messages WHERE internet_message_id = ANY($1) AND thread_id IS NOT NULL LIMIT 1`,
        [refs],
      );
      if (rows.length > 0) {
        const threadId = rows[0].thread_id;
        await touchThread(threadId, opts.fromAddress, now);
        return { threadId, isNew: false };
      }
    }
  }

  // 3. Fallback: match by canonicalized subject within same mailbox
  const canonical = canonicalizeSubject(opts.subject);
  if (canonical) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM mail_threads WHERE mailbox_id = $1 AND subject_canonical = $2 ORDER BY last_message_at DESC LIMIT 1`,
      [opts.mailboxId, canonical],
    );
    if (rows.length > 0) {
      const threadId = rows[0].id;
      await touchThread(threadId, opts.fromAddress, now);
      return { threadId, isNew: false };
    }
  }

  // 4. Create new thread
  const threadId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO mail_threads (id, mailbox_id, subject_canonical, last_message_at, message_count, participants_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, $5::jsonb, $4, $4)`,
    [threadId, opts.mailboxId, canonical, now, JSON.stringify([opts.fromAddress])],
  );

  return { threadId, isNew: true };
}

/** Bump message_count, last_message_at, and merge participant */
async function touchThread(threadId: string, fromAddress: string, now: number): Promise<void> {
  // Atomically increment count and update timestamp
  await pool.query(
    `UPDATE mail_threads
     SET message_count = message_count + 1,
         last_message_at = $1,
         updated_at = $1,
         participants_json = CASE
           WHEN NOT participants_json @> $2::jsonb THEN participants_json || $2::jsonb
           ELSE participants_json
         END
     WHERE id = $3`,
    [now, JSON.stringify([fromAddress]), threadId],
  );
}

// ── Queries ──────────────────────────────────────────────────────────────

export interface ThreadRow {
  id: string;
  mailbox_id: string;
  provider_thread_id: string | null;
  conversation_id: string | null;
  subject_canonical: string;
  last_message_at: number | null;
  message_count: number;
  participants_json: unknown;
  created_at: number | null;
  updated_at: number | null;
}

export async function getThreadsByMailbox(
  mailboxId: string,
  opts?: { folder?: string; limit?: number; offset?: number },
): Promise<{ threads: ThreadRow[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  if (opts?.folder) {
    // Filter to threads that have at least one message in this folder
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT t.id) AS count
       FROM mail_threads t
       JOIN mail_messages m ON m.thread_id = t.id
       WHERE t.mailbox_id = $1 AND m.folder = $2`,
      [mailboxId, opts.folder],
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const { rows } = await pool.query<ThreadRow>(
      `SELECT DISTINCT ON (t.id) t.*
       FROM mail_threads t
       JOIN mail_messages m ON m.thread_id = t.id
       WHERE t.mailbox_id = $1 AND m.folder = $2
       ORDER BY t.id, t.last_message_at DESC`,
      [mailboxId, opts.folder],
    );

    // Re-sort by last_message_at DESC and apply pagination in JS
    // (DISTINCT ON requires matching ORDER BY first column)
    rows.sort((a, b) => (b.last_message_at ?? 0) - (a.last_message_at ?? 0));
    const paged = rows.slice(offset, offset + limit);

    return { threads: paged, total };
  }

  // No folder filter — simple paginated query
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM mail_threads WHERE mailbox_id = $1`,
    [mailboxId],
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const { rows } = await pool.query<ThreadRow>(
    `SELECT * FROM mail_threads WHERE mailbox_id = $1 ORDER BY last_message_at DESC NULLS LAST LIMIT $2 OFFSET $3`,
    [mailboxId, limit, offset],
  );

  return { threads: rows, total };
}

export async function getThreadById(threadId: string): Promise<ThreadRow | null> {
  const { rows } = await pool.query<ThreadRow>(
    `SELECT * FROM mail_threads WHERE id = $1`,
    [threadId],
  );
  return rows[0] ?? null;
}
