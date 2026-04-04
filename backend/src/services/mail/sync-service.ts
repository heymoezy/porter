/**
 * Sync service — manual mailbox synchronization for when webhooks aren't available
 * or for initial import of existing messages.
 */

import { pool } from '../../db/client.js';
import { getProvider } from './provider-factory.js';
import { getMailboxById } from './mailbox-service.js';

// ── Sync Mailbox ─────────────────────────────────────────────────────────

export async function syncMailbox(mailboxId: string): Promise<{
  newMessages: number;
  errors: number;
}> {
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${mailboxId}`);
  }

  const provider = getProvider();
  if (!provider) {
    // No provider configured — nothing to sync, just update timestamp
    const now = Math.floor(Date.now() / 1000);
    await pool.query(
      `UPDATE mailboxes SET last_sync_at = $1, updated_at = $1 WHERE id = $2`,
      [now, mailboxId],
    );
    return { newMessages: 0, errors: 0 };
  }

  // Future: call provider.syncMailbox() to pull new messages via IMAP/JMAP
  // For each new message, call processInboundEmail()
  // For now (no Stalwart IMAP sync implemented), update timestamp and return zeros
  const now = Math.floor(Date.now() / 1000);
  await pool.query(
    `UPDATE mailboxes SET last_sync_at = $1, updated_at = $1 WHERE id = $2`,
    [now, mailboxId],
  );

  return { newMessages: 0, errors: 0 };
}
