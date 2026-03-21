import { decryptCredential } from '../lib/credential-crypto.js';
import { sqlite } from '../db/client.js';
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
function getWhatsAppCredentials(connectionId?: string): WhatsAppCredentials {
  let row: WorkspaceConnectionRow | undefined;

  if (connectionId) {
    row = sqlite.prepare(`
      SELECT id, status, meta_json, meta_encrypted
      FROM workspace_connections
      WHERE id = @connectionId AND provider = 'whatsapp' AND status = 'connected'
    `).get({ connectionId }) as WorkspaceConnectionRow | undefined;
  } else {
    row = sqlite.prepare(`
      SELECT id, status, meta_json, meta_encrypted
      FROM workspace_connections
      WHERE provider = 'whatsapp' AND status = 'connected'
      LIMIT 1
    `).get() as WorkspaceConnectionRow | undefined;
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
  const creds = getWhatsAppCredentials(params.connectionId);

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
      sqlite.prepare(`
        UPDATE workspace_connections
        SET status = 'needs_reauth', updated_at = unixepoch('now')
        WHERE provider = 'whatsapp' AND status = 'connected'
      `).run();

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
export function routeInboundWhatsApp(
  from: string,
  message: string,
  groupId?: string,
): string | null {
  let agentId: string | null = null;

  // Check for @mention routing: regex /@(\w+)/
  const mentionMatch = message.match(/@(\w+)/);
  if (mentionMatch) {
    const mentionedName = mentionMatch[1];
    const agent = sqlite.prepare(`
      SELECT id FROM personas
      WHERE lower(name) = lower(@name) AND status != 'retired'
      LIMIT 1
    `).get({ name: mentionedName }) as { id: string } | undefined;

    if (agent) {
      agentId = agent.id;
    }
  }

  // Fall back to Porter (master persona) if no @mention or agent not found
  if (!agentId) {
    const porter = sqlite.prepare(`
      SELECT id FROM personas WHERE is_master = 1 LIMIT 1
    `).get() as { id: string } | undefined;

    if (!porter) {
      return null;
    }
    agentId = porter.id;
  }

  // Look up project linked to group if groupId provided
  let projectId: string | null = null;
  if (groupId) {
    const groupRow = sqlite.prepare(`
      SELECT meta_json, meta_encrypted FROM workspace_connections
      WHERE provider = 'whatsapp' AND status = 'connected'
      LIMIT 1
    `).get() as { meta_json: string | null; meta_encrypted: number | null } | undefined;

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
  sqlite.prepare(`
    INSERT INTO agent_jobs (id, agent_id, project_id, trigger_type, trigger_data, prompt, status, scheduled_for)
    VALUES (@id, @agentId, @projectId, 'whatsapp_message', @triggerData, @prompt, 'pending', unixepoch('now'))
  `).run({
    id,
    agentId,
    projectId: projectId ?? null,
    triggerData: JSON.stringify({ from, message, group_id: groupId ?? null }),
    prompt: message,
  });

  return agentId;
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
