/**
 * Message service — create, query, and manage individual mail messages.
 * Uses thread-service for automatic thread resolution.
 */

import crypto from 'node:crypto';
import { pool } from '../../db/client.js';
import { resolveThread } from './thread-service.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  mailbox_id: string;
  thread_id: string | null;
  provider_message_id: string | null;
  internet_message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  direction: string;
  folder: string;
  status: string;
  from_address: string;
  from_name: string;
  to_addresses_json: unknown;
  cc_addresses_json: unknown;
  bcc_addresses_json: unknown;
  reply_to_addresses_json: unknown;
  subject: string;
  snippet: string;
  text_body: string;
  html_body: string;
  headers_json: unknown;
  attachments_json: unknown;
  provider_raw_ref: string | null;
  received_at: number | null;
  sent_at: number | null;
  read_at: number | null;
  created_at: number | null;
  updated_at: number | null;
}

// ── Create Message ───────────────────────────────────────────────────────

export async function createMessage(opts: {
  mailboxId: string;
  direction: 'inbound' | 'outbound';
  folder: string;
  status: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  replyToAddresses?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  internetMessageId?: string;
  inReplyTo?: string;
  referencesHeader?: string;
  providerMessageId?: string;
  headers?: Record<string, unknown>;
  attachments?: unknown[];
  receivedAt?: number;
  sentAt?: number;
}): Promise<{ id: string; threadId: string }> {
  // 1. Resolve thread
  const { threadId } = await resolveThread({
    mailboxId: opts.mailboxId,
    internetMessageId: opts.internetMessageId,
    inReplyTo: opts.inReplyTo,
    referencesHeader: opts.referencesHeader,
    subject: opts.subject,
    fromAddress: opts.fromAddress,
    direction: opts.direction,
  });

  // 2. Generate id + snippet
  const id = crypto.randomUUID();
  const snippet = opts.textBody.substring(0, 200).trim();
  const now = Date.now() / 1000;

  // 3. Insert
  await pool.query(
    `INSERT INTO mail_messages (
       id, mailbox_id, thread_id, direction, folder, status,
       from_address, from_name,
       to_addresses_json, cc_addresses_json, bcc_addresses_json, reply_to_addresses_json,
       subject, snippet, text_body, html_body,
       internet_message_id, in_reply_to, references_header,
       provider_message_id, headers_json, attachments_json,
       received_at, sent_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8,
       $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
       $13, $14, $15, $16,
       $17, $18, $19,
       $20, $21::jsonb, $22::jsonb,
       $23, $24, $25, $25
     )`,
    [
      id,                                                        // $1
      opts.mailboxId,                                            // $2
      threadId,                                                  // $3
      opts.direction,                                            // $4
      opts.folder,                                               // $5
      opts.status,                                               // $6
      opts.fromAddress,                                          // $7
      opts.fromName ?? '',                                       // $8
      JSON.stringify(opts.toAddresses),                          // $9
      JSON.stringify(opts.ccAddresses ?? []),                    // $10
      JSON.stringify(opts.bccAddresses ?? []),                   // $11
      JSON.stringify(opts.replyToAddresses ?? []),               // $12
      opts.subject,                                              // $13
      snippet,                                                   // $14
      opts.textBody,                                             // $15
      opts.htmlBody ?? '',                                       // $16
      opts.internetMessageId ?? null,                            // $17
      opts.inReplyTo ?? null,                                    // $18
      opts.referencesHeader ?? null,                             // $19
      opts.providerMessageId ?? null,                            // $20
      JSON.stringify(opts.headers ?? {}),                        // $21
      JSON.stringify(opts.attachments ?? []),                    // $22
      opts.receivedAt ?? null,                                   // $23
      opts.sentAt ?? null,                                       // $24
      now,                                                       // $25
    ],
  );

  return { id, threadId };
}

// ── Queries ──────────────────────────────────────────────────────────────

export async function getMessagesByThread(threadId: string): Promise<MessageRow[]> {
  const { rows } = await pool.query<MessageRow>(
    `SELECT * FROM mail_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  return rows;
}

export async function getMessageById(messageId: string): Promise<MessageRow | null> {
  const { rows } = await pool.query<MessageRow>(
    `SELECT * FROM mail_messages WHERE id = $1`,
    [messageId],
  );
  return rows[0] ?? null;
}

// ── Mutations ────────────────────────────────────────────────────────────

export async function updateMessageFolder(messageId: string, folder: string): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE mail_messages SET folder = $1, updated_at = $2 WHERE id = $3`,
    [folder, now, messageId],
  );
}

export async function deleteMessagePermanently(messageId: string): Promise<void> {
  await pool.query(`DELETE FROM mail_deliveries WHERE message_id = $1`, [messageId]);
  await pool.query(`DELETE FROM mail_messages WHERE id = $1`, [messageId]);
}

export async function markMessageRead(messageId: string): Promise<void> {
  const now = Date.now() / 1000;
  await pool.query(
    `UPDATE mail_messages SET read_at = $1, updated_at = $1 WHERE id = $2`,
    [now, messageId],
  );
}

// ── Folder Counts ────────────────────────────────────────────────────────

export async function getMailboxFolderCounts(
  mailboxId: string,
): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ folder: string; count: string }>(
    `SELECT folder, COUNT(*) AS count FROM mail_messages WHERE mailbox_id = $1 GROUP BY folder`,
    [mailboxId],
  );

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.folder] = parseInt(row.count, 10);
  }
  return counts;
}
