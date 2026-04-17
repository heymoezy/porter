/**
 * Model Catalog Service — Claude CLI only
 *
 * Auto-populates the models table from gateway adapter discovery.
 * Tracks version history in model_versions when capabilities change.
 * Provides cost calculation using per-model pricing metadata.
 *
 * Three exported functions:
 *   - refreshModelsForGateway()  MOD-02
 *   - refreshAllGateways()       MOD-04
 *   - calculateCostUsd()         MOD-05
 */

import pg from 'pg';
import crypto from 'node:crypto';
import { createAdapter } from './adapters/index.js';
import type { GatewayAdapter, GatewayRow, GatewayType, GatewayAuthMethod, GatewaySource } from './types.js';

// ── Static metadata map ───────────────────────────────────────────────────────

interface ModelMetadata {
  capabilities: string[];
  contextWindow: number;
  pricingInputPerM: number | null;
  pricingOutputPerM: number | null;
  benchmarkScores: Record<string, number>;
}

const MODEL_METADATA: Record<string, ModelMetadata> = {
  'claude-opus-4-7': {
    capabilities: ['coding', 'writing', 'analysis', 'reasoning'],
    contextWindow: 200000,
    pricingInputPerM: 15.0,
    pricingOutputPerM: 75.0,
    benchmarkScores: {},
  },
  'claude-opus-4-6': {
    capabilities: ['coding', 'writing', 'analysis', 'reasoning'],
    contextWindow: 200000,
    pricingInputPerM: 15.0,
    pricingOutputPerM: 75.0,
    benchmarkScores: {},
  },
  'claude-sonnet-4-6': {
    capabilities: ['coding', 'writing', 'analysis'],
    contextWindow: 200000,
    pricingInputPerM: 3.0,
    pricingOutputPerM: 15.0,
    benchmarkScores: {},
  },
  'claude-haiku-4-5': {
    capabilities: ['coding', 'writing'],
    contextWindow: 200000,
    pricingInputPerM: 0.25,
    pricingOutputPerM: 1.25,
    benchmarkScores: {},
  },
  'claude-haiku-3-5': {
    capabilities: ['coding', 'writing'],
    contextWindow: 200000,
    pricingInputPerM: 0.25,
    pricingOutputPerM: 1.25,
    benchmarkScores: {},
  },
};

const DEFAULT_METADATA: ModelMetadata = {
  capabilities: ['chat'],
  contextWindow: null as unknown as number,
  pricingInputPerM: null,
  pricingOutputPerM: null,
  benchmarkScores: {},
};

/**
 * Resolve metadata for a model name.
 * Priority: exact match → prefix match → default
 */
function lookupMetadata(modelName: string): ModelMetadata {
  if (MODEL_METADATA[modelName]) return MODEL_METADATA[modelName];

  for (const [key, meta] of Object.entries(MODEL_METADATA)) {
    if (modelName.startsWith(key) || key.startsWith(modelName)) {
      return meta;
    }
  }

  return DEFAULT_METADATA;
}

// ── DB row shape from raw SQL ─────────────────────────────────────────────────

interface GatewayDbRow {
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

interface ModelDbRow {
  id: string;
  capabilities: unknown;
  context_window: number | null;
}

function mapGatewayRow(raw: GatewayDbRow): GatewayRow {
  return {
    id: raw.id,
    type: raw.type as GatewayType,
    name: raw.name,
    url: raw.url,
    authMethod: raw.auth_method as GatewayAuthMethod,
    status: raw.status as GatewayRow['status'],
    source: raw.source as GatewaySource,
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

// ── refreshModelsForGateway ───────────────────────────────────────────────────

/**
 * Refresh the models catalog for a single gateway.
 *
 * - Calls adapter.listModels()
 * - Upserts each model into the models table with enriched metadata
 * - Inserts model_versions rows on first discovery or capability/context change
 * - Marks models no longer returned as is_active=0 (only for 'active' gateways)
 *
 * MOD-02
 */
export async function refreshModelsForGateway(
  pool: pg.Pool,
  gatewayId: string,
  gatewayStatus: string,
  adapter: GatewayAdapter,
): Promise<void> {
  let modelNames: string[];
  try {
    modelNames = await adapter.listModels();
  } catch (err) {
    console.error(`[model-catalog] listModels() failed for gateway ${gatewayId}:`, err instanceof Error ? err.message : err);
    return;
  }

  const seenModelNames = new Set<string>();
  let insertedCount = 0;
  let updatedCount = 0;

  for (const modelName of modelNames) {
    seenModelNames.add(modelName);
    const meta = lookupMetadata(modelName);
    const now = Date.now() / 1000;

    const existing = await pool.query<ModelDbRow>(
      `SELECT id, capabilities, context_window FROM models WHERE gateway_id = $1 AND model_name = $2`,
      [gatewayId, modelName],
    );

    if (existing.rowCount === 0) {
      const modelId = crypto.randomUUID();
      const capJson = JSON.stringify(meta.capabilities);
      await pool.query(
        `INSERT INTO models (id, gateway_id, model_name, capabilities, context_window,
           pricing_input_per_m, pricing_output_per_m, benchmark_scores, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, 1, $9, $9)
         ON CONFLICT (gateway_id, model_name) DO UPDATE SET
           capabilities = EXCLUDED.capabilities,
           context_window = EXCLUDED.context_window,
           pricing_input_per_m = EXCLUDED.pricing_input_per_m,
           pricing_output_per_m = EXCLUDED.pricing_output_per_m,
           is_active = 1,
           updated_at = EXCLUDED.updated_at`,
        [
          modelId, gatewayId, modelName, capJson,
          meta.contextWindow ?? null, meta.pricingInputPerM, meta.pricingOutputPerM,
          JSON.stringify(meta.benchmarkScores), now,
        ],
      );

      const inserted = await pool.query<{ id: string }>(
        `SELECT id FROM models WHERE gateway_id = $1 AND model_name = $2`,
        [gatewayId, modelName],
      );
      const actualModelId = inserted.rows[0]?.id ?? modelId;

      await pool.query(
        `INSERT INTO model_versions (id, model_id, version_label, snapshot, detected_at)
         VALUES ($1, $2, 'initial', $3::jsonb, $4)`,
        [
          crypto.randomUUID(), actualModelId,
          JSON.stringify({
            modelName,
            capabilities: meta.capabilities,
            contextWindow: meta.contextWindow ?? null,
            pricingInputPerM: meta.pricingInputPerM,
            pricingOutputPerM: meta.pricingOutputPerM,
          }),
          now,
        ],
      );
      insertedCount++;
    } else {
      const row = existing.rows[0];
      const existingCaps = Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [];
      const existingCtx = row.context_window;

      const capsChanged =
        JSON.stringify([...existingCaps].sort()) !== JSON.stringify([...meta.capabilities].sort());
      const ctxChanged = existingCtx !== (meta.contextWindow ?? null);

      if (capsChanged || ctxChanged) {
        await pool.query(
          `INSERT INTO model_versions (id, model_id, version_label, snapshot, detected_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [
            crypto.randomUUID(), row.id, new Date().toISOString(),
            JSON.stringify({
              modelName,
              capabilities: meta.capabilities,
              contextWindow: meta.contextWindow ?? null,
              pricingInputPerM: meta.pricingInputPerM,
              pricingOutputPerM: meta.pricingOutputPerM,
            }),
            now,
          ],
        );

        await pool.query(
          `UPDATE models SET
             capabilities = $1::jsonb, context_window = $2,
             pricing_input_per_m = $3, pricing_output_per_m = $4,
             is_active = 1, updated_at = $5
           WHERE id = $6`,
          [
            JSON.stringify(meta.capabilities), meta.contextWindow ?? null,
            meta.pricingInputPerM, meta.pricingOutputPerM, now, row.id,
          ],
        );
        updatedCount++;
      } else {
        await pool.query(
          `UPDATE models SET is_active = 1, updated_at = $1 WHERE id = $2`,
          [now, row.id],
        );
      }
    }
  }

  // Mark models not in listModels() response as inactive
  if (gatewayStatus === 'active' && seenModelNames.size > 0) {
    const seenArray = Array.from(seenModelNames);
    const placeholders = seenArray.map((_, i) => `$${i + 3}`).join(', ');
    await pool.query(
      `UPDATE models SET is_active = 0, updated_at = $1
       WHERE gateway_id = $2 AND model_name NOT IN (${placeholders}) AND is_active = 1`,
      [Date.now() / 1000, gatewayId, ...seenArray],
    );
  }

  console.log(`[model-catalog] Refreshed models for gateway ${gatewayId}: ${modelNames.length} models (${insertedCount} new, ${updatedCount} updated)`);
}

// ── refreshAllGateways ────────────────────────────────────────────────────────

/**
 * Refresh the models catalog for all enabled gateways (Claude CLI only).
 * MOD-04
 */
export async function refreshAllGateways(pool: pg.Pool): Promise<void> {
  const { rows: dbRows } = await pool.query<GatewayDbRow>(
    `SELECT id, type, name, url, auth_method, status, source, priority,
            capabilities, metadata, enabled, masked_display,
            created_at, updated_at, last_health_at
     FROM gateways
     WHERE status IN ('active', 'stale') AND enabled = 1`,
  );

  for (const raw of dbRows) {
    const row = mapGatewayRow(raw);
    const adapter = createAdapter(row);
    if (!adapter) continue;

    try {
      await refreshModelsForGateway(pool, row.id, row.status, adapter);
      console.log(`[model-catalog] Refreshed models for ${row.name}`);
    } catch (err) {
      console.error(`[model-catalog] Failed to refresh gateway ${row.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

// ── calculateCostUsd ──────────────────────────────────────────────────────────

/**
 * Compute estimated USD cost for a dispatch based on token counts and pricing metadata.
 *
 * - Cached tokens billed at 10% of input price (prompt cache discount)
 * - Returns null when no pricing data is available
 * - Falls back to cross-gateway lookup if gateway-specific pricing not found
 *
 * MOD-05
 */
export async function calculateCostUsd(
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
  cachedTokens: number | null | undefined,
  modelName: string,
  gatewayId: string,
  pool: pg.Pool,
): Promise<number | null> {
  if (!inputTokens && !outputTokens) return null;

  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  const cached = cachedTokens ?? 0;

  // Try gateway-specific pricing first
  const primary = await pool.query<{ pricing_input_per_m: number | null; pricing_output_per_m: number | null }>(
    `SELECT pricing_input_per_m, pricing_output_per_m
     FROM models
     WHERE model_name = $1 AND gateway_id = $2 AND is_active = 1
     LIMIT 1`,
    [modelName, gatewayId],
  );

  let pricingInputPerM: number | null = null;
  let pricingOutputPerM: number | null = null;

  if (primary.rowCount && primary.rowCount > 0) {
    pricingInputPerM = primary.rows[0].pricing_input_per_m;
    pricingOutputPerM = primary.rows[0].pricing_output_per_m;
  }

  // Fall back to cross-gateway lookup if needed
  if (pricingInputPerM === null && pricingOutputPerM === null) {
    const fallback = await pool.query<{ pricing_input_per_m: number | null; pricing_output_per_m: number | null }>(
      `SELECT pricing_input_per_m, pricing_output_per_m
       FROM models
       WHERE model_name = $1 AND is_active = 1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [modelName],
    );
    if (fallback.rowCount && fallback.rowCount > 0) {
      pricingInputPerM = fallback.rows[0].pricing_input_per_m;
      pricingOutputPerM = fallback.rows[0].pricing_output_per_m;
    }
  }

  if (pricingInputPerM === null || pricingOutputPerM === null) return null;

  const inputCost = (input / 1_000_000) * pricingInputPerM;
  const outputCost = (output / 1_000_000) * pricingOutputPerM;
  const cachedCost = (cached / 1_000_000) * (pricingInputPerM * 0.1);

  return inputCost + outputCost + cachedCost;
}
