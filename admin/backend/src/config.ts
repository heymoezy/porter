import 'dotenv/config';
import path from 'path';
import os from 'os';

export const config = {
  port: parseInt(process.env.PORTER_ADMIN_PORT || '5175', 10),
  host: process.env.PORTER_ADMIN_HOST || '0.0.0.0',
  dataDir: process.env.PORTER_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.porter'),
  logLevel: process.env.LOG_LEVEL || 'info',

  // Brain PostgreSQL — single source of truth
  brainDatabaseUrl: process.env.BRAIN_DATABASE_URL || 'postgresql://lobster:porter@127.0.0.1:5432/porter',

  // Porter Brain Fastify backend
  fastifyUrl: process.env.PORTER_BACKEND_URL || 'http://127.0.0.1:3001',

  // AI backends (for health probing)
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  openclawUrl: process.env.OPENCLAW_URL || 'http://127.0.0.1:18789',

  // Personas directory (for Porter profile + identity files)
  personasDir: process.env.PORTER_PERSONAS_DIR || path.join(process.env.PORTER_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.porter'), 'personas'),

  // SMTP bootstrap — admin UI overrides take precedence (stored in DB)
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Porter',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
    replyTo: process.env.SMTP_REPLY_TO || '',
  },
};
