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

  // AI backend URLs — override these in the environment for your deployment.
  // Defaults reflect the standard local dev setup documented in porter/CLAUDE.md.
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  openclawUrl: process.env.OPENCLAW_URL || 'http://127.0.0.1:18789',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b',
  openclawModel: process.env.OPENCLAW_MODEL || 'openai-codex/gpt-5.4',

  // Auth token for openclaw gateway. Must be set via OPENCLAW_TOKEN env var.
  // No hardcoded fallback — if unset, openclaw dispatch will fail with a clear error.
  openclawToken: process.env.OPENCLAW_TOKEN ?? '',

  // Credential encryption key for external connections (Phase 7).
  // Generate with: openssl rand -hex 32
  porterSecret: process.env.PORTER_SECRET ?? '',

  // Public-facing URL for OAuth redirect URIs (Phase 7 external connections).
  publicUrl: process.env.PORTER_PUBLIC_URL ?? '',

  // Lemon Squeezy billing — all optional, billing features disabled when absent.
  lemonSqueezyApiKey: process.env.LEMONSQUEEZY_API_KEY ?? '',
  lemonSqueezyStoreId: process.env.LEMONSQUEEZY_STORE_ID ?? '',
  lemonSqueezyWebhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '',
  // Trial duration in days (default: 14)
  trialDays: parseInt(process.env.PORTER_TRIAL_DAYS || '14', 10),
};

/** Loopback addresses — used to identify the local machine in node config. */
export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export const featureFlags = {
  agentScheduling: process.env.FEATURE_AGENT_SCHEDULING === 'true',
  guidedWizard: process.env.FEATURE_GUIDED_WIZARD === 'true',
  eventTriggers: process.env.FEATURE_EVENT_TRIGGERS === 'true',
  ephemeralAgents: process.env.FEATURE_EPHEMERAL_AGENTS === 'true',
  sseRealtime: process.env.FEATURE_SSE_REALTIME === 'true',
  billing: process.env.FEATURE_BILLING === 'true',
  externalConnections: process.env.FEATURE_EXTERNAL_CONNECTIONS === 'true',
};
