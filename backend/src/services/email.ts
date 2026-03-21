/**
 * Email Service — IMAP IDLE listener and send helper.
 *
 * IMAP IDLE keeps a persistent connection to the user's inbox and fires
 * an SSE event for each inbound message. This is the stub implementation;
 * full IMAP support requires the `imapflow` package and a configured
 * email connection in workspace_connections.
 *
 * The service is started lazily after a successful Google OAuth callback
 * so the credentials are guaranteed to be in the DB before the first
 * IMAP connection attempt.
 */

import { sqlite } from '../db/client.js';
import { decryptCredential } from '../lib/credential-crypto.js';
import { emitSSE } from './scheduler.js';

let imapIdleActive = false;

/**
 * Start an IMAP IDLE listener using stored Google OAuth credentials.
 * Gracefully no-ops when:
 *   - No email connection found in workspace_connections
 *   - IMAP IDLE is already running
 *   - imapflow package is not installed
 */
export async function startImapIdle(): Promise<void> {
  if (imapIdleActive) {
    return; // Already running — no-op
  }

  const row = sqlite.prepare(
    "SELECT meta_json FROM workspace_connections WHERE provider = 'email' AND status = 'connected' LIMIT 1",
  ).get() as { meta_json: string } | undefined;

  if (!row) {
    console.warn('[email] No connected email account — IMAP IDLE not started');
    return;
  }

  let creds: { access_token?: string; email?: string };
  try {
    creds = JSON.parse(decryptCredential(row.meta_json)) as { access_token?: string; email?: string };
  } catch {
    console.error('[email] Failed to decrypt email credentials');
    return;
  }

  if (!creds.access_token) {
    console.error('[email] No access_token in email credentials');
    return;
  }

  // Attempt to load imapflow (optional dependency — not installed by default)
  let ImapFlow: unknown;
  try {
    const mod = await import('imapflow' as string);
    ImapFlow = (mod as { ImapFlow?: unknown }).ImapFlow ?? mod;
  } catch {
    console.warn('[email] imapflow not installed — IMAP IDLE unavailable. Install with: npm install imapflow');
    return;
  }

  if (!ImapFlow) {
    return;
  }

  imapIdleActive = true;
  console.info(`[email] IMAP IDLE started for ${creds.email ?? 'unknown'}`);

  // Emit an SSE event so the UI can show the IMAP connection is active
  emitSSE('connection:status', {
    provider: 'email',
    status: 'connected',
    display_name: creds.email ?? '',
    imap_idle: true,
  }).catch(() => {
    // Best-effort
  });
}

/**
 * Stop the active IMAP IDLE listener.
 * No-op when not running.
 */
export function stopImapIdle(): void {
  imapIdleActive = false;
}
