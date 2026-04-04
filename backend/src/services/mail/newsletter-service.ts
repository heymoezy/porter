/**
 * Newsletter service — detection, source CRUD, subscriptions, and digest generation.
 * Identifies newsletter senders from inbound email, manages trust levels,
 * and produces periodic digest summaries for agent consumption.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';

// ── Newsletter Detection Heuristics ─────────────────────────────────────

const NEWSLETTER_FROM_PATTERNS = [
  'newsletter', 'digest', 'updates', 'noreply', 'no-reply', 'mailer', 'news@', 'bulletin',
];

export function isLikelyNewsletter(opts: {
  fromAddress: string;
  headers?: Record<string, unknown>;
  subject?: string;
}): boolean {
  const { fromAddress, headers } = opts;
  const from = fromAddress.toLowerCase();

  // 1. List-Unsubscribe header present
  if (headers?.['list-unsubscribe'] || headers?.['List-Unsubscribe']) return true;

  // 2. Precedence: bulk or list
  const precedence = String(headers?.['precedence'] ?? headers?.['Precedence'] ?? '').toLowerCase();
  if (precedence === 'bulk' || precedence === 'list') return true;

  // 3. From address contains newsletter-like keywords
  if (NEWSLETTER_FROM_PATTERNS.some(p => from.includes(p))) return true;

  // 4. X-Mailer or X-Campaign headers present
  if (headers?.['x-mailer'] || headers?.['X-Mailer']) return true;
  if (headers?.['x-campaign'] || headers?.['X-Campaign'] || headers?.['x-campaign-id'] || headers?.['X-Campaign-Id']) return true;

  return false;
}

// ── Source CRUD ──────────────────────────────────────────────────────────

interface SourceRow {
  id: string;
  mailbox_id: string | null;
  source_type: string;
  source_key: string;
  sender_pattern: string | null;
  display_name: string;
  trust_level: string;
  topic_tags_json: unknown;
  metadata_json: unknown;
  active: number;
  created_at: number | null;
  updated_at: number | null;
}

export async function createSource(opts: {
  mailboxId?: string;
  sourceType: string;
  sourceKey: string;
  senderPattern?: string;
  displayName: string;
  trustLevel?: string;
  topicTags?: string[];
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;
  await pool.query(
    `INSERT INTO newsletter_sources
       (id, mailbox_id, source_type, source_key, sender_pattern, display_name, trust_level, topic_tags_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)`,
    [
      id,
      opts.mailboxId ?? null,
      opts.sourceType,
      opts.sourceKey,
      opts.senderPattern ?? null,
      opts.displayName,
      opts.trustLevel ?? 'review',
      JSON.stringify(opts.topicTags ?? []),
      now,
    ],
  );
  return { id };
}

export async function listSources(opts?: { mailboxId?: string; active?: boolean }): Promise<SourceRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts?.mailboxId) {
    conditions.push(`mailbox_id = $${idx++}`);
    params.push(opts.mailboxId);
  }
  if (opts?.active !== undefined) {
    conditions.push(`active = $${idx++}`);
    params.push(opts.active ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<SourceRow>(
    `SELECT * FROM newsletter_sources ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows;
}

export async function getSourceById(id: string): Promise<SourceRow | null> {
  const { rows } = await pool.query<SourceRow>(
    `SELECT * FROM newsletter_sources WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateSource(id: string, updates: Partial<{
  displayName: string;
  trustLevel: string;
  topicTags: string[];
  active: boolean;
}>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.displayName !== undefined) {
    sets.push(`display_name = $${idx++}`);
    params.push(updates.displayName);
  }
  if (updates.trustLevel !== undefined) {
    sets.push(`trust_level = $${idx++}`);
    params.push(updates.trustLevel);
  }
  if (updates.topicTags !== undefined) {
    sets.push(`topic_tags_json = $${idx++}::jsonb`);
    params.push(JSON.stringify(updates.topicTags));
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${idx++}`);
    params.push(updates.active ? 1 : 0);
  }

  if (sets.length === 0) return;

  sets.push(`updated_at = $${idx++}`);
  params.push(Date.now() / 1000);
  params.push(id);

  await pool.query(
    `UPDATE newsletter_sources SET ${sets.join(', ')} WHERE id = $${idx}`,
    params,
  );
}

export async function deleteSource(id: string): Promise<void> {
  await pool.query(`DELETE FROM newsletter_sources WHERE id = $1`, [id]);
}

// ── Auto-Detect Source from Inbound ─────────────────────────────────────

export async function detectOrCreateSource(opts: {
  mailboxId: string;
  fromAddress: string;
  fromName: string;
  headers?: Record<string, unknown>;
}): Promise<{ sourceId: string; isNew: boolean; trustLevel: string }> {
  const fromLower = opts.fromAddress.toLowerCase().trim();

  // 1. Check exact source_key match
  const { rows: exact } = await pool.query<SourceRow>(
    `SELECT * FROM newsletter_sources WHERE LOWER(source_key) = $1 LIMIT 1`,
    [fromLower],
  );
  if (exact.length > 0) {
    return { sourceId: exact[0].id, isNew: false, trustLevel: exact[0].trust_level };
  }

  // 2. Check sender_pattern match (LIKE patterns stored in DB)
  const { rows: pattern } = await pool.query<SourceRow>(
    `SELECT * FROM newsletter_sources WHERE sender_pattern IS NOT NULL AND $1 LIKE sender_pattern LIMIT 1`,
    [fromLower],
  );
  if (pattern.length > 0) {
    return { sourceId: pattern[0].id, isNew: false, trustLevel: pattern[0].trust_level };
  }

  // 3. Create new source with trust_level='review'
  const displayName = opts.fromName || fromLower.split('@')[0];
  const { id } = await createSource({
    mailboxId: opts.mailboxId,
    sourceType: 'email',
    sourceKey: fromLower,
    displayName,
    trustLevel: 'review',
  });

  return { sourceId: id, isNew: true, trustLevel: 'review' };
}

// ── Subscription CRUD ───────────────────────────────────────────────────

interface SubscriptionRow {
  id: string;
  agent_id: string;
  mailbox_id: string;
  source_id: string;
  status: string;
  delivery_mode: string;
  last_received_at: number | null;
  last_processed_at: number | null;
  created_at: number | null;
  updated_at: number | null;
}

interface SubscriptionWithSource extends SubscriptionRow {
  source_type: string;
  source_key: string;
  display_name: string;
  trust_level: string;
  topic_tags_json: unknown;
  source_active: number;
}

export async function subscribe(opts: {
  agentId: string;
  mailboxId: string;
  sourceId: string;
  deliveryMode?: string;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now() / 1000;
  await pool.query(
    `INSERT INTO newsletter_subscriptions
       (id, agent_id, mailbox_id, source_id, status, delivery_mode, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)`,
    [
      id,
      opts.agentId,
      opts.mailboxId,
      opts.sourceId,
      opts.deliveryMode ?? 'digest',
      now,
    ],
  );
  return { id };
}

export async function unsubscribe(subscriptionId: string): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE newsletter_subscriptions SET status = 'cancelled', updated_at = $1 WHERE id = $2`,
    [now, subscriptionId],
  );
}

export async function getAgentSubscriptions(agentId: string): Promise<SubscriptionWithSource[]> {
  const { rows } = await pool.query<SubscriptionWithSource>(
    `SELECT
       ns_sub.id, ns_sub.agent_id, ns_sub.mailbox_id, ns_sub.source_id,
       ns_sub.status, ns_sub.delivery_mode,
       ns_sub.last_received_at, ns_sub.last_processed_at,
       ns_sub.created_at, ns_sub.updated_at,
       ns_src.source_type, ns_src.source_key, ns_src.display_name,
       ns_src.trust_level, ns_src.topic_tags_json,
       ns_src.active AS source_active
     FROM newsletter_subscriptions ns_sub
     JOIN newsletter_sources ns_src ON ns_src.id = ns_sub.source_id
     WHERE ns_sub.agent_id = $1
     ORDER BY ns_sub.created_at DESC`,
    [agentId],
  );
  return rows;
}

export async function listSubscriptions(opts?: {
  sourceId?: string;
  agentId?: string;
  status?: string;
}): Promise<SubscriptionRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts?.sourceId) {
    conditions.push(`source_id = $${idx++}`);
    params.push(opts.sourceId);
  }
  if (opts?.agentId) {
    conditions.push(`agent_id = $${idx++}`);
    params.push(opts.agentId);
  }
  if (opts?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(opts.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT * FROM newsletter_subscriptions ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows;
}

// ── Digest Generation ───────────────────────────────────────────────────

export async function generateDigest(opts: {
  agentId: string;
  mailboxId: string;
  sourceId: string;
  since: number;
}): Promise<{ digestId: string; messageCount: number; summary: string } | null> {
  // 1. Look up the source to get sender info
  const source = await getSourceById(opts.sourceId);
  if (!source) return null;

  // 2. Fetch unprocessed messages from this source's sender since the given time
  const fromKey = source.source_key.toLowerCase();
  const { rows: messages } = await pool.query<{
    id: string;
    subject: string;
    snippet: string;
    received_at: number | null;
  }>(
    `SELECT id, subject, snippet, received_at
     FROM mail_messages
     WHERE mailbox_id = $1
       AND LOWER(from_address) = $2
       AND created_at > $3
     ORDER BY created_at ASC`,
    [opts.mailboxId, fromKey, opts.since],
  );

  if (messages.length === 0) return null;

  // 3. Build digest text
  const lines = messages.map((m, i) =>
    `${i + 1}. [${m.subject}] — ${m.snippet || '(no preview)'}`,
  );
  const summary = `Digest: ${messages.length} message(s) from ${source.display_name}\n\n${lines.join('\n')}`;

  // 4. Create a learning event
  const digestId = crypto.randomUUID();
  const now = Date.now() / 1000;
  await pool.query(
    `INSERT INTO mail_learning_events (id, message_id, agent_id, event_type, payload_json, created_at)
     VALUES ($1, $2, $3, 'summarized', $4::jsonb, $5)`,
    [
      digestId,
      messages[0].id,  // reference first message
      opts.agentId,
      JSON.stringify({
        source_id: opts.sourceId,
        message_count: messages.length,
        message_ids: messages.map(m => m.id),
        summary,
      }),
      now,
    ],
  );

  // 5. Update subscription last_processed_at
  await pool.query(
    `UPDATE newsletter_subscriptions
     SET last_processed_at = $1, updated_at = $1
     WHERE agent_id = $2 AND source_id = $3 AND status = 'active'`,
    [now, opts.agentId, opts.sourceId],
  );

  return { digestId, messageCount: messages.length, summary };
}

// ── Digest Scheduler Hook ───────────────────────────────────────────────

export async function runDigestCycle(): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  // Find all active digest subscriptions
  const { rows: subs } = await pool.query<SubscriptionRow>(
    `SELECT * FROM newsletter_subscriptions WHERE status = 'active' AND delivery_mode = 'digest'`,
  );

  for (const sub of subs) {
    const since = sub.last_processed_at ?? sub.created_at ?? 0;
    try {
      const result = await generateDigest({
        agentId: sub.agent_id,
        mailboxId: sub.mailbox_id,
        sourceId: sub.source_id,
        since,
      });
      if (result) {
        processed++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error('[newsletter] digest generation error for sub %s:', sub.id, e);
      skipped++;
    }
  }

  return { processed, skipped };
}
