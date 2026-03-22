import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { sqlite } from '../../db/client.js';
import {
  routeInboundWhatsApp,
  verifyWebhookSignature,
  findOrCreateWhatsAppContact,
  findOrCreateWhatsAppConversation,
} from '../../services/whatsapp.js';
import { ok, err } from '../../lib/envelope.js';

// ── Meta Cloud API payload types ──────────────────────────────────────────────

interface MetaMessageValue {
  messaging_product: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
  }>;
  contacts?: Array<{
    profile?: { name: string };
    wa_id: string;
  }>;
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: MetaMessageValue;
      field: string;
    }>;
  }>;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

/**
 * WhatsApp webhook receiver.
 *
 * GET  / — Meta webhook verification challenge
 * POST / — Inbound message handler
 *
 * No requireAuth: Meta sends requests without Porter session cookies.
 * X-Hub-Signature-256 (HMAC-SHA256) is the authentication mechanism.
 */
export default async function webhookWhatsAppRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions,
) {
  // ── GET / — Meta webhook verification challenge ─────────────────────────────
  fastify.get('/', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
      fastify.log.info('[whatsapp-webhook] Verification challenge accepted');
      return reply.code(200).type('text/plain').send(challenge);
    }

    fastify.log.warn('[whatsapp-webhook] Verification failed — invalid mode or verify_token');
    return reply.code(403).send(err('FORBIDDEN', 'Webhook verification failed'));
  });

  // ── POST / — Inbound message handler ───────────────────────────────────────
  fastify.post('/', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const signatureHeader = (request.headers['x-hub-signature-256'] as string) ?? '';
    const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
    const bodyStr = rawBody ? rawBody.toString('utf8') : JSON.stringify(request.body);

    // Verify HMAC signature — throws if WHATSAPP_APP_SECRET missing
    let signatureValid: boolean;
    try {
      signatureValid = verifyWebhookSignature(signatureHeader, bodyStr);
    } catch (sigErr: unknown) {
      const message = sigErr instanceof Error ? sigErr.message : 'Unknown error';
      fastify.log.error(`[whatsapp-webhook] Signature verification error: ${message}`);
      return reply.code(500).send(err('WEBHOOK_CONFIG_ERROR', 'Webhook signature verification not configured'));
    }

    if (!signatureValid) {
      fastify.log.warn('[whatsapp-webhook] Invalid X-Hub-Signature-256 — rejecting request');
      return reply.code(403).send(err('FORBIDDEN', 'Invalid webhook signature'));
    }

    // Parse Meta Cloud API payload
    const body = request.body as MetaWebhookBody;

    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const messages = value?.messages;

      if (!messages || messages.length === 0) {
        // Status updates or other non-message payloads — acknowledge and ignore
        fastify.log.debug('[whatsapp-webhook] No messages in payload, acknowledging');
        return reply.code(200).send(ok({ status: 'acknowledged' }));
      }

      const msg = messages[0];
      const from = msg.from;
      const messageText = msg.text?.body ?? '';

      if (!from || !messageText) {
        fastify.log.warn('[whatsapp-webhook] Missing from or message text, acknowledging');
        return reply.code(200).send(ok({ status: 'acknowledged' }));
      }

      // Extract contact profile name from payload
      const profileName = value?.contacts?.[0]?.profile?.name;

      // Phase 11: Archive message in unified table BEFORE routing
      // 1. Find or create CRM contact from phone number
      const contactId = findOrCreateWhatsAppContact(from, profileName);

      // 2. Find or create conversation keyed by phone number (external_id)
      const conversationId = findOrCreateWhatsAppConversation(from, contactId);

      // 3. Archive normalized message + raw payload in messages table
      sqlite.prepare(
        `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content, channel_type, channel_metadata, created_at)
         VALUES (?, 'external', ?, ?, ?, 'whatsapp', ?, unixepoch('now'))`,
      ).run(
        conversationId,
        from,
        profileName || from,
        messageText,
        JSON.stringify(value),
      );

      // 4. Update conversation timestamp
      sqlite.prepare(
        `UPDATE conversations SET updated_at = unixepoch('now') WHERE id = ?`,
      ).run(conversationId);

      fastify.log.info(`[whatsapp-webhook] Archived message from ${from} in conversation ${conversationId}`);

      // 5. Route to agent (existing behavior)
      // Detect group context from metadata
      // WhatsApp groups surface a group_id in the message context field (not always present)
      // For now, groupId is not directly in the standard payload — leave as undefined
      const groupId: string | undefined = undefined;

      const agentId = routeInboundWhatsApp(from, messageText, groupId);

      fastify.log.info(`[whatsapp-webhook] Routed message from ${from} to agent ${agentId ?? 'none'}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      fastify.log.error(`[whatsapp-webhook] Routing error: ${message}`);
      // Still return 200 — Meta retries on non-200, which can cause duplicate processing
    }

    // Always return 200 to Meta (acknowledge receipt even if routing fails)
    return reply.code(200).send(ok({ status: 'acknowledged' }));
  });
}
