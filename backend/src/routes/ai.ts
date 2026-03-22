import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function aiRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const sqlite = new Database('../porter.db');
  const db = drizzle(sqlite, { schema });

  const CONFIG_PATH = process.env.PORTER_CONFIG_PATH || path.join(__dirname, '../../../porter_config.json');

  const getSession = async (request: any) => {
    const token = request.cookies.porter_session;
    if (!token) return null;
    return db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get();
  };

  const getConfig = async () => {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  };

  fastify.get('/api/ai-providers', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    // For now, return a static list or derived from config
    return { 
      ok: true, 
      providers: [
        { id: 'openai', label: 'OpenAI', ok: true, version: 'v1' },
        { id: 'anthropic', label: 'Anthropic', ok: true, version: 'v3' },
        { id: 'google', label: 'Google Gemini', ok: true, version: 'v1.5' },
        { id: 'ollama', label: 'Ollama (Local)', ok: true, version: 'v0.5' }
      ]
    };
  });

  fastify.get('/api/agents', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    
    const config = await getConfig();
    return { ok: true, agents: config.agents || [] };
  });

  fastify.get('/agent-usage/current', async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    // Placeholder: real implementation would query a usage table or external metrics
    return { ok: true, agents: [] };
  });

  // Tombstone: deprecated mock SSE stream — always 404 to prevent proxy fallthrough
  fastify.get('/api/chat/stream', async (_request, reply) => {
    return reply.code(404).send({ error: 'not_found', message: 'Use POST /api/v1/chat/stream' });
  });

}
