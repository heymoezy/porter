import 'dotenv/config';
import path from 'path';
import os from 'os';

export const config = {
  port: parseInt(process.env.PORTER_BACKEND_PORT || '3001', 10),
  host: process.env.PORTER_BACKEND_HOST || '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://porter:porter@localhost:5432/porter',
  dataDir: process.env.PORTER_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.porter'),
  logLevel: process.env.LOG_LEVEL || 'info',

  // AI backend URLs — override these in the environment for your deployment.
  // Defaults reflect the standard local dev setup documented in porter/CLAUDE.md.
  //
  // TODO(v7.0): Bridge consolidation — since v6.9.0, claude_cli is the only Bridge
  // gateway. These keys are still consumed by direct (non-Bridge) callers:
  //   - learner.ts          → calls ollama directly for concept extraction (live, ~2100 sessions)
  //   - contact-analyzer.ts → calls ollama directly for CRM sentiment (dead-pathed, 0 jobs queued)
  //   - routes/v1/health.ts + routes/admin/{settings,models}.ts + routes/brain-ui.ts +
  //     routes/v1/templates.ts + routes/v1/chat.ts + routes/v1/admin/{settings,models}.ts
  //     → all expose these URLs in diagnostic/settings endpoints (no-op gracefully when
  //       the underlying daemon is offline — the ollama and openclaw daemons happen to be
  //       running on this host so probes still succeed).
  // The names "ollamaUrl/openclawUrl" no longer reflect Bridge concepts — they're just
  // host-side service URLs. Rename + scope-narrow during v7.0 cleanup.
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  openclawUrl: process.env.OPENCLAW_URL || 'http://127.0.0.1:18789',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:1.5b',
  openclawModel: process.env.OPENCLAW_MODEL || 'openclaw',

  // Auth token for openclaw gateway. Must be set via OPENCLAW_TOKEN env var.
  // No hardcoded fallback — if unset, openclaw dispatch will fail with a clear error.
  // TODO(v7.0): no in-repo callers since v6.9.0 — consumed only by external tools.
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

  // Persona file storage (admin agents/templates routes)
  personasDir: process.env.PORTER_PERSONAS_DIR || path.join(process.env.PORTER_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.porter'), 'personas'),

  // Mail system configuration
  // Primary: Stalwart self-hosted mail for @askporter.app
  // Set STALWART_URL and STALWART_API_KEY to enable provider integration
  // Without these, mail subsystem works in local-only mode (DB records, no real send/receive)
  // Gmail connector: configure via Google OAuth in admin, import-only
  mail: {
    provider: process.env.MAIL_PROVIDER || 'stalwart',
    stalwartUrl: process.env.STALWART_URL || 'http://127.0.0.1:443',
    stalwartApiKey: process.env.STALWART_API_KEY || '',
    defaultDomain: process.env.MAIL_DEFAULT_DOMAIN || 'askporter.app',
    webhookSecret: process.env.MAIL_WEBHOOK_SECRET || '',
  },

  // SMTP config (admin email routes) — all optional, email features disabled when absent.
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? '',
    fromName: process.env.SMTP_FROM_NAME ?? 'Porter',
    replyTo: process.env.SMTP_REPLY_TO ?? '',
  },

  // Self-reference URL for admin system health probe
  get fastifyUrl() { return `http://${this.host}:${this.port}`; },

  // Phase 48.2 — transcript capture global kill switch (TRC-07 belt-and-braces).
  // Default true: capture is on. Per-session override via `/silo none` remains
  // the primary privacy kill switch; this flag is the admin-side global gate.
  // Set INTELLECT_TRANSCRIPT_CAPTURE_ENABLED=false (or 0/no) to disable.
  intellect: {
    transcriptCaptureEnabled: (() => {
      const raw = (process.env.INTELLECT_TRANSCRIPT_CAPTURE_ENABLED || 'true').toLowerCase().trim();
      return raw !== 'false' && raw !== '0' && raw !== 'no';
    })(),
  },
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
