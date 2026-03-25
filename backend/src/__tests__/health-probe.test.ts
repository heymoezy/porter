/**
 * Tests for health-probe.ts — Background health monitoring
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/health-probe.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the testable function — takes dependency injections
import { runHealthProbeWithDeps } from '../services/bridge/health-probe.js';
import type { HealthProbeDeps } from '../services/bridge/health-probe.js';

// ── Helper to build a mock gateway DB row ─────────────────────────────────────

function makeGatewayRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gw-test-1',
    type: 'ollama',
    name: 'Local Ollama',
    url: 'http://127.0.0.1:11434',
    auth_method: 'none',
    status: 'active',
    source: 'auto_detected',
    priority: 1,
    capabilities: [],
    metadata: {},
    enabled: 1,
    masked_display: 'http://127.0.0.1:11434',
    created_at: null,
    updated_at: null,
    last_health_at: null,
    ...overrides,
  };
}

// ── Helper to build default mock dependencies ─────────────────────────────────

function makeDeps(overrides: Partial<HealthProbeDeps> = {}): HealthProbeDeps & {
  queryCalls: Array<[string, unknown[]]>;
  sseEmitted: Array<[string, Record<string, unknown>]>;
} {
  const queryCalls: Array<[string, unknown[]]> = [];
  const sseEmitted: Array<[string, Record<string, unknown>]> = [];

  return {
    queryAll: async () => [],
    queryUpdate: async (sql: string, params: unknown[]) => {
      queryCalls.push([sql, params]);
    },
    createAdapter: () => ({
      health: async () => ({ healthy: true, latencyMs: 100 }),
    } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    getBreakerState: () => null,
    emitSSE: async (eventType: string, data: Record<string, unknown>) => {
      sseEmitted.push([eventType, data]);
    },
    queryCalls,
    sseEmitted,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('runHealthProbeWithDeps()', () => {
  it('queries enabled gateways only (enabled = 1)', async () => {
    let capturedSql = '';
    const deps = makeDeps({
      queryAll: async (sql: string) => {
        capturedSql = sql;
        return [];
      },
    });

    await runHealthProbeWithDeps(deps);

    assert.ok(capturedSql.includes('enabled = 1'), `Query should filter enabled=1, got: ${capturedSql}`);
  });

  it('sets status to active for healthy gateway with latencyMs <= 5000', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => ({
        health: async () => ({ healthy: true, latencyMs: 100 }),
      } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    });

    await runHealthProbeWithDeps(deps);

    const updateCall = (deps as ReturnType<typeof makeDeps>).queryCalls[0];
    assert.ok(updateCall, 'queryUpdate was called');
    assert.equal(updateCall[1][0], 'active', `Expected status 'active', got '${updateCall[1][0]}'`);
  });

  it('sets status to stale for healthy gateway with latencyMs > 5000', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => ({
        health: async () => ({ healthy: true, latencyMs: 6000 }),
      } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    });

    await runHealthProbeWithDeps(deps);

    const updateCall = (deps as ReturnType<typeof makeDeps>).queryCalls[0];
    assert.ok(updateCall, 'queryUpdate was called');
    assert.equal(updateCall[1][0], 'stale', `Expected status 'stale', got '${updateCall[1][0]}'`);
  });

  it('sets status to unavailable for unhealthy gateway', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => ({
        health: async () => ({ healthy: false, error: 'connection refused' }),
      } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    });

    await runHealthProbeWithDeps(deps);

    const updateCall = (deps as ReturnType<typeof makeDeps>).queryCalls[0];
    assert.ok(updateCall, 'queryUpdate was called');
    assert.equal(updateCall[1][0], 'unavailable', `Expected status 'unavailable', got '${updateCall[1][0]}'`);
  });

  it('emits bridge:health SSE event when status changes (active -> unavailable)', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => ({
        health: async () => ({ healthy: false, error: 'down' }),
      } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    });

    await runHealthProbeWithDeps(deps);

    const sse = (deps as ReturnType<typeof makeDeps>).sseEmitted;
    assert.equal(sse.length, 1, 'emitSSE called once on status change');
    const [eventType, eventData] = sse[0];
    assert.equal(eventType, 'bridge:health');
    assert.equal(eventData.old_status, 'active');
    assert.equal(eventData.new_status, 'unavailable');
    assert.equal(eventData.gateway_id, 'gw-test-1');
  });

  it('does NOT emit SSE when status does not change', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => ({
        health: async () => ({ healthy: true, latencyMs: 100 }),
      } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    });

    await runHealthProbeWithDeps(deps);

    const sse = (deps as ReturnType<typeof makeDeps>).sseEmitted;
    assert.equal(sse.length, 0, 'emitSSE should NOT be called when status unchanged');
  });

  it('updates circuit_state column from getBreakerState', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      getBreakerState: () => 'open',
    });

    await runHealthProbeWithDeps(deps);

    const updateCall = (deps as ReturnType<typeof makeDeps>).queryCalls[0];
    assert.ok(updateCall, 'queryUpdate was called');
    assert.equal(updateCall[1][1], 'open', `Expected circuit_state 'open', got '${updateCall[1][1]}'`);
  });

  it('defaults circuit_state to closed when getBreakerState returns null', async () => {
    const row = makeGatewayRow({ status: 'active' });
    const deps = makeDeps({
      queryAll: async () => [row],
      getBreakerState: () => null,
    });

    await runHealthProbeWithDeps(deps);

    const updateCall = (deps as ReturnType<typeof makeDeps>).queryCalls[0];
    assert.ok(updateCall, 'queryUpdate was called');
    assert.equal(updateCall[1][1], 'closed', `Expected circuit_state 'closed' when null, got '${updateCall[1][1]}'`);
  });

  it('continues probing other gateways when one fails with an error', async () => {
    const row1 = makeGatewayRow({ id: 'gw-fail', status: 'active' });
    const row2 = makeGatewayRow({ id: 'gw-ok', status: 'active' });

    let callCount = 0;
    const deps = makeDeps({
      queryAll: async () => [row1, row2],
      createAdapter: () => {
        const localCount = ++callCount;
        return {
          health: async () => {
            if (localCount === 1) throw new Error('adapter.health() exploded');
            return { healthy: true, latencyMs: 100 };
          },
        } as unknown as ReturnType<HealthProbeDeps['createAdapter']>;
      },
    });

    // Should not throw even though first gateway fails
    await assert.doesNotReject(async () => runHealthProbeWithDeps(deps));

    // Second gateway should still be updated
    const queryCalls = (deps as ReturnType<typeof makeDeps>).queryCalls;
    assert.ok(queryCalls.length >= 1, 'At least one gateway was updated despite first failure');
  });

  it('skips gateway when createAdapter returns null (unknown type)', async () => {
    const row = makeGatewayRow({ type: 'unknown_type' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => null,
    });

    await runHealthProbeWithDeps(deps);

    const queryCalls = (deps as ReturnType<typeof makeDeps>).queryCalls;
    assert.equal(queryCalls.length, 0, 'Should not queryUpdate when adapter is null');
  });

  it('includes gateway_type and latency_ms in SSE event data', async () => {
    const row = makeGatewayRow({ id: 'gw-1', type: 'ollama', status: 'stale' });
    const deps = makeDeps({
      queryAll: async () => [row],
      createAdapter: () => ({
        health: async () => ({ healthy: true, latencyMs: 100 }),
      } as unknown as ReturnType<HealthProbeDeps['createAdapter']>),
    });

    await runHealthProbeWithDeps(deps);

    const sse = (deps as ReturnType<typeof makeDeps>).sseEmitted;
    assert.equal(sse.length, 1, 'emitSSE called on status change stale->active');
    const [, eventData] = sse[0];
    assert.equal(eventData.gateway_type, 'ollama');
    assert.equal(eventData.latency_ms, 100);
  });
});
