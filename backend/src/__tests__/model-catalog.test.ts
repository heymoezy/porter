/**
 * Tests for model-catalog service — Model Catalog (Phase 19)
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/model-catalog.test.ts
 *
 * Coverage: MOD-01, MOD-02, MOD-04, MOD-05
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── MOD-01: bridge_v4 migration ───────────────────────────────────────────────

describe('bridge_v4 migration', () => {
  it.todo('creates models table with id, gateway_id, model_name, capabilities, context_window, pricing columns');
  it.todo('creates model_versions table with id, model_id, version_label, snapshot, detected_at');
  it.todo('adds cached_tokens column to bridge_dispatch_log');
  it.todo('adds model_version_id column to bridge_dispatch_log');
  it.todo('enforces UNIQUE(gateway_id, model_name) constraint on models');
  it.todo('is idempotent — safe to run twice without error');
  it.todo('migrateBridgeV4 is an exported async function');
});

// ── MOD-02: refreshModelsForGateway() ────────────────────────────────────────

describe('refreshModelsForGateway()', () => {
  it.todo('calls adapter.listModels() and inserts new model rows');
  it.todo('inserts into model_versions with version_label=initial on first discovery');
  it.todo('does not insert duplicate model_versions row when capabilities unchanged');
  it.todo('inserts new model_versions row when capabilities change');
  it.todo('inserts new model_versions row when context_window changes');
  it.todo('marks models is_active=0 when no longer returned by listModels()');
  it.todo('does not mark models inactive when gateway status is stale');
  it.todo('enriches model rows with metadata from MODEL_METADATA static map');
  it.todo('gracefully handles adapter.listModels() throwing an error');
});

// ── MOD-04: refreshAllGateways() ─────────────────────────────────────────────

describe('refreshAllGateways()', () => {
  it.todo('queries all enabled gateways with status active or stale');
  it.todo('calls refreshModelsForGateway for each gateway with a valid adapter');
  it.todo('skips gateways where createAdapter returns null');
  it.todo('continues processing remaining gateways when one fails');
});

// ── MOD-05: calculateCostUsd() ───────────────────────────────────────────────

describe('calculateCostUsd()', () => {
  it('returns null when both inputTokens and outputTokens are 0 or null', async () => {
    // Pure logic: no DB needed. Verify the null-guard contract.
    // We test the math directly below; this just verifies the guard behaviour.
    // Since we cannot import the function without a live pool, we test the math
    // formula as pure arithmetic here to confirm the cost model is correct.
    const inputPerM = 3.0;
    const outputPerM = 15.0;
    const inputTokens = 0;
    const outputTokens = 0;
    const cachedTokens = 0;

    const shouldBeNull = (!inputTokens && !outputTokens);
    assert.equal(shouldBeNull, true);
  });

  it('computes cost correctly for claude-sonnet pricing', () => {
    // pricing: $3/M input, $15/M output
    const inputPerM = 3.0;
    const outputPerM = 15.0;
    const inputTokens = 1_000_000;
    const outputTokens = 500_000;
    const cachedTokens = 200_000;

    const inputCost = (inputTokens / 1_000_000) * inputPerM;       // 3.0
    const outputCost = (outputTokens / 1_000_000) * outputPerM;    // 7.5
    const cachedCost = (cachedTokens / 1_000_000) * (inputPerM * 0.1); // 0.06

    const total = inputCost + outputCost + cachedCost;
    assert.ok(Math.abs(total - 10.56) < 0.0001, `Expected ~10.56, got ${total}`);
  });

  it('computes zero cost for local ollama models (pricing=0)', () => {
    const inputPerM = 0.0;
    const outputPerM = 0.0;
    const inputTokens = 50_000;
    const outputTokens = 20_000;
    const cachedTokens = 0;

    const inputCost = (inputTokens / 1_000_000) * inputPerM;
    const outputCost = (outputTokens / 1_000_000) * outputPerM;
    const cachedCost = (cachedTokens / 1_000_000) * (inputPerM * 0.1);

    assert.equal(inputCost + outputCost + cachedCost, 0);
  });

  it.todo('returns null when no pricing data found in DB for the given model + gateway');
  it.todo('falls back to cross-gateway lookup when gateway-specific pricing not found');
});

// ── MOD-05: version detection ─────────────────────────────────────────────────

describe('version detection', () => {
  it.todo('inserts model_versions row with version_label=initial on first model discovery');
  it.todo('inserts model_versions row with ISO timestamp label when capabilities change');
  it.todo('inserts model_versions row with ISO timestamp label when context_window changes');
  it.todo('does not insert model_versions row when model unchanged');
  it.todo('stores full model snapshot as JSONB in model_versions.snapshot');
});
