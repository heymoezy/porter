import { decryptCredential } from '../lib/credential-crypto.js';
import { pool } from '../db/client.js';
import { emitSSE } from './scheduler.js';
import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

interface WorkspaceConnectionRow {
  id: string;
  status: string;
  meta_json: string | null;
  meta_encrypted: number | null;
}

// ── Credential loading ────────────────────────────────────────────────────────

/**
 * Load WhatsApp Cloud API credentials from a connected workspace connection.
 * Reads and decrypts meta_json from workspace_connections WHERE provider='whatsapp'.
 */
async function getWhatsAppCredentials(connectionId?: string): Promise<WhatsAppCredentials> {
  let row: WorkspaceConnectionRow | undefined;

  if (connectionId) {
    row = (await pool.query(`
      SELECT id, status, meta_json, meta_encrypted
      FROM workspace_connections
      WHERE id = $1 AND provider = 'whatsapp' AND status = 'connected'
    `, [connectionId])).rows[0] as WorkspaceConnectionRow | undefined;
  } else {
    row = (await pool.query(`
      SELECT id, status, meta_json, meta_encrypted
      FROM workspace_connections
      WHERE provider = 'whatsapp' AND status = 'connected'
      LIMIT 1
    `)).rows[0] as WorkspaceConnectionRow | undefined;
  }

  if (!row) {
    throw new Error('No connected WhatsApp connection found');
  }

  if (!row.meta_json) {
    throw new Error('WhatsApp connection has no credentials stored');
  }

  let meta: Record<string, unknown>;
  if (row.meta_encrypted === 1) {
    const decrypted = decryptCredential(row.meta_json);
    meta = JSON.parse(decrypted);
  } else {
    meta = JSON.parse(row.meta_json);
  }

  const phoneNumberId = meta.phoneNumberId as string;
  const accessToken = meta.accessToken as string;

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp connection missing phoneNumberId or accessToken in meta_json');
  }

  return { phoneNumberId, accessToken };
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp text message via Meta Cloud API.
 * Prefixes message with agent identity if agentName is provided.
 * NEVER logs the access token.
 */
export async function sendWhatsAppMessage(params: {
  to: string;
  text: string;
  agentName?: string;
  agentEmoji?: string;
  connectionId?: string;
}): Promise<{ messageId: string }> {
  const creds = await getWhatsAppCredentials(params.connectionId);

  const messageText = params.agentName
    ? `${params.agentEmoji ?? '🤖'} ${params.agentName}: ${params.text}`
    : params.text;

  const resp = await fetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: messageText },
    }),
  });

  if (!resp.ok) {
    const statusCode = resp.status;

    if (statusCode === 401) {
      // Mark connection as needing re-auth
      await pool.query(`
        UPDATE workspace_connections
        SET status = 'needs_reauth', updated_at = EXTRACT(EPOCH FROM NOW())
        WHERE provider = 'whatsapp' AND status = 'connected'
      `);

      emitSSE('connection:status', { provider: 'whatsapp', status: 'needs_reauth' }).catch(() => {
        // Best-effort SSE — never block on failure
      });
    }

    throw new Error(`WhatsApp API error ${statusCode}`);
  }

  const result = await resp.json() as { messages: Array<{ id: string }> };
  return { messageId: result.messages[0].id };
}

// ── Route inbound ─────────────────────────────────────────────────────────────

/**
 * Route an inbound WhatsApp message to the appropriate agent via agent_jobs.
 *
 * - @mention routing: dispatches to named agent
 * - No mention: dispatches to Porter (master persona) for AI-based dispatch
 * - Returns the agent_id that was dispatched to, or null if no agent found
 */
export async function routeInboundWhatsApp(
  from: string,
  message: string,
  groupId?: string,
): Promise<string | null> {
  let agentId: string | null = null;

  // Check for @mention routing: regex /@(\w+)/
  const mentionMatch = message.match(/@(\w+)/);
  if (mentionMatch) {
    const mentionedName = mentionMatch[1];
    const agent = (await pool.query(`
      SELECT id FROM personas
      WHERE lower(name) = lower($1) AND status != 'retired'
      LIMIT 1
    `, [mentionedName])).rows[0] as { id: string } | undefined;

    if (agent) {
      agentId = agent.id;
    }
  }

  // Fall back to Porter (master persona) if no @mention or agent not found
  if (!agentId) {
    const porter = (await pool.query(`
      SELECT id FROM personas WHERE is_master = 1 LIMIT 1
    `)).rows[0] as { id: string } | undefined;

    if (!porter) {
      return null;
    }
    agentId = porter.id;
  }

  // Look up project linked to group if groupId provided
  let projectId: string | null = null;
  if (groupId) {
    const groupRow = (await pool.query(`
      SELECT meta_json, meta_encrypted FROM workspace_connections
      WHERE provider = 'whatsapp' AND status = 'connected'
      LIMIT 1
    `)).rows[0] as { meta_json: string | null; meta_encrypted: number | null } | undefined;

    if (groupRow?.meta_json) {
      try {
        let meta: Record<string, unknown>;
        if (groupRow.meta_encrypted === 1) {
          meta = JSON.parse(decryptCredential(groupRow.meta_json));
        } else {
          meta = JSON.parse(groupRow.meta_json);
        }
        const groupMappings = meta.group_mappings as Record<string, string> | undefined;
        if (groupMappings && groupId in groupMappings) {
          projectId = groupMappings[groupId];
        }
      } catch {
        // If decryption or parse fails, proceed without project mapping
      }
    }
  }

  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
    VALUES ($1, $2, $3, 'whatsapp_message', $4, $5, 'pending', EXTRACT(EPOCH FROM NOW()))
  `, [
    id,
    agentId,
    projectId ?? null,
    JSON.stringify({ from, message, group_id: groupId ?? null }),
    message,
  ]);

  return agentId;
}

// ── CRM findOrCreate helpers (Phase 11) ──────────────────────────────────────

/**
 * Find an existing contact by phone number, or create one.
 * Returns the contact ID.
 */
export async function findOrCreateWhatsAppContact(
  phoneNumber: string,
  profileName?: string,
): Promise<string> {
  // Normalize phone: strip leading zeros, ensure starts with +
  const normalized = phoneNumber.startsWith('+')
    ? phoneNumber
    : '+' + phoneNumber.replace(/^0+/, '');

  // Look up by phone value in contact_phones
  const existing = (await pool.query(
    `SELECT cp.contact_id FROM contact_phones cp WHERE cp.value = $1`,
    [normalized]
  )).rows[0] as { contact_id: string } | undefined;

  if (existing) return existing.contact_id;

  // Create new contact
  const contactId = crypto.randomUUID();
  const displayName = profileName || normalized;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO contacts (id, display_name, created_by, created_at, updated_at)
       VALUES ($1, $2, 'system', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))`,
      [contactId, displayName]
    );
    await client.query(
      `INSERT INTO contact_phones (contact_id, value, label, is_primary)
       VALUES ($1, $2, 'mobile', 1)`,
      [contactId, normalized]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return contactId;
}

/**
 * Find an existing conversation by WhatsApp external_id, or create one.
 * Links the conversation to the contact.
 * Returns the conversation ID.
 */
export async function findOrCreateWhatsAppConversation(
  externalId: string,
  contactId: string,
): Promise<string> {
  // Use INSERT ... ON CONFLICT DO NOTHING + SELECT pattern to handle race conditions
  // (two concurrent messages from same sender)
  const existing = (await pool.query(
    `SELECT id FROM conversations WHERE external_id = $1`,
    [externalId]
  )).rows[0] as { id: string } | undefined;

  if (existing) {
    // Ensure contact link exists
    await pool.query(
      `INSERT INTO contact_conversations (contact_id, conversation_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, existing.id]
    );
    return existing.id;
  }

  const convId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO conversations
         (id, scope_type, scope_id, external_id, channel_type, created_at, updated_at)
       VALUES ($1, 'contact', $2, $3, 'whatsapp', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT DO NOTHING`,
      [convId, contactId, externalId]
    );
    // Link contact to conversation
    await client.query(
      `INSERT INTO contact_conversations (contact_id, conversation_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [contactId, convId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Handle race: if INSERT was a no-op, another request created it first
  const check = (await pool.query(
    `SELECT id FROM conversations WHERE external_id = $1`,
    [externalId]
  )).rows[0] as { id: string };

  return check.id;
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify Meta webhook X-Hub-Signature-256 header.
 * Throws if WHATSAPP_APP_SECRET is not configured.
 * Returns true if signature matches, false otherwise.
 */
export function verifyWebhookSignature(signature: string, body: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    throw new Error('WHATSAPP_APP_SECRET env var is required for webhook signature verification');
  }

  const expected = crypto.createHmac('sha256', appSecret).update(body).digest('hex');
  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received, 'hex'),
  );
}
