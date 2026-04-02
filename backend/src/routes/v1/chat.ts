import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, pool } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq, desc, isNull, or } from 'drizzle-orm';
import { ok, err } from '../../lib/envelope.js';
import { config } from '../../config.js';
import { z } from 'zod';
import { selectStreamBackend } from '../../services/stream-service.js';
import { buildMemoryContext } from '../../services/memory-injection.js';
import { selectSkills } from '../../services/skill-selector.js';
import type { RoutingContext } from '../../services/bridge/types.js';
import type { ProjectRole } from '../../lib/roles.js';

// --- Schemas ----------------------------------------------------------------

const sessionActionSchema = z.object({
  action: z.enum(['load', 'delete', 'rename']),
  chat_id: z.string().min(1),
  title: z.string().optional(),
});

// --- Route plugin -----------------------------------------------------------

export default async function chatV1Routes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {

  // POST /api/v1/chat/warm — pre-load Ollama model so first chat is instant
  fastify.post('/warm', {
    preHandler: [fastify.requireAuth],
  }, async (_request, reply) => {
    try {
      await fetch(`${config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.ollamaModel, prompt: '', keep_alive: '10m' }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* best-effort */ }
    return reply.send({ ok: true });
  });

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
           FROM chats c
           WHERE (c.username = $1 OR c.username IS NULL)
              OR (c.project_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM project_collaborators pc
                WHERE pc.project_id = c.project_id
                  AND pc.username = $1
                  AND pc.status = 'active'
              ))
           ORDER BY c.updated_at DESC`;

      const rows = isAdmin
        ? (await pool.query(query)).rows as any[]
        : (await pool.query(query, [user.username])).rows as any[];

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
          ? (await pool.query('SELECT * FROM chats WHERE id = $1', [chat_id])).rows[0] as any
          : (await pool.query('SELECT * FROM chats WHERE id = $1 AND (username = $2 OR username IS NULL)', [chat_id, user.username])).rows[0] as any;

        if (!chatRow) {
          return reply.code(404).send(err('NOT_FOUND', 'Chat not found'));
        }

        const msgs = (await pool.query(
          'SELECT id, role, content, timestamp as ts, model_id FROM chat_messages WHERE chat_id = $1 ORDER BY id ASC',
          [chat_id]
        )).rows as any[];

        const atts = (await pool.query(
          'SELECT id, message_id, filename, content_type, size FROM chat_attachments WHERE chat_id = $1',
          [chat_id]
        )).rows as any[];

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
          await pool.query('DELETE FROM chats WHERE id = $1', [chat_id]);
        } else {
          await pool.query('DELETE FROM chats WHERE id = $1 AND (username = $2 OR username IS NULL)',
            [chat_id, user.username]);
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
          await pool.query('UPDATE chats SET title = $1 WHERE id = $2',
            [title.trim(), chat_id]);
        } else {
          await pool.query('UPDATE chats SET title = $1 WHERE id = $2 AND (username = $3 OR username IS NULL)',
            [title.trim(), chat_id, user.username]);
        }
        return reply.send(ok({ renamed: true }));
      } catch (e: any) {
        return reply.code(500).send(err('DB_ERROR', e.message ?? 'Failed to rename chat'));
      }
    }

    return reply.code(400).send(err('UNKNOWN_ACTION', 'Unknown action'));
  });

  // POST /api/v1/chat/stream — SSE streaming chat endpoint (STRM-01, STRM-02, STRM-03)
  fastify.post('/stream', {
    preHandler: [fastify.requireAuth],
  }, async (request, reply) => {
    const body = request.body as {
      message?: string;
      agent_id?: string;
      chat_id?: string;
      project_id?: string;  // COLLAB-03: project context for identity injection
      backend?: 'ollama' | 'openclaw' | 'auto';
    } | null;

    const message = body?.message?.trim();
    if (!message) {
      return reply.code(400).send(err('INVALID_INPUT', 'message is required', request.id));
    }

    const agentId = body?.agent_id;
    const chatId = body?.chat_id;
    const projectId = body?.project_id;
    const backend = body?.backend;

    // COLLAB-03: If a project context is provided, verify project access (chat role minimum)
    if (projectId) {
      if (request.sessionUser!.role !== 'platform_admin') {
        const projectAccess = (await pool.query(
          `SELECT role FROM project_collaborators WHERE project_id = $1 AND username = $2 AND status = 'active'`,
          [projectId, request.sessionUser!.username]
        )).rows[0] as { role: ProjectRole } | undefined;

        if (!projectAccess) {
          return reply.code(403).send(err('FORBIDDEN', 'No access to this project', request.id));
        }

        const roleOrder: ProjectRole[] = ['view', 'chat', 'edit', 'admin', 'owner'];
        if (roleOrder.indexOf(projectAccess.role) < roleOrder.indexOf('chat')) {
          return reply.code(403).send(err('FORBIDDEN', 'Chat access required for this project', request.id));
        }

        request.projectRole = projectAccess.role;
      } else {
        request.projectRole = 'owner';
      }
    }

    const ac = new AbortController();

    // STRM-03: detect client disconnect, abort upstream generation
    request.raw.on('close', () => ac.abort());

    // Set SSE headers before first await (prevents Fastify from sending its own response)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // COLLAB-03: Build identity prefix for agent context awareness
    let identityPrefix = '';
    if (request.projectRole) {
      const displayName = request.sessionUser!.displayName ?? request.sessionUser!.username;
      identityPrefix = `[Collaborator: ${displayName}, Project Role: ${request.projectRole}]\n`;
    }

    // Memory V3: inject tiered memory context before streaming
    const memoryContext = await buildMemoryContext({
      agentId: agentId,
      projectId: projectId,
      searchQuery: message,
    });

    // Injection order: [identity prefix] → [memory context] → [user message]
    // Only the original user message is persisted to chat history (not augmented content)
    let augmentedMessage = message;
    if (memoryContext) {
      augmentedMessage = memoryContext + '\n\n---\n\n' + augmentedMessage;
    }
    if (identityPrefix) {
      augmentedMessage = identityPrefix + augmentedMessage;
    }

    // Build dynamic system prompt from agent template (if available)
    let systemPrompt: string | undefined;
    if (agentId) {
      try {
        const tplRows = await pool.query(
          `SELECT at.system_prompt FROM personas p JOIN agent_templates at ON at.id = p.template_id WHERE p.id = $1 AND at.system_prompt IS NOT NULL AND at.system_prompt != '' LIMIT 1`,
          [agentId]
        );
        if (tplRows.rows.length > 0) systemPrompt = tplRows.rows[0].system_prompt;
      } catch { /* fallback to default */ }
    }

    // Phase 33: Runtime skill selection — inject relevant skill packs into system prompt
    let skillsUsed: RoutingContext['skillsUsed'] | undefined;
    if (agentId) {
      try {
        const skillResult = await selectSkills(agentId, message);
        if (skillResult.promptBlock) {
          systemPrompt = (systemPrompt ?? '') + '\n\n' + skillResult.promptBlock;
        }
        if (skillResult.candidates.length > 0) {
          skillsUsed = {
            candidates: skillResult.candidates.map(c => ({ skillId: c.skillId, name: c.name, score: c.score, reason: c.reason })),
            selected: skillResult.selected.map(s => ({ skillId: s.skillId, name: s.name, score: s.score, reason: s.reason })),
            threshold: 1,
            totalCandidates: skillResult.candidates.length,
          };
        }
      } catch {
        // Skill selection is best-effort — never block a dispatch
      }
    }

    // STRM-02: prefer strong model for user chat, fall back to ollama if unavailable
    const streamBackend = await selectStreamBackend(message, backend ?? 'auto', {
      agentId,
      chatId,
      projectId,
      username: request.sessionUser!.username,
      skillsUsed,  // Phase 33: skill selection telemetry for dispatch logging
    });
    let fullResponse = '';

    try {
      for await (const token of streamBackend.stream(augmentedMessage, ac.signal, systemPrompt)) {
        if (ac.signal.aborted) break;
        fullResponse += token;
        reply.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch (e: any) {
      if (!ac.signal.aborted) {
        reply.raw.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      }
    } finally {
      // Always emit done event (prevents client EventSource reconnect loops)
      const modelLabel = streamBackend.name === 'ollama' ? `ollama/${config.ollamaModel}` : streamBackend.name;
      reply.raw.write(`data: ${JSON.stringify({ done: true, backend: modelLabel, full_response: fullResponse })}\n\n`);
      reply.raw.end();

      // Persist completed message to chat history (non-blocking, best-effort)
      // Store original message (not augmented) — identity prefix is runtime context, not user message
      if (chatId && fullResponse && !ac.signal.aborted) {
        try {
          const user = request.sessionUser!;
          // Ensure chat exists, create if not
          const existingChat = (await pool.query('SELECT id FROM chats WHERE id = $1', [chatId])).rows[0] as { id: string } | undefined;
          if (!existingChat) {
            await pool.query(
              'INSERT INTO chats (id, title, model_id, username, project_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
              [chatId, message.slice(0, 50), streamBackend.name, user.username, projectId ?? null]
            );
          }
          // Insert user message (original, without identity prefix)
          await pool.query(
            'INSERT INTO chat_messages (chat_id, role, content, model_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
            [chatId, 'user', message, null]
          );
          // Insert assistant response
          await pool.query(
            'INSERT INTO chat_messages (chat_id, role, content, model_id, timestamp) VALUES ($1, $2, $3, $4, NOW())',
            [chatId, 'assistant', fullResponse, streamBackend.name]
          );
          // Update chat timestamp
          await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [chatId]);
        } catch {
          // Persistence is best-effort — never fail the stream for a DB error
        }
      }
    }

    return reply; // prevent Fastify from sending its own response
  });
}
