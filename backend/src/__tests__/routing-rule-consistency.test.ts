/**
 * Tests for routing-rule consistency fix (Bridge v1).
 *
 * Before the fix, selectStreamWithFallback() and selectWithFallback() evaluated
 * routing rules but never applied them — force_model, block_gateway, and
 * prefer_local were silently ignored during fallback iteration.
 *
 * These tests cover applyRuleToFallbackOrder() which is now used by both
 * fallback methods to ensure consistent rule application.
 *
 * Run with: npx tsx --test backend/src/__tests__/routing-rule-consistency.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRuleToFallbackOrder } from '../services/bridge/routing-engine.js';
import type { GatewayCandidate } from '../services/bridge/routing-engine.js';
import type { RoutingRuleRow, GatewayRow, GatewayAdapter } from '../services/bridge/types.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeCandidate(type: string, id: string, priority = 1): GatewayCandidate {
  const row: GatewayRow = {
    id,
    type: type as GatewayRow['type'],
    name: type,
    url: null,
    authMethod: 'none',
    status: 'active',
    source: 'auto_detected',
    priority,
    capabilities: [],
    metadata: {},
    enabled: 1,
    maskedDisplay: '***',
    createdAt: null,
    updatedAt: null,
    lastHealthAt: null,
  };
  // Minimal stub adapter — not exercised in these pure ordering tests
  const adapter = {} as GatewayAdapter;
  return { row, adapter };
}

function makeRule(
  action: RoutingRuleRow['action'],
  actionValue: string | null = null,
): RoutingRuleRow {
  return {
    id: 'rule-test-001',
    scope: 'global',
    scopeId: null,
    action,
    actionValue,
    enabled: 1,
    priority: 1,
    description: `test ${action} rule`,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
  };
}

// ── applyRuleToFallbackOrder ──────────────────────────────────────────────────

describe('applyRuleToFallbackOrder()', () => {
  // The pre-fix bug: rules were evaluated but the sorted[] list was never
  // reordered — every stream and non-stream fallback call used capacity-sort
  // only, meaning force_model / block_gateway / prefer_local had no effect.

  it('returns candidates unchanged when rule is null', () => {
    const candidates = [
      makeCandidate('openclaw', 'gw-a', 1),
      makeCandidate('ollama', 'gw-b', 2),
    ];
    const result = applyRuleToFallbackOrder(null, candidates);
    assert.deepStrictEqual(
      result.map(c => c.row.id),
      ['gw-a', 'gw-b'],
      'Order should be unchanged with no rule',
    );
  });

  // ── force_model ──

  it('force_model: moves forced gateway type to front of iteration order', () => {
    // Before fix: openclaw was first (priority=1), force_model for ollama was ignored.
    // After fix: ollama moves to front so it is tried first.
    const candidates = [
      makeCandidate('openclaw', 'gw-openclaw', 1),
      makeCandidate('ollama', 'gw-ollama', 2),
      makeCandidate('gemini_cli', 'gw-gemini', 3),
    ];
    const rule = makeRule('force_model', 'ollama');
    const result = applyRuleToFallbackOrder(rule, candidates);

    assert.strictEqual(result[0].row.type, 'ollama', 'Forced gateway type should be first');
    assert.strictEqual(result.length, candidates.length, 'All candidates should remain (fallback still available)');
    // Non-forced gateways preserved in their original relative order
    const rest = result.slice(1).map(c => c.row.type);
    assert.deepStrictEqual(rest, ['openclaw', 'gemini_cli'], 'Remaining gateways in original order');
  });

  it('force_model with type:model syntax applies model override to forced candidate', () => {
    const candidates = [
      makeCandidate('openclaw', 'gw-openclaw', 1),
      makeCandidate('ollama', 'gw-ollama', 2),
    ];
    const rule = makeRule('force_model', 'ollama:llama3.1:8b');
    const result = applyRuleToFallbackOrder(rule, candidates);

    assert.strictEqual(result[0].row.type, 'ollama', 'Forced gateway type should be first');
    const meta = result[0].row.metadata as Record<string, unknown>;
    assert.strictEqual(meta.default_model, 'llama3.1:8b', 'Model override applied to row metadata');
    // Original candidate row should be unchanged (shallow copy)
    const originalMeta = candidates.find(c => c.row.type === 'ollama')!.row.metadata as Record<string, unknown>;
    assert.strictEqual(originalMeta.default_model, undefined, 'Original candidate row not mutated');
  });

  it('force_model: keeps original order when forced type is unavailable (graceful fallback)', () => {
    const candidates = [
      makeCandidate('openclaw', 'gw-openclaw', 1),
      makeCandidate('ollama', 'gw-ollama', 2),
    ];
    const rule = makeRule('force_model', 'codex_cli'); // not in candidates
    const result = applyRuleToFallbackOrder(rule, candidates);

    assert.deepStrictEqual(
      result.map(c => c.row.id),
      ['gw-openclaw', 'gw-ollama'],
      'Original order preserved when forced type is unavailable',
    );
  });

  // ── block_gateway ──

  it('block_gateway: removes the blocked gateway type entirely', () => {
    const candidates = [
      makeCandidate('openclaw', 'gw-openclaw', 1),
      makeCandidate('ollama', 'gw-ollama', 2),
      makeCandidate('gemini_cli', 'gw-gemini', 3),
    ];
    const rule = makeRule('block_gateway', 'openclaw');
    const result = applyRuleToFallbackOrder(rule, candidates);

    assert.strictEqual(result.length, 2, 'Blocked gateway removed');
    assert.ok(!result.some(c => c.row.type === 'openclaw'), 'openclaw should be absent');
    assert.ok(result.some(c => c.row.type === 'ollama'), 'ollama should be present');
    assert.ok(result.some(c => c.row.type === 'gemini_cli'), 'gemini_cli should be present');
  });

  it('block_gateway: gracefully returns all candidates if block would empty the list', () => {
    // Should never leave the caller with nothing to try
    const candidates = [makeCandidate('openclaw', 'gw-openclaw', 1)];
    const rule = makeRule('block_gateway', 'openclaw');
    const result = applyRuleToFallbackOrder(rule, candidates);

    assert.strictEqual(result.length, 1, 'Returns original candidates to avoid empty fallback list');
    assert.strictEqual(result[0].row.type, 'openclaw');
  });

  // ── prefer_local ──

  it('prefer_local: reorders so local gateway types lead the iteration', () => {
    const candidates = [
      makeCandidate('openclaw', 'gw-openclaw', 1),
      makeCandidate('ollama', 'gw-ollama', 2),
      makeCandidate('codex_cli', 'gw-codex', 3),
      makeCandidate('gemini_cli', 'gw-gemini', 4),
    ];
    const rule = makeRule('prefer_local');
    const result = applyRuleToFallbackOrder(rule, candidates);

    const types = result.map(c => c.row.type);
    const firstNonLocal = types.findIndex(t => !['ollama', 'codex_cli', 'claude_cli', 'gemini_cli'].includes(t));
    const lastLocal = types.reduceRight((acc, t, i) =>
      acc === -1 && ['ollama', 'codex_cli', 'claude_cli', 'gemini_cli'].includes(t) ? i : acc, -1);

    assert.ok(firstNonLocal === -1 || firstNonLocal > lastLocal,
      'All local gateways should appear before all non-local gateways');
    assert.strictEqual(result.length, candidates.length, 'All candidates retained');
  });

  // ── unknown/unhandled actions ──

  it('cap_cost_usd and unknown actions: returns candidates unchanged', () => {
    const candidates = [
      makeCandidate('openclaw', 'gw-a', 1),
      makeCandidate('ollama', 'gw-b', 2),
    ];
    const rule = makeRule('cap_cost_usd', '0.01');
    const result = applyRuleToFallbackOrder(rule, candidates);

    assert.deepStrictEqual(
      result.map(c => c.row.id),
      ['gw-a', 'gw-b'],
      'Order unchanged for cap_cost_usd',
    );
  });
});
