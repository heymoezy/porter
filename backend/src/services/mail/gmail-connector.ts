/**
 * Gmail connector — optional external import path for Gmail mailboxes.
 *
 * Gmail is NOT the primary mail runtime (Stalwart is). This connector allows
 * users to import messages from an existing Gmail account into Porter's
 * hosted mail system via the existing OAuth2 tokens stored in workspace_connections.
 *
 * The actual Gmail API import will be implemented when needed. For now, this
 * module provides the connector config lookup, health check, and stub import/sync.
 */

import { pool } from '../../db/client.js';
import { decryptCredential } from '../../lib/credential-crypto.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface GmailConnectorConfig {
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt?: number;
}

export interface GmailImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

export interface GmailSyncResult {
  synced: number;
}

export interface GmailHealthResult {
  connected: boolean;
  email?: string;
  error?: string;
}

// ── Connector lookup ─────────────────────────────────────────────────────

/**
 * Check if a Gmail connector is configured by querying workspace_connections
 * for a provider='email' entry with status='connected'.
 * Returns the decrypted config, or null if no Gmail connection exists.
 */
export async function getGmailConnector(): Promise<GmailConnectorConfig | null> {
  const { rows } = await pool.query<{ id: string; meta_json: string }>(
    `SELECT id, meta_json FROM workspace_connections
     WHERE provider = 'email' AND status = 'connected' LIMIT 1`,
  );

  if (rows.length === 0) return null;

  try {
    const plaintext = decryptCredential(rows[0].meta_json);
    const meta = JSON.parse(plaintext) as {
      access_token?: string;
      refresh_token?: string;
      email?: string;
      expires_at?: number;
    };

    if (!meta.access_token || !meta.email) return null;

    return {
      connectionId: rows[0].id,
      accessToken: meta.access_token,
      refreshToken: meta.refresh_token ?? '',
      email: meta.email,
      expiresAt: meta.expires_at,
    };
  } catch {
    // Decrypt or parse failure — treat as not connected
    return null;
  }
}

// ── Import ───────────────────────────────────────────────────────────────

/**
 * Import messages from Gmail into Porter's mail system.
 *
 * Stub implementation — verifies the connector config is valid and returns
 * zero stats. The actual Gmail API calls (messages.list + messages.get) will
 * be wired in when token refresh is confirmed working.
 *
 * Future flow:
 *  1. Use Gmail API via the existing OAuth tokens to list messages
 *  2. For each message, convert to InboundEmailPayload
 *  3. Call processInboundEmail() — dedup handles messages already imported
 *  4. Return stats
 */
export async function importFromGmail(opts: {
  connector: GmailConnectorConfig;
  mailboxId: string;
  since?: number;
  maxResults?: number;
}): Promise<GmailImportResult> {
  // Validate connector config has minimum required fields
  if (!opts.connector.accessToken || !opts.connector.email) {
    return { imported: 0, skipped: 0, errors: 1 };
  }

  console.log(
    '[gmail-connector] Import requested for %s into mailbox %s (since=%s, max=%d) — stub, no messages fetched',
    opts.connector.email,
    opts.mailboxId,
    opts.since ? new Date(opts.since * 1000).toISOString() : 'all',
    opts.maxResults ?? 100,
  );

  return { imported: 0, skipped: 0, errors: 0 };
}

// ── Sync ─────────────────────────────────────────────────────────────────

/**
 * Sync recent Gmail messages (for ongoing connector mode).
 * Similar to import but only gets new messages since last sync.
 *
 * Stub — returns zero.
 */
export async function syncGmailRecent(opts: {
  connector: GmailConnectorConfig;
  mailboxId: string;
}): Promise<GmailSyncResult> {
  console.log(
    '[gmail-connector] Sync requested for %s into mailbox %s — stub, no messages synced',
    opts.connector.email,
    opts.mailboxId,
  );

  return { synced: 0 };
}

// ── Health check ─────────────────────────────────────────────────────────

/**
 * Check if a Gmail connector is configured and appears healthy.
 * Does not make external API calls — just verifies config presence.
 */
export async function checkGmailHealth(): Promise<GmailHealthResult> {
  const connector = await getGmailConnector();
  if (!connector) {
    return { connected: false };
  }

  // Check token expiry if available
  if (connector.expiresAt && connector.expiresAt < Date.now()) {
    return {
      connected: false,
      email: connector.email,
      error: 'Token expired — re-authenticate via Google OAuth',
    };
  }

  return { connected: true, email: connector.email };
}
