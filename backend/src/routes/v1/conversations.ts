import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/client.js';
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
  // GET /search — full-text search across messages (CHAT-03)
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
      const results = (await pool.query(`
        SELECT m.id, m.conversation_id, m.content, m.sender_name, m.sender_type,
               m.channel_type, m.created_at,
               ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', $1)) as rank
        FROM messages m
        WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2 OFFSET $3
      `, [q, limit, offset])).rows as any[];

      const totalRow = (await pool.query(`
        SELECT COUNT(*) as total
        FROM messages m
        WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', $1)
      `, [q])).rows[0] as { total: number } | undefined;

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
        // Full-text search: find conversations containing matching messages
        rows = (await pool.query(`
          SELECT DISTINCT c.*
          FROM conversations c
          JOIN messages m ON m.conversation_id = c.id
          WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', $1)
          ORDER BY c.updated_at DESC
          LIMIT $2 OFFSET $3
        `, [q, limit, offset])).rows as any[];
      } else {
        // Build WHERE clauses dynamically
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (scopeType) {
          conditions.push(`scope_type = $${paramIdx}`);
          params.push(scopeType);
          paramIdx++;
        }
        if (scopeId) {
          conditions.push(`scope_id = $${paramIdx}`);
          params.push(scopeId);
          paramIdx++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit, offset);

        rows = (await pool.query(`
          SELECT * FROM conversations ${where} ORDER BY updated_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `, params)).rows as any[];
      }

      const conversations = rows.map(r => ({
        ...r,
        metadata: typeof r.metadata === 'string'
          ? (() => { try { return JSON.parse(r.metadata || '{}'); } catch { return {}; } })()
          : (r.metadata || {}),
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
      const exists = (await pool.query('SELECT id FROM projects WHERE id = $1', [scope_id])).rows[0];
      if (!exists) {
        return reply.code(400).send(err('INVALID_SCOPE', 'Referenced project not found'));
      }
    } else if (scope_type === 'agent') {
      if (!scope_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'scope_id is required for agent scope'));
      }
      const exists = (await pool.query('SELECT id FROM personas WHERE id = $1', [scope_id])).rows[0];
      if (!exists) {
        return reply.code(400).send(err('INVALID_SCOPE', 'Referenced agent not found'));
      }
    } else if (scope_type === 'contact') {
      if (!scope_id) {
        return reply.code(400).send(err('INVALID_INPUT', 'scope_id is required for contact scope'));
      }
      const exists = (await pool.query('SELECT id FROM contacts WHERE id = $1', [scope_id])).rows[0];
      if (!exists) {
        return reply.code(400).send(err('INVALID_SCOPE', 'Referenced contact not found'));
      }
    }

    const id = crypto.randomUUID();
    const metadataJson = JSON.stringify(metadata ?? {});

    try {
      await pool.query(`
        INSERT INTO conversations (id, scope_type, scope_id, title, channel_type, external_id, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
      `, [id, scope_type, scope_id ?? null, title ?? null, channel_type, external_id ?? null, metadataJson]);

      const conversation = (await pool.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0] as any;

      return reply.code(201).send(ok({
        conversation: {
          ...conversation,
          metadata: typeof conversation.metadata === 'string'
            ? (() => { try { return JSON.parse(conversation.metadata || '{}'); } catch { return {}; } })()
            : (conversation.metadata || {}),
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
      const row = (await pool.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0] as any;
      if (!row) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      return reply.send(ok({
        conversation: {
          ...row,
          metadata: typeof row.metadata === 'string'
            ? (() => { try { return JSON.parse(row.metadata || '{}'); } catch { return {}; } })()
            : (row.metadata || {}),
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
      const existing = (await pool.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0] as any;
      if (!existing) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      const updates: string[] = ['updated_at = EXTRACT(EPOCH FROM NOW())'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramIdx}`);
        params.push(title);
        paramIdx++;
      }
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIdx}`);
        params.push(JSON.stringify(metadata));
        paramIdx++;
      }

      params.push(id);

      await pool.query(`UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);

      const updated = (await pool.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0] as any;

      return reply.send(ok({
        conversation: {
          ...updated,
          metadata: typeof updated.metadata === 'string'
            ? (() => { try { return JSON.parse(updated.metadata || '{}'); } catch { return {}; } })()
            : (updated.metadata || {}),
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
      const existing = (await pool.query('SELECT id FROM conversations WHERE id = $1', [id])).rows[0];
      if (!existing) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM messages WHERE conversation_id = $1', [id]);
        await client.query('DELETE FROM conversations WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

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
      const convExists = (await pool.query('SELECT id FROM conversations WHERE id = $1', [id])).rows[0];
      if (!convExists) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      const rows = (await pool.query(`
        SELECT id, conversation_id, parent_message_id, sender_type, sender_id, sender_name,
               content, channel_type, channel_metadata, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
      `, [id, limit, offset])).rows as Array<{
        id: number;
        conversation_id: string;
        parent_message_id: number | null;
        sender_type: string;
        sender_id: string | null;
        sender_name: string | null;
        content: string;
        channel_type: string;
        channel_metadata: string | Record<string, unknown>;
        created_at: number;
      }>;

      const total = ((await pool.query(
        'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = $1', [id]
      )).rows[0] as { cnt: number }).cnt;

      const normalized = rows.map(r => ({
        id: r.id,
        conversation_id: r.conversation_id,
        parent_message_id: r.parent_message_id,
        sender_type: r.sender_type,
        sender_id: r.sender_id,
        sender_name: r.sender_name,
        content: r.content,
        channel_type: r.channel_type,
        channel_metadata: (typeof r.channel_metadata === 'string'
          ? (() => { try { return JSON.parse(r.channel_metadata || '{}'); } catch { return {}; } })()
          : (r.channel_metadata || {})) as Record<string, unknown>,
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
      const conv = (await pool.query('SELECT id FROM conversations WHERE id = $1', [id])).rows[0];
      if (!conv) {
        return reply.code(404).send(err('NOT_FOUND', 'Conversation not found'));
      }

      // Validate parent_id if provided
      if (parent_id !== undefined) {
        const parent = (await pool.query(
          'SELECT id FROM messages WHERE id = $1 AND conversation_id = $2',
          [parent_id, id]
        )).rows[0];
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

      const insertResult = await pool.query(`
        INSERT INTO messages
          (conversation_id, parent_message_id, sender_type, sender_id, sender_name,
           content, channel_type, channel_metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW()))
        RETURNING *
      `, [
        id,
        parent_id ?? null,
        sender_type,
        resolvedSenderId,
        resolvedSenderName,
        content,
        channel_type,
        channelMetaJson,
      ]);

      const message = insertResult.rows[0] as any;

      // Update conversation's updated_at timestamp
      await pool.query("UPDATE conversations SET updated_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $1", [id]);

      return reply.code(201).send(ok({
        message: {
          ...message,
          channel_metadata: typeof message.channel_metadata === 'string'
            ? (() => { try { return JSON.parse(message.channel_metadata || '{}'); } catch { return {}; } })()
            : (message.channel_metadata || {}),
        },
      }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to create message'));
    }
  });
}
