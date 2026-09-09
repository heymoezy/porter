import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
import {
  routeInboundWhatsApp,
  verifyWebhookSignature,
  findOrCreateWhatsAppContact,
  findOrCreateWhatsAppConversation,
} from '../../services/whatsapp.js';
import { ok, err } from '../../lib/envelope.js';

// ── Meta Cloud API payload types ──────────────────────────────────────────────

/**
 * One inbound message. Meta sends a different sub-object per `type`, so every
 * field below the first four is optional and only one of them is populated.
 */
interface MetaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string; mime_type?: string };
  video?: { caption?: string; mime_type?: string };
  audio?: { voice?: boolean; mime_type?: string };
  document?: { caption?: string; filename?: string; mime_type?: string };
  sticker?: { mime_type?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  reaction?: { emoji?: string; message_id?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  errors?: Array<{ code?: number; title?: string; details?: string }>;
}

interface MetaMessageValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  messages?: MetaMessage[];
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: MetaMessageValue;
      field?: string;
    }>;
  }>;
}

/** A message paired with the `value` envelope it arrived in (for contact lookup). */
interface InboundMessage {
  msg: MetaMessage;
  value: MetaMessageValue;
}

// ── Payload flattening ────────────────────────────────────────────────────────

/**
 * Meta batches. One webhook POST can carry several entries, each with several
 * changes, each with several messages — and it does exactly that when messages
 * arrive faster than it delivers them, which is precisely when a burst of them
 * matters most.
 *
 * Reading `entry[0].changes[0].messages[0]` (what this handler used to do) threw
 * away every message but the first and acknowledged the batch with a 200, so the
 * sender saw delivery and Porter never replied. Flatten all three levels.
 */
export function flattenInboundMessages(body: MetaWebhookBody | undefined): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      for (const msg of value.messages ?? []) {
        if (msg) out.push({ msg, value });
      }
    }
  }
  return out;
}

// ── Message rendering ─────────────────────────────────────────────────────────

/**
 * What this message says, as text, and whether it deserves a reply.
 *
 * Only `text` messages carry `text.body`. Every other type — a photo, a voice
 * note, a forwarded PDF, a tap on a quick-reply button — has an empty body, and
 * the old `if (!from || !messageText) return 200` treated all of them as noise.
 * They are archived now, with a description standing in for the media, so the
 * conversation history is complete and the agent has something to answer.
 *
 * `routable: false` marks the ones that should NOT wake the agent: a thumbs-up
 * reaction is not a question, and replying to one is worse than staying quiet.
 */
export function describeMessage(msg: MetaMessage): { content: string; routable: boolean } {
  const type = msg.type ?? 'unknown';

  switch (type) {
    case 'text':
      return { content: (msg.text?.body ?? '').trim(), routable: true };

    case 'image':
      return { content: (msg.image?.caption ?? '').trim() || '[image]', routable: true };

    case 'video':
      return { content: (msg.video?.caption ?? '').trim() || '[video]', routable: true };

    case 'audio':
      return { content: msg.audio?.voice ? '[voice note]' : '[audio]', routable: true };

    case 'document': {
      const caption = (msg.document?.caption ?? '').trim();
      const filename = (msg.document?.filename ?? '').trim();
      const label = filename ? `[document: ${filename}]` : '[document]';
      return { content: caption ? `${label} ${caption}` : label, routable: true };
    }

    case 'sticker':
      return { content: '[sticker]', routable: false };

    case 'location': {
      const loc = msg.location;
      const name = (loc?.name ?? loc?.address ?? '').trim();
      const coords =
        typeof loc?.latitude === 'number' && typeof loc?.longitude === 'number'
          ? `${loc.latitude},${loc.longitude}`
          : '';
      const detail = name || coords;
      return { content: detail ? `[location: ${detail}]` : '[location]', routable: true };
    }

    case 'contacts': {
      const names = (msg.contacts ?? [])
        .map((c) => (c?.name?.formatted_name ?? '').trim())
        .filter(Boolean);
      return {
        content: names.length ? `[contact card: ${names.join(', ')}]` : '[contact card]',
        routable: true,
      };
    }

    case 'reaction': {
      const emoji = (msg.reaction?.emoji ?? '').trim();
      return { content: emoji ? `[reaction: ${emoji}]` : '[reaction removed]', routable: false };
    }

    case 'button':
      return { content: (msg.button?.text ?? '').trim() || '[button]', routable: true };

    case 'interactive': {
      const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      const title = (reply?.title ?? '').trim();
      return { content: title || '[interactive reply]', routable: true };
    }

    case 'unsupported': {
      const detail = (msg.errors?.[0]?.title ?? '').trim();
      return {
        content: detail ? `[unsupported message: ${detail}]` : '[unsupported message]',
        routable: false,
      };
    }

    default:
      return { content: `[${type} message]`, routable: true };
  }
}

// ── Drop recording ────────────────────────────────────────────────────────────

/**
 * A message Porter could not take. The point of this whole change is that no
 * inbound message disappears without a trace, so a failure lands in the one
 * event log (`/api/v1/events`) where it can actually be found later.
 *
 * Best-effort by construction: if the database is what failed, the log line on
 * stderr is the last resort, and we still 200 the batch so Meta does not replay
 * the messages that DID land.
 */
async function recordDrop(
  fastify: FastifyInstance,
  msg: MetaMessage,
  reason: string,
): Promise<void> {
  fastify.log.error(
    `[whatsapp-webhook] Dropped message ${msg.id ?? '<no id>'} (type=${msg.type ?? 'unknown'}): ${reason}`,
  );
  try {
    await pool.query(
      `INSERT INTO intellect_events (id, event_type, source_type, details_json, created_at)
       VALUES ($1, $2, $3, $4::jsonb, EXTRACT(EPOCH FROM NOW()))`,
      [
        randomUUID(),
        'whatsapp.inbound_dropped',
        'porter.whatsapp',
        JSON.stringify({
          wa_message_id: msg.id ?? null,
          wa_type: msg.type ?? null,
          from: msg.from ?? null,
          reason,
        }),
      ],
    );
  } catch (logErr: unknown) {
    const message = logErr instanceof Error ? logErr.message : 'Unknown error';
    fastify.log.error(`[whatsapp-webhook] Could not record dropped message: ${message}`);
  }
}

// ── Single-message handling ───────────────────────────────────────────────────

/**
 * Archive one message, then route it. Throws so the caller can record the drop
 * and carry on with the rest of the batch — one poisoned message must not cost
 * the messages behind it in the same POST.
 */
async function handleInboundMessage(
  fastify: FastifyInstance,
  msg: MetaMessage,
  value: MetaMessageValue,
): Promise<void> {
  const from = msg.from;
  if (!from) throw new Error('message has no sender');

  const { content, routable } = describeMessage(msg);
  if (!content) throw new Error(`message type ${msg.type ?? 'unknown'} produced no content`);

  // Match the profile on the sender's own wa_id. `contacts[0]` is only correct
  // for a single-sender batch, and a batch is exactly when it is not.
  const profileName =
    (value.contacts ?? []).find((c) => c?.wa_id === from)?.profile?.name ??
    (value.contacts ?? [])[0]?.profile?.name;

  // 1. Find or create CRM contact from phone number
  const contactId = await findOrCreateWhatsAppContact(from, profileName);

  // 2. Find or create conversation keyed by phone number (external_id)
  const conversationId = await findOrCreateWhatsAppConversation(from, contactId);

  // 3. Archive normalized message + raw payload in messages table.
  //    wa_message_id is lifted out of the raw payload so a specific message can
  //    be found without digging through the envelope.
  await pool.query(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content, channel_type, channel_metadata, created_at)
     VALUES ($1, 'external', $2, $3, $4, 'whatsapp', $5, EXTRACT(EPOCH FROM NOW()))`,
    [
      conversationId,
      from,
      profileName || from,
      content,
      JSON.stringify({
        wa_message_id: msg.id ?? null,
        wa_type: msg.type ?? null,
        routable,
        raw: value,
      }),
    ],
  );

  // 4. Update conversation timestamp
  await pool.query(
    `UPDATE conversations SET updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1`,
    [conversationId],
  );

  fastify.log.info(
    `[whatsapp-webhook] Archived ${msg.type ?? 'unknown'} message from ${from} in conversation ${conversationId}`,
  );

  if (!routable) {
    fastify.log.info(
      `[whatsapp-webhook] ${msg.type ?? 'unknown'} message from ${from} archived without routing`,
    );
    return;
  }

  // 5. Route to agent
  // WhatsApp Cloud API does not surface a group id on the standard payload, so
  // group-linked project routing stays unavailable here.
  const groupId: string | undefined = undefined;

  const agentId = await routeInboundWhatsApp(from, content, groupId);
  if (!agentId) throw new Error('no agent available to route to (no master persona?)');

  fastify.log.info(`[whatsapp-webhook] Routed message from ${from} to agent ${agentId}`);
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
    const inbound = flattenInboundMessages(body);

    if (inbound.length === 0) {
      // Status updates or other non-message payloads — acknowledge and ignore
      fastify.log.debug('[whatsapp-webhook] No messages in payload, acknowledging');
      return reply.code(200).send(ok({ status: 'acknowledged', received: 0, processed: 0, dropped: 0 }));
    }

    // Sequential, so replies follow the order the sender wrote in.
    let processed = 0;
    let dropped = 0;
    for (const { msg, value } of inbound) {
      try {
        await handleInboundMessage(fastify, msg, value);
        processed++;
      } catch (handlerErr: unknown) {
        dropped++;
        const message = handlerErr instanceof Error ? handlerErr.message : 'Unknown error';
        await recordDrop(fastify, msg, message);
      }
    }

    if (dropped > 0) {
      fastify.log.error(
        `[whatsapp-webhook] Batch finished with drops: ${processed} processed, ${dropped} dropped of ${inbound.length}`,
      );
    }

    // Always return 200 to Meta. A non-200 replays the WHOLE batch, which would
    // duplicate the messages that succeeded in order to retry the ones that did
    // not; the drops are recorded in intellect_events instead.
    return reply
      .code(200)
      .send(ok({ status: 'acknowledged', received: inbound.length, processed, dropped }));
  });
}
