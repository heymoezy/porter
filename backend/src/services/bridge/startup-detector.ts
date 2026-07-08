/**
 * Bridge Service — Startup Detector
 *
 * On Fastify boot, detects the Claude CLI binary and upserts
 * a single gateway row into the DB.
 *
 * Zero-config philosophy: if `claude` is on PATH, Porter uses it.
 */

import which from 'which';
import pg from 'pg';
import crypto from 'node:crypto';
import { refreshAllGateways } from './model-catalog.js';
import { createAdapter } from './adapters/index.js';
import { GATEWAY_CAPABILITY_REGISTRY, getLegacyTags, normalizeCapabilities } from './capability-registry.js';
import type { GatewayType, GatewayAuthMethod, GatewayRow } from './types.js';

// ── Detection report types ────────────────────────────────────────────────────

export interface GatewayDetectionResult {
  type: GatewayType;
  name: string;
  found: boolean;
  healthy: boolean;
  latencyMs?: number;
  models: string[];
  error?: string;
}

export interface DetectionReport {
  gateways: GatewayDetectionResult[];
  detectedAt: number;
  zeroConfigReady: boolean;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function mapRawToGatewayRow(raw: any): GatewayRow {
  return {
    id: raw.id,
    type: raw.type,
    name: raw.name,
    url: raw.url,
    authMethod: raw.auth_method,
    status: raw.status,
    source: raw.source,
    priority: raw.priority,
    capabilities: getLegacyTags(raw.capabilities),
    capabilityRecord: (normalizeCapabilities(raw.capabilities) ?? undefined) as Record<string, unknown> | undefined,
    metadata: (typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) as Record<string, unknown>,
    enabled: raw.enabled,
    maskedDisplay: raw.masked_display ?? '',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastHealthAt: raw.last_health_at,
  };
}

async function probeGateway(row: GatewayRow): Promise<GatewayDetectionResult> {
  const adapter = createAdapter(row);
  if (!adapter) {
    return { type: row.type, name: row.name, found: false, healthy: false, models: [], error: 'No adapter for gateway type' };
  }

  let healthy = false;
  let latencyMs: number | undefined;
  let probeError: string | undefined;
  let models: string[] = [];

  try {
    const healthResult = await adapter.health();
    healthy = healthResult.healthy;
    latencyMs = healthResult.latencyMs;
    if (healthResult.error) probeError = healthResult.error;
  } catch (e) {
    probeError = e instanceof Error ? e.message : String(e);
  }

  if (healthy) {
    try { models = await adapter.listModels(); } catch { /* non-fatal */ }
  }

  return { type: row.type, name: row.name, found: true, healthy, latencyMs, models, error: probeError };
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Detects Claude CLI and upserts a gateway row into the DB.
 * Called on every Fastify boot after bridge migration.
 * Never throws — errors are logged but startup continues.
 */
export async function detectAndUpsertGateways(pool: pg.Pool): Promise<DetectionReport> {
  try {
    const results: GatewayDetectionResult[] = [];

    // Detect Claude CLI binary (env override or PATH scan)
    const binaryPath = process.env.PORTER_CLAUDE_PATH ?? await which('claude').catch(() => null);

    if (binaryPath) {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1, 'claude_cli', 'Claude CLI', NULL, 'none', 'active', 'auto_detected', 10, $2, $3, 1, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (type, source) WHERE source IN ('auto_detected', 'env_bootstrap')
         DO UPDATE SET
           status       = 'active',
           capabilities = EXCLUDED.capabilities,
           metadata     = EXCLUDED.metadata,
           updated_at   = EXTRACT(EPOCH FROM NOW())`,
        [
          id,
          JSON.stringify(GATEWAY_CAPABILITY_REGISTRY.claude_cli),
          JSON.stringify({ binary_path: binaryPath }),
        ],
      );
      console.log(`[bridge] ✓ claude detected at ${binaryPath}`);

      // Probe the freshly upserted gateway
      const { rows } = await pool.query(
        `SELECT * FROM gateways WHERE type = 'claude_cli' AND source = 'auto_detected'`,
      );
      if (rows.length > 0) {
        results.push(await probeGateway(mapRawToGatewayRow(rows[0])));
      } else {
        results.push({ type: 'claude_cli', name: 'Claude CLI', found: true, healthy: false, models: [] });
      }
    } else {
      // Mark stale if binary not found
      await pool.query(
        `UPDATE gateways SET status = 'stale', updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE type = 'claude_cli' AND source = 'auto_detected' AND status != 'stale'`,
      );
      results.push({ type: 'claude_cli', name: 'Claude CLI', found: false, healthy: false, models: [] });
      console.log('[bridge] ✗ claude not found on PATH');
    }

    // Detect Codex CLI binary (env override or PATH scan)
    const codexBinaryPath = process.env.PORTER_CODEX_PATH ?? await which('codex').catch(() => null);

    if (codexBinaryPath) {
      const codexId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1, 'codex_cli', 'Codex CLI', NULL, 'none', 'active', 'auto_detected', 20, $2, $3, 1, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (type, source) WHERE source IN ('auto_detected', 'env_bootstrap')
         DO UPDATE SET
           status       = 'active',
           capabilities = EXCLUDED.capabilities,
           metadata     = EXCLUDED.metadata,
           updated_at   = EXTRACT(EPOCH FROM NOW())`,
        [
          codexId,
          JSON.stringify(GATEWAY_CAPABILITY_REGISTRY.codex_cli),
          JSON.stringify({ binary_path: codexBinaryPath }),
        ],
      );
      console.log(`[bridge] ✓ codex detected at ${codexBinaryPath}`);

      // Probe the freshly upserted gateway
      const { rows } = await pool.query(
        `SELECT * FROM gateways WHERE type = 'codex_cli' AND source = 'auto_detected'`,
      );
      if (rows.length > 0) {
        results.push(await probeGateway(mapRawToGatewayRow(rows[0])));
      } else {
        results.push({ type: 'codex_cli', name: 'Codex CLI', found: true, healthy: false, models: [] });
      }
    } else {
      // Mark stale if binary not found
      await pool.query(
        `UPDATE gateways SET status = 'stale', updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE type = 'codex_cli' AND source = 'auto_detected' AND status != 'stale'`,
      );
      results.push({ type: 'codex_cli', name: 'Codex CLI', found: false, healthy: false, models: [] });
      console.log('[bridge] ✗ codex not found on PATH');
    }

    // Detect Antigravity CLI binary `agy` (env override or PATH scan)
    const agyBinaryPath = process.env.PORTER_ANTIGRAVITY_PATH ?? await which('agy').catch(() => null);

    if (agyBinaryPath) {
      const agyId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1, 'antigravity_cli', 'Antigravity CLI', NULL, 'none', 'active', 'auto_detected', 30, $2, $3, 1, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (type, source) WHERE source IN ('auto_detected', 'env_bootstrap')
         DO UPDATE SET
           status       = 'active',
           capabilities = EXCLUDED.capabilities,
           metadata     = EXCLUDED.metadata,
           updated_at   = EXTRACT(EPOCH FROM NOW())`,
        [
          agyId,
          JSON.stringify(GATEWAY_CAPABILITY_REGISTRY.antigravity_cli),
          JSON.stringify({ binary_path: agyBinaryPath }),
        ],
      );
      console.log(`[bridge] ✓ antigravity (agy) detected at ${agyBinaryPath}`);

      // Probe the freshly upserted gateway
      const { rows } = await pool.query(
        `SELECT * FROM gateways WHERE type = 'antigravity_cli' AND source = 'auto_detected'`,
      );
      if (rows.length > 0) {
        results.push(await probeGateway(mapRawToGatewayRow(rows[0])));
      } else {
        results.push({ type: 'antigravity_cli', name: 'Antigravity CLI', found: true, healthy: false, models: [] });
      }
    } else {
      // Mark stale if binary not found
      await pool.query(
        `UPDATE gateways SET status = 'stale', updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE type = 'antigravity_cli' AND source = 'auto_detected' AND status != 'stale'`,
      );
      results.push({ type: 'antigravity_cli', name: 'Antigravity CLI', found: false, healthy: false, models: [] });
      console.log('[bridge] ✗ antigravity (agy) not found on PATH');
    }

    // Detect xAI Grok CLI binary `grok` (env override or PATH scan)
    const grokBinaryPath = process.env.PORTER_GROK_PATH ?? await which('grok').catch(() => null);

    if (grokBinaryPath) {
      const grokId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO gateways (id, type, name, url, auth_method, status, source, priority, capabilities, metadata, enabled, created_at, updated_at)
         VALUES ($1, 'grok_cli', 'Grok CLI', NULL, 'none', 'active', 'auto_detected', 40, $2, $3, 1, EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
         ON CONFLICT (type, source) WHERE source IN ('auto_detected', 'env_bootstrap')
         DO UPDATE SET
           status       = 'active',
           capabilities = EXCLUDED.capabilities,
           metadata     = EXCLUDED.metadata,
           updated_at   = EXTRACT(EPOCH FROM NOW())`,
        [
          grokId,
          JSON.stringify(GATEWAY_CAPABILITY_REGISTRY.grok_cli),
          JSON.stringify({ binary_path: grokBinaryPath }),
        ],
      );
      console.log(`[bridge] ✓ grok detected at ${grokBinaryPath}`);

      const { rows } = await pool.query(
        `SELECT * FROM gateways WHERE type = 'grok_cli' AND source = 'auto_detected'`,
      );
      if (rows.length > 0) {
        results.push(await probeGateway(mapRawToGatewayRow(rows[0])));
      } else {
        results.push({ type: 'grok_cli', name: 'Grok CLI', found: true, healthy: false, models: [] });
      }
    } else {
      await pool.query(
        `UPDATE gateways SET status = 'stale', updated_at = EXTRACT(EPOCH FROM NOW())
         WHERE type = 'grok_cli' AND source = 'auto_detected' AND status != 'stale'`,
      );
      results.push({ type: 'grok_cli', name: 'Grok CLI', found: false, healthy: false, models: [] });
      console.log('[bridge] ✗ grok not found on PATH');
    }

    console.log('[bridge] Gateway detection complete');

    const zeroConfigReady = results.some(g => g.found && g.healthy);

    // Auto-populate model catalog (fire-and-forget)
    refreshAllGateways(pool).catch(err =>
      console.error('[bridge] Model catalog population failed:', err instanceof Error ? err.message : err),
    );

    return { gateways: results, detectedAt: Date.now(), zeroConfigReady };
  } catch (err) {
    console.error('[bridge] Gateway detection failed:', err instanceof Error ? err.message : err);
    return { gateways: [], detectedAt: Date.now(), zeroConfigReady: false };
  }
}
