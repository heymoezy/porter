import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../db/schema';
import { eq, and, or, isNull, sql, desc } from 'drizzle-orm';

export default async function chatRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const sqlite = new Database('../porter.db');
  const db = drizzle(sqlite, { schema });

  // Middleware-like check for session
  const getSession = async (request: any) => {
    const token = request.cookies.porter_session;
    if (!token) return null;
    return db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  };

  const getUser = async (username: string) => {
    return db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  };

  fastify.get('/api/chat/sessions', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    // Join with chat_messages to get message count
    // In Drizzle, we can use a subquery or a left join with count
    
    let query;
    if (user.role === 'admin') {
      query = db.select({
        id: schema.chats.id,
        title: schema.chats.title,
        model: schema.chats.modelId,
        updated: schema.chats.updatedAt,
        username: schema.chats.username,
      }).from(schema.chats).orderBy(desc(schema.chats.updatedAt));
    } else {
      query = db.select({
        id: schema.chats.id,
        title: schema.chats.title,
        model: schema.chats.modelId,
        updated: schema.chats.updatedAt,
        username: schema.chats.username,
      }).from(schema.chats)
        .where(or(eq(schema.chats.username, user.username), isNull(schema.chats.username)))
        .orderBy(desc(schema.chats.updatedAt));
    }

    const rows = await query.all();
    
    // For each chat, get message count (could be optimized with a join/group by)
    const sessions = await Promise.all(rows.map(async (r) => {
      const msgs = await db.select({ count: sql<number>`count(*)` })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.chatId, r.id))
        .get();
      
      return {
        ...r,
        messages: msgs?.count || 0,
        // Format date for frontend
        updated: r.updated ? new Date(Number(r.updated) * 1000).toISOString().split('.')[0] : ''
      };
    }));

    return { ok: true, sessions };
  });

  fastify.post('/api/chat', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const user = await getUser(session.username);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const data = request.body as any;
    const action = data.action;

    if (action === 'load') {
      const chatId = data.chat_id;
      let chat;
      if (user.role === 'admin') {
        chat = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId)).get();
      } else {
        chat = await db.select().from(schema.chats)
          .where(and(eq(schema.chats.id, chatId), or(eq(schema.chats.username, user.username), isNull(schema.chats.username))))
          .get();
      }

      if (!chat) return reply.code(404).send({ ok: false, error: 'Chat not found' });

      const messages = await db.select().from(schema.chatMessages)
        .where(eq(schema.chatMessages.chatId, chatId))
        .orderBy(schema.chatMessages.id)
        .all();
      
      const attachments = await db.select({
        id: schema.chatAttachments.id,
        messageId: schema.chatAttachments.messageId,
        filename: schema.chatAttachments.filename,
        contentType: schema.chatAttachments.contentType,
        size: schema.chatAttachments.size,
      }).from(schema.chatAttachments).where(eq(schema.chatAttachments.chatId, chatId)).all();

      // Group attachments by messageId
      const attsByMsg: Record<number, any[]> = {};
      attachments.forEach(a => {
        if (a.messageId) {
          if (!attsByMsg[a.messageId]) attsByMsg[a.messageId] = [];
          attsByMsg[a.messageId].push(a);
        }
      });

      const chatData = {
        ...chat,
        created: chat.createdAt ? new Date(Number(chat.createdAt) * 1000).toISOString().split('.')[0] : '',
        updated: chat.updatedAt ? new Date(Number(chat.updatedAt) * 1000).toISOString().split('.')[0] : '',
        messages: messages.map(m => ({
          ...m,
          ts: m.timestamp,
          attachments: m.id ? attsByMsg[m.id] || [] : []
        }))
      };

      return { ok: true, chat: chatData };
    }

    if (action === 'delete') {
      const chatId = data.chat_id;
      if (user.role === 'admin') {
        await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
      } else {
        await db.delete(schema.chats).where(and(eq(schema.chats.id, chatId), eq(schema.chats.username, user.username)));
      }
      return { ok: true };
    }

    if (action === 'rename') {
      const { chat_id, title } = data;
      if (!title) return reply.code(400).send({ ok: false, error: 'Empty title' });
      
      if (user.role === 'admin') {
        await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, chat_id));
      } else {
        await db.update(schema.chats).set({ title })
          .where(and(eq(schema.chats.id, chat_id), eq(schema.chats.username, user.username)));
      }
      return { ok: true };
    }

    return reply.code(400).send({ ok: false, error: 'Unknown action' });
  });
}
