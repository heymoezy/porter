/**
 * Bridge Service — Startup Detector
 *
 * On Fastify boot, scans PATH for local AI CLI tools and bootstraps
 * gateway rows from env vars. DB is authoritative after first run.
 *
 * Zero-config philosophy: if Ollama is running, Porter uses it.
 * Existing OLLAMA_URL/OPENCLAW_URL env vars migrate to DB rows on first boot.
 */

import which from 'which';
import pg from 'pg';
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { encryptCredential, validatePorterSecret } from '../../lib/credential-crypto.js';
import type { GatewayType, GatewayAuthMethod } from './types.js';

// ── CLI binary detection list ─────────────────────────────────────────────────

const CLI_BINARIES: Array<{
  type: GatewayType;
  binary: string;
  name: string;
  capabilities: string[];
}> = [
  { type: 'ollama',     binary: 'ollama',  name: 'Ollama (local)',  capabilities: ['chat', 'code', 'streaming'] },
  { type: 'codex_cli',  binary: 'codex',   name: 'Codex CLI',       capabilities: ['code', 'streaming'] },
  { type: 'claude_cli', binary: 'claude',  name: 'Claude CLI',      capabilities: ['chat', 'code', 'streaming', 'tool_use'] },
  { type: 'gemini_cli', binary: 'gemini',  name: 'Gemini CLI',      capabilities: ['chat', 'code', 'streaming'] },
];

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Detects available AI gateways and upserts rows into the DB.
 * Called on every Fastify boot after bridge migration.
 * Never throws — errors are logged but startup continues.
 */
export async function detectAndUpsertGateways(pool: pg.Pool): Promise<void> {
  try {
    // 1. Bootstrap from env vars first (Ollama always, OpenClaw if token present)
    await bootstrapEnvGateways(pool);

    // 2. Scan PATH for CLI binaries
    for (const cli of CLI_BINARIES) {
      const binaryPath = await which(cli.binary).catch(() => null);

      if (binaryPath) {
        await upsertGateway(pool, {
          type: cli.type,
          name: cli.name,
          url: null,
          authMethod: 'none',
          source: 'auto_detected',
          status: 'active',
          capabilities: cli.capabilities,
          metadata: { binary_path: binaryPath },
        });
        console.log(`[bridge] ✓ ${cli.binary} detected at ${binaryPath}`);
      } else {
        await markStale(pool, cli.type, 'auto_detected');
      }
    }

    console.log('[bridge] Gateway detection complete');
  } catch (err) {
    console.error('[bridge] Gateway detection failed:', err instanceof Error ? err.message : err);
  }
}

// ── Bootstrap env vars → DB rows ──────────────────────────────────────────────

async function bootstrapEnvGateways(pool: pg.Pool): Promise<void> {
  // Ollama: always bootstrap since config.ollamaUrl has a default
  await upsertGateway(pool, {
    type: 'ollama',
    name: 'Ollama (local)',
    url: config.ollamaUrl,
    authMethod: 'none',
    source: 'env_bootstrap',
    status: 'active',
    capabilities: ['chat', 'code', 'streaming'],
    metadata: {},
  });

  // OpenClaw: only if token is configured
  if (config.openclawToken) {
    await upsertGateway(pool, {
      type: 'openclaw',
      name: 'OpenClaw',
      url: config.openclawUrl,
      authMethod: 'bearer_token',
      source: 'env_bootstrap',
      status: 'active',
      capabilities: ['chat', 'code', 'streaming'],
      metadata: {},
    });

    if (validatePorterSecret()) {
      const encrypted = encryptCredential(config.openclawToken);
      const masked = '****...' + config.openclawToken.slice(-4);
      await upsertCredential(pool, 'openclaw', encrypted, masked);
    } else {
      console.warn('[bridge] PORTER_SECRET not set, skipping OpenClaw credential encryption');
    }
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

interface UpsertGatewayParams {
  type: GatewayType;
  name: string;
  url: string | null;
  authMethod: GatewayAuthMethod;
  source: 'auto_detected' | 'env_bootstrap';
  status: 'active' | 'stale';
  capabilities: string[];
  metadata: Record<string, unknown>;
}

/**
 * Upserts a gateway row using raw SQL (not Drizzle) since this runs at boot
 * before Drizzle is fully set up. Uses ON CONFLICT on the partial unique index
 * (type, source) WHERE source IN ('auto_detected', 'env_bootstrap').
 */
async function upsertGateway(pool: pg.Pool, params: UpsertGatewayParams): Promise<void> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 10, $8, $9, 1, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
     ON CONFLICT (type, source) WHERE source IN ('auto_detected', 'env_bootstrap')
     DO UPDATE SET
       name         = EXCLUDED.name,
       url          = EXCLUDED.url,
       auth_method  = EXCLUDED.auth_method,
       status       = EXCLUDED.status,
       capabilities = EXCLUDED.capabilities,
       metadata     = EXCLUDED.metadata,
       updated_at   = EXTRACT(EPOCH FROM NOW())`,
    [
      id,
      params.type,
      params.name,
      params.url,
      params.authMethod,
      params.status,
      params.source,
      JSON.stringify(params.capabilities),
      JSON.stringify(params.metadata),
    ]
  );
}

/**
 * Upserts a credential row for the given gateway type.
 * Uses a deterministic ID so re-runs upsert the same row.
 */
async function upsertCredential(
  pool: pg.Pool,
  gatewayType: GatewayType,
  encryptedValue: string,
  maskedDisplay: string
): Promise<void> {
  // Deterministic credential ID — same gateway + source + label always → same row
  const credId = crypto
    .createHash('sha256')
    .update(`${gatewayType}:env_bootstrap:primary`)
    .digest('hex')
    .slice(0, 36);

  await pool.query(
    `INSERT INTO gateway_credentials (id, gateway_id, label, encrypted_value, masked_display, created_at)
     SELECT $1, g.id, 'primary', $2, $3, EXTRACT(EPOCH FROM NOW())
     FROM gateways g WHERE g.type = $4 AND g.source = 'env_bootstrap'
     ON CONFLICT (id) DO UPDATE SET
       encrypted_value = EXCLUDED.encrypted_value,
       masked_display  = EXCLUDED.masked_display`,
    [credId, encryptedValue, maskedDisplay, gatewayType]
  );
}

/**
 * Marks a gateway as stale when the binary is no longer found.
 * Only updates if row exists and is not already stale.
 */
async function markStale(
  pool: pg.Pool,
  type: GatewayType,
  source: 'auto_detected' | 'env_bootstrap'
): Promise<void> {
  await pool.query(
    `UPDATE gateways
     SET status = 'stale', updated_at = EXTRACT(EPOCH FROM NOW())
     WHERE type = $1 AND source = $2 AND status != 'stale'`,
    [type, source]
  );
}
