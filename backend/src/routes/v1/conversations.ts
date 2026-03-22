import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { sqlite } from '../../db/client.js';
import { ok, err } from '../../lib/envelope.js';
import { z } from 'zod';
import crypto from 'crypto';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createConversationSchema = z.object({
  scope_type: z.enum(['project', 'agent', 'contact', 'global']),
  scope_id: z.string().optional(),
  title: z.string().optional(),
  channel_type: z.string().default('internal'),
  external_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateConversationSchema = z.object({
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createMessageSchema = z.object({
  content: z.string().min(1),
  sender_type: z.enum(['user', 'agent', 'external', 'system']).default('user'),
  sender_id: z.string().optional(),
  sender_name: z.string().optional(),
  parent_id: z.number().int().optional(),
  channel_type: z.string().default('internal'),
  channel_metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageNode {
  id: number;
  conversation_id: string;
  parent_message_id: number | null;
  sender_type: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  channel_type: string;
  channel_metadata: Record<string, unknown>;
  created_at: number;
  children: MessageNode[];
}

// ── Route Plugin ──────────────────────────────────────────────────────────────

export default async function conversationV1Routes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // GET /search — FTS5 full-text search across messages (CHAT-03)
  // Must be registered BEFORE /:id to avoid route conflict
  fastify.get('/search', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const q = query.q?.trim();
    const limit = Math.min(parseInt(query.limit ?? '20', 10) || 20, 200);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    if (!q) {
      return reply.code(400).send(err('INVALID_INPUT', 'q parameter is required'));
    }

    try {
      const results = sqlite.prepare(`
        SELECT m.id, m.conversation_id, m.content, m.sender_name, m.sender_type,
               m.channel_type, m.created_at, rank
        FROM messages m
        JOIN messages_fts ON messages_fts.rowid = m.id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `).all(q, limit, offset) as any[];

      const totalRow = sqlite.prepare(`
        SELECT COUNT(*) as total
        FROM messages m
        JOIN messages_fts ON messages_fts.rowid = m.id
        WHERE messages_fts MATCH ?
      `).get(q) as { total: number } | undefined;

      return reply.send(ok({ results, total: totalRow?.total ?? 0 }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Search failed'));
    }
  });

  // GET / — List conversations with optional scope filters
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const scopeType = query.scope_type;
    const scopeId = query.scope_id;
    const q = query.q?.trim();
    const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 500);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    try {
      let rows: any[];

      if (q) {
        // FTS5 search: find conversations containing matching messages
        rows = sqlite.prepare(`
          SELECT DISTINCT c.*
          FROM conversations c
          JOIN messages m ON m.conversation_id = c.id
          JOIN messages_fts ON messages_fts.rowid = m.id
          WHERE messages_fts MATCH ?
          ORDER BY c.updated_at DESC
          LIMIT ? OFFSET ?
        `).all(q, limit, offset) as any[];
      } else {
        // Build WHERE clauses dynamically
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (scopeType) {
          conditions.push('scope_type = ?');
          params.push(scopeType);
        }
        if (scopeId) {
          conditions.push('scope_id = ?');
          params.push(scopeId);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit, offset);

        rows = sqlite.prepare(`
          SELECT * FROM conversations ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?
        `).all(...params) as any[];
      }

      const conversations = rows.map(r => ({
        ...r,
        metadata: (() => { try { return JSON.parse(r.metadata || '{}'); } catch { return {}; } })(),
      }));

      return reply.send(ok({ conversations, total: conversations.length }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to list conversations'));
    }
  });

  // POST / — Create a conversation
  fastify.post('/', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const parsed = createConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { scope_type, scope_id, title, channel_type, external_id, metadata } = parsed.data;

    // Validate scope_id existence based on scope_type
    if (scope_type === 'global') {
      // global conversations require no scope_id
      if (scope_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'scope_id must not be provided for global scope'));
      }
    } else if (scope_type === 'project') {
      if (!scope_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'scope_id is required for project scope'));
      }
      const exists = sqlite.prepare('SELECT id FROM projects WHERE id = ?').get(scope_id);
      if (!exists) {
        return reply.code(400).send(err('INVALID_SCOPE', 'Referenced project not found'));
      }
    } else if (scope_type === 'agent') {
      if (!scope_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'scope_id is required for agent scope'));
      }
      const exists = sqlite.prepare('SELECT id FROM personas WHERE id = ?').get(scope_id);
      if (!exists) {
        return reply.code(400).send(err('INVALID_SCOPE', 'Referenced agent not found'));
      }
    } else if (scope_type === 'contact') {
      if (!scope_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'scope_id is required for contact scope'));
      }
      const exists = sqlite.prepare('SELECT id FROM contacts WHERE id = ?').get(scope_id);
      if (!exists) {
        return reply.code(400).send(err('INVALID_SCOPE', 'Referenced contact not found'));
      }
    }

    const id = crypto.randomUUID();
    const metadataJson = JSON.stringify(metadata ?? {});

    try {
      sqlite.prepare(`
        INSERT INTO conversations (id, scope_type, scope_id, title, channel_type, external_id, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch('now'), unixepoch('now'))
      `).run(id, scope_type, scope_id ?? null, title ?? null, channel_type, external_id ?? null, metadataJson);

      const conversation = sqlite.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;

      return reply.code(201).send(ok({
        conversation: {
          ...conversation,
          metadata: (() => { try { return JSON.parse(conversation.metadata || '{}'); } catch { return {}; } })(),
        },
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to create conversation'));
    }
  });

  // GET /:id — Get single conversation
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const row = sqlite.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
      if (!row) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      return reply.send(ok({
        conversation: {
          ...row,
          metadata: (() => { try { return JSON.parse(row.metadata || '{}'); } catch { return {}; } })(),
        },
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to fetch conversation'));
    }
  });

  // PATCH /:id — Update conversation title/metadata
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const parsed = updateConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { title, metadata } = parsed.data;

    try {
      const existing = sqlite.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
      if (!existing) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      const updates: string[] = ["updated_at = unixepoch('now')"];
      const params: unknown[] = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }
      if (metadata !== undefined) {
        updates.push('metadata = ?');
        params.push(JSON.stringify(metadata));
      }

      params.push(id);

      sqlite.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      const updated = sqlite.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;

      return reply.send(ok({
        conversation: {
          ...updated,
          metadata: (() => { try { return JSON.parse(updated.metadata || '{}'); } catch { return {}; } })(),
        },
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to update conversation'));
    }
  });

  // DELETE /:id — Delete conversation and all its messages
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const existing = sqlite.prepare('SELECT id FROM conversations WHERE id = ?').get(id);
      if (!existing) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
        sqlite.prepare('DELETE FROM conversations WHERE id = ?').run(id);
      })();

      return reply.send(ok({ deleted: true }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to delete conversation'));
    }
  });

  // GET /:id/messages — Get messages for a conversation with threading support (CHAT-01, CHAT-02)
  fastify.get<{ Params: { id: string } }>('/:id/messages', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const query = request.query as Record<string, string>;
    const flat = query.flat === 'true' || query.flat === '1';
    const limit = Math.min(parseInt(query.limit ?? '100', 10) || 100, 1000);
    const offset = parseInt(query.offset ?? '0', 10) || 0;

    try {
      const convExists = sqlite.prepare('SELECT id FROM conversations WHERE id = ?').get(id);
      if (!convExists) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      const rows = sqlite.prepare(`
        SELECT id, conversation_id, parent_message_id, sender_type, sender_id, sender_name,
               content, channel_type, channel_metadata, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `).all(id, limit, offset) as Array<{
        id: number;
        conversation_id: string;
        parent_message_id: number | null;
        sender_type: string;
        sender_id: string | null;
        sender_name: string | null;
        content: string;
        channel_type: string;
        channel_metadata: string;
        created_at: number;
      }>;

      const total = (sqlite.prepare(
        'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?'
      ).get(id) as { cnt: number }).cnt;

      const normalized = rows.map(r => ({
        id: r.id,
        conversation_id: r.conversation_id,
        parent_message_id: r.parent_message_id,
        sender_type: r.sender_type,
        sender_id: r.sender_id,
        sender_name: r.sender_name,
        content: r.content,
        channel_type: r.channel_type,
        channel_metadata: (() => { try { return JSON.parse(r.channel_metadata || '{}'); } catch { return {}; } })() as Record<string, unknown>,
        created_at: r.created_at,
        children: [] as MessageNode[],
      }));

      if (flat) {
        return reply.send(ok({ messages: normalized, total }));
      }

      // Build tree: messages with null parent_message_id are roots, others attach to parent
      const byId = new Map<number, MessageNode>();
      for (const msg of normalized) {
        byId.set(msg.id, msg);
      }

      const roots: MessageNode[] = [];
      for (const msg of normalized) {
        if (msg.parent_message_id === null) {
          roots.push(msg);
        } else {
          const parent = byId.get(msg.parent_message_id);
          if (parent) {
            parent.children.push(msg);
          } else {
            // Orphaned reply (parent outside the current page) — surface as root
            roots.push(msg);
          }
        }
      }

      return reply.send(ok({ messages: roots, total }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to fetch messages'));
    }
  });

  // POST /:id/messages — Create a message with optional threading (CHAT-01, CHAT-02)
  fastify.post<{ Params: { id: string } }>('/:id/messages', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;

    const parsed = createMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { content, sender_type, sender_id, sender_name, parent_id, channel_type, channel_metadata } = parsed.data;

    try {
      // Verify conversation exists
      const conv = sqlite.prepare('SELECT id FROM conversations WHERE id = ?').get(id);
      if (!conv) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      // Validate parent_id if provided
      if (parent_id !== undefined) {
        const parent = sqlite.prepare(
          'SELECT id FROM messages WHERE id = ? AND conversation_id = ?'
        ).get(parent_id, id);
        if (!parent) {
          return reply.code(400).send(err('INVALID_PARENT', 'Parent message not found in this conversation'));
        }
      }

      // Auto-populate sender info from session user for 'user' type messages
      const user = request.sessionUser!;
      const resolvedSenderId = (sender_type === 'user' && !sender_id) ? user.username : (sender_id ?? null);
      const resolvedSenderName = (sender_type === 'user' && !sender_name)
        ? (user.displayName ?? user.username)
        : (sender_name ?? null);

      const channelMetaJson = JSON.stringify(channel_metadata ?? {});

      sqlite.prepare(`
        INSERT INTO messages
          (conversation_id, parent_message_id, sender_type, sender_id, sender_name,
           content, channel_type, channel_metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch('now'))
      `).run(
        id,
        parent_id ?? null,
        sender_type,
        resolvedSenderId,
        resolvedSenderName,
        content,
        channel_type,
        channelMetaJson,
      );

      const message = sqlite.prepare(
        'SELECT * FROM messages WHERE id = last_insert_rowid()'
      ).get() as any;

      // Update conversation's updated_at timestamp
      sqlite.prepare("UPDATE conversations SET updated_at = unixepoch('now') WHERE id = ?").run(id);

      return reply.code(201).send(ok({
        message: {
          ...message,
          channel_metadata: (() => { try { return JSON.parse(message.channel_metadata || '{}'); } catch { return {}; } })(),
        },
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to create message'));
    }
  });
}
