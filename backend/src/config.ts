import 'dotenv/config';
import path from 'path';
import os from 'os';

export const config = {
  port: parseInt(process.env.PORTER_BACKEND_PORT || '3001', 10),
  host: process.env.PORTER_BACKEND_HOST || '127.0.0.1',
  porterPyUrl: process.env.PORTER_PY_URL || 'http://127.0.0.1:8877',
  dbPath: process.env.PORTER_DB_PATH || path.join(process.env.HOME || os.homedir(), '.porter', 'porter.db'),
  dataDir: process.env.PORTER_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.porter'),
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const featureFlags = {
  agentScheduling: process.env.FEATURE_AGENT_SCHEDULING === 'true',
  guidedWizard: process.env.FEATURE_GUIDED_WIZARD === 'true',
  eventTriggers: process.env.FEATURE_EVENT_TRIGGERS === 'true',
  ephemeralAgents: process.env.FEATURE_EPHEMERAL_AGENTS === 'true',
  sseRealtime: process.env.FEATURE_SSE_REALTIME === 'true',
};
