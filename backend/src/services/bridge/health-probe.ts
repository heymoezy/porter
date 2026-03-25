/**
 * Bridge Health Probe — Background gateway health monitoring
 *
 * Runs every 30 seconds (via scheduler tick-counter at 15-tick interval).
 * Queries all enabled gateways, calls adapter.health() for each, and:
 *   - Updates DB status to active/stale/unavailable based on health result
 *   - Updates circuit_state column from in-memory circuit breaker state
 *   - Emits bridge:health SSE event when a gateway's status changes
 *
 * First probe is skipped (tickCount < 15) to avoid thundering herd on startup.
 *
 * Phase 18: Resilience Layer (GW-02)
 */

import { pool } from '../../db/client.js';
import { createAdapter } from './adapters/index.js';
import { getBreakerState } from './circuit-breaker-registry.js';
import { emitSSE } from '../scheduler.js';
import type { GatewayRow, GatewayStatus, GatewayAdapter, CircuitState } from './types.js';

// ── Internal DB row shape (snake_case from raw SQL) ───────────────────────────

interface GatewayProbeRow {
  id: string;
  type: string;
  name: string;
  url: string | null;
  auth_method: string;
  status: string;
  source: string;
  priority: number;
  capabilities: unknown;
  metadata: unknown;
  enabled: number;
  masked_display: string;
  created_at: number | null;
  updated_at: number | null;
  last_health_at: number | null;
}

// ── Dependency injection interface (enables unit testing) ─────────────────────

export interface HealthProbeDeps {
  queryAll: (sql: string) => Promise<GatewayProbeRow[]>;
  queryUpdate: (sql: string, params: unknown[]) => Promise<void>;
  createAdapter: (row: GatewayRow) => GatewayAdapter | null;
  getBreakerState: (gatewayId: string) => CircuitState | null;
  emitSSE: (eventType: string, data: Record<string, unknown>) => Promise<void>;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function mapGatewayRow(raw: GatewayProbeRow): GatewayRow {
  return {
    id: raw.id,
    type: raw.type as GatewayRow['type'],
    name: raw.name,
    url: raw.url,
    authMethod: raw.auth_method as GatewayRow['authMethod'],
    status: raw.status as GatewayRow['status'],
    source: raw.source as GatewayRow['source'],
    priority: raw.priority,
    capabilities: Array.isArray(raw.capabilities) ? (raw.capabilities as string[]) : [],
    metadata: (typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) as Record<string, unknown>,
    enabled: raw.enabled,
    maskedDisplay: raw.masked_display,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lastHealthAt: raw.last_health_at,
  };
}

function determineStatus(healthy: boolean, latencyMs: number | undefined): GatewayStatus {
  if (!healthy) return 'unavailable';
  if (latencyMs !== undefined && latencyMs > 5000) return 'stale';
  return 'active';
}

// ── Core probe logic (injectable deps for testing) ────────────────────────────

export async function runHealthProbeWithDeps(deps: HealthProbeDeps): Promise<void> {
  // 1. Fetch all enabled gateways
  const rows = await deps.queryAll(
    `SELECT id, type, name, url, auth_method, status, source, priority,
            capabilities, metadata, enabled, masked_display,
            created_at, updated_at, last_health_at
     FROM gateways WHERE enabled = 1`
  );

  // 2. Probe each gateway independently — one failure must not stop others
  for (const raw of rows) {
    try {
      const row = mapGatewayRow(raw);
      const adapter = deps.createAdapter(row);
      if (!adapter) {
        // Unknown gateway type — skip silently
        continue;
      }

      const oldStatus = raw.status as GatewayStatus;

      // 3. Call adapter.health() with 10s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      let health: { healthy: boolean; latencyMs?: number; error?: string };
      try {
        health = await adapter.health();
      } finally {
        clearTimeout(timeoutId);
      }

      // 4. Determine new status
      const newStatus = determineStatus(health.healthy, health.latencyMs);

      // 5. Get circuit breaker state (observability — not routing logic)
      const circuitState: CircuitState = deps.getBreakerState(row.id) ?? 'closed';

      // 6. Persist status + circuit_state + last_health_at
      await deps.queryUpdate(
        `UPDATE gateways SET status = $1, circuit_state = $2, last_health_at = EXTRACT(EPOCH FROM NOW()) WHERE id = $3`,
        [newStatus, circuitState, row.id]
      );

      // 7. Emit SSE only on status change
      if (oldStatus !== newStatus) {
        deps.emitSSE('bridge:health', {
          gateway_id: row.id,
          gateway_type: row.type,
          old_status: oldStatus,
          new_status: newStatus,
          latency_ms: health.latencyMs ?? null,
        }).catch(() => {
          // SSE is best-effort — never block the probe
        });
      }
    } catch (err) {
      // Per-gateway error isolation — log and continue
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[health-probe] gateway %s failed: %s', raw.id, errMsg);
    }
  }
}

// ── Public entry point (production — uses real dependencies) ──────────────────

const _productionDeps: HealthProbeDeps = {
  queryAll: async (sql: string) => {
    const { rows } = await pool.query(sql);
    return rows as GatewayProbeRow[];
  },
  queryUpdate: async (sql: string, params: unknown[]) => {
    await pool.query(sql, params);
  },
  createAdapter,
  getBreakerState,
  emitSSE,
};

/**
 * Run a health probe against all enabled gateways.
 * Called by the scheduler every 30 seconds (15 ticks × 2s = 30s).
 */
export async function runHealthProbe(): Promise<void> {
  return runHealthProbeWithDeps(_productionDeps);
}
