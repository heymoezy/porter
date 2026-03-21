import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, sqlite } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq, desc, isNull, or } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import { z } from 'zod';

// --- Schemas ----------------------------------------------------------------

const sessionActionSchema = z.object({
  action: z.enum(['load', 'delete', 'rename']),
  chat_id: z.string().min(1),
  title: z.string().optional(),
});

// --- Route plugin -----------------------------------------------------------

export default async function chatV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // GET /api/v1/chat/sessions — list all chat sessions with metadata
  fastify.get('/sessions', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.sessionUser!;
    const isAdmin = user.role === 'admin' || user.role === 'platform_admin';

    try {
      const query = isAdmin
        ? `SELECT c.id, c.title, c.model_id, c.updated_at, c.username,
                  c.project_id, c.metadata,
                  (SELECT count(*) FROM chat_messages WHERE chat_id = c.id) as msg_count
           FROM chats c ORDER BY c.updated_at DESC`
        : `SELECT c.id, c.title, c.model_id, c.updated_at, c.username,
                  c.project_id, c.metadata,
                  (SELECT count(*) FROM chat_messages WHERE chat_id = c.id) as msg_count
           FROM chats c WHERE c.username = @username OR c.username IS NULL
           ORDER BY c.updated_at DESC`;

      const rows = isAdmin
        ? sqlite.prepare(query).all() as any[]
        : sqlite.prepare(query).all({ username: user.username }) as any[];

      const sessions = rows.map(r => {
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(r.metadata || '{}'); } catch { /* ignore */ }
        return {
          id: r.id,
          title: r.title || 'Untitled',
          model: r.model_id || '',
          messages: r.msg_count,
          updated_ts: r.updated_at,
          project_id: r.project_id || '',
          persona: (meta.persona_name as string) || '',
        };
      });

      return reply.send(ok({ sessions, count: sessions.length }));
    } catch (e: any) {
      return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to fetch sessions'));
    }
  });

  // POST /api/v1/chat/sessions — actions: load, delete, rename
  fastify.post('/sessions', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.sessionUser!;
    const isAdmin = user.role === 'admin' || user.role === 'platform_admin';

    const parsed = sessionActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(err('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input'));
    }

    const { action, chat_id, title } = parsed.data;

    if (action === 'load') {
      try {
        const chatRow = isAdmin
          ? sqlite.prepare('SELECT * FROM chats WHERE id = @chatId').get({ chatId: chat_id }) as any
          : sqlite.prepare('SELECT * FROM chats WHERE id = @chatId AND (username = @username OR username IS NULL)').get({ chatId: chat_id, username: user.username }) as any;

        if (!chatRow) {
          return reply.code(404).send(err('NOT_FOUND', 'Chat not found'));
        }

        const msgs = sqlite.prepare(
          'SELECT id, role, content, timestamp as ts, model_id FROM chat_messages WHERE chat_id = @chatId ORDER BY id ASC'
        ).all({ chatId: chat_id }) as any[];

        const atts = sqlite.prepare(
          'SELECT id, message_id, filename, content_type, size FROM chat_attachments WHERE chat_id = @chatId'
        ).all({ chatId: chat_id }) as any[];

        // Group attachments by message_id
        const attsByMsg: Record<number, any[]> = {};
        for (const a of atts) {
          if (!attsByMsg[a.message_id]) attsByMsg[a.message_id] = [];
          attsByMsg[a.message_id].push(a);
        }

        const messages = msgs.map(m => ({
          ...m,
          attachments: attsByMsg[m.id] || [],
        }));

        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(chatRow.metadata || '{}'); } catch { /* ignore */ }

        const chat = {
          id: chatRow.id,
          title: chatRow.title,
          model: chatRow.model_id,
          project_id: chatRow.project_id,
          username: chatRow.username,
          created_at: chatRow.created_at,
          updated_at: chatRow.updated_at,
          messages,
          metadata: meta,
        };

        return reply.send(ok({ chat }));
      } catch (e: any) {
        return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to load chat'));
      }
    }

    if (action === 'delete') {
      try {
        if (isAdmin) {
          sqlite.prepare('DELETE FROM chats WHERE id = @chatId').run({ chatId: chat_id });
        } else {
          sqlite.prepare('DELETE FROM chats WHERE id = @chatId AND (username = @username OR username IS NULL)')
            .run({ chatId: chat_id, username: user.username });
        }
        return reply.send(ok({ deleted: true }));
      } catch (e: any) {
        return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to delete chat'));
      }
    }

    if (action === 'rename') {
      if (!title || !title.trim()) {
        return reply.code(400).send(err('INVALID_INPUT', 'Title is required'));
      }
      try {
        if (isAdmin) {
          sqlite.prepare('UPDATE chats SET title = @title WHERE id = @chatId')
            .run({ title: title.trim(), chatId: chat_id });
        } else {
          sqlite.prepare('UPDATE chats SET title = @title WHERE id = @chatId AND (username = @username OR username IS NULL)')
            .run({ title: title.trim(), chatId: chat_id, username: user.username });
        }
        return reply.send(ok({ renamed: true }));
      } catch (e: any) {
        return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to rename chat'));
      }
    }

    return reply.code(400).send(err('UNKNOWN_ACTION', 'Unknown action'));
  });

  // GET /api/v1/chat/stream — proxy to porter.py SSE endpoint
  fastify.get('/stream', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const url = new URL(request.url, `http://${request.hostname}`);
    const targetUrl = `${config.porterPyUrl}/api/chat/stream${url.search}`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      };

      // Forward session cookie
      const cookie = request.headers.cookie;
      if (cookie) headers['Cookie'] = cookie;

      const upstream = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(120_000),
      });

      if (!upstream.ok) {
        return reply.code(upstream.status).send(err('UPSTREAM_ERROR', `Porter.py returned ${upstream.status}`));
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Pipe the upstream body to the client
      const reader = upstream.body?.getReader();
      if (!reader) {
        reply.raw.end();
        return;
      }

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply.raw.write(value);
          }
        } catch {
          // Client disconnected or upstream closed
        } finally {
          reply.raw.end();
        }
      };

      // Don't await — let it stream
      pump();

      // Prevent Fastify from sending its own response
      return reply;
    } catch (e: any) {
      return reply.code(502).send(err('PROXY_ERROR', e.message ?? 'Failed to connect to porter.py'));
    }
  });
}
