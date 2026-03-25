/**
 * Tests for admin/bridge.ts — Bridge Admin Surface
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/admin-bridge.test.ts
 */
import { describe, it } from 'node:test';

// ADM-01: GET /api/admin/bridge
describe('GET /api/admin/bridge', () => {
  it.todo('returns gateway array with id, type, name, status, priority fields');
  it.todo('includes model_count as integer per gateway');
  it.todo('includes circuit_state from in-memory breaker registry');
  it.todo('includes status_indicator derived from gateway status');
  it.todo('includes briefing_slot field (initially null)');
  it.todo('includes summary with total_gateways, healthy, degraded, unavailable counts');
});

// ADM-02: GET /api/admin/bridge/models
describe('GET /api/admin/bridge/models', () => {
  it.todo('returns active models joined to their gateway');
  it.todo('includes capability tags, pricing, and benchmark scores per model');
  it.todo('filters by gateway_id query param when provided');
  it.todo('filters by capability query param when provided');
  it.todo('includes summary with total_models count');
});

// ADM-03: GET /api/admin/bridge/dispatch-log
describe('GET /api/admin/bridge/dispatch-log', () => {
  it.todo('returns paginated dispatch entries with default page=1, limit=50');
  it.todo('includes model_name, chosen_reason, estimated_cost_usd, latency_ms per entry');
  it.todo('includes pagination metadata (page, limit, total, pages)');
  it.todo('respects page and limit query params');
  it.todo('filters by gateway_type when provided');
  it.todo('filters by agent_id when provided');
});

// ADM-04: GET /api/admin/bridge/costs
describe('GET /api/admin/bridge/costs', () => {
  it.todo('returns cost aggregates by gateway with COALESCE for null costs');
  it.todo('returns cost aggregates by model');
  it.todo('returns cost aggregates by day');
  it.todo('defaults to 30-day range when no from/to provided');
  it.todo('respects custom from/to date range params');
  it.todo('includes summary with total_cost_usd and total_dispatches');
});

// ADM-05: POST /api/admin/bridge/gateways
describe('POST /api/admin/bridge/gateways', () => {
  it.todo('action=add creates a new gateway row');
  it.todo('action=update modifies an existing gateway');
  it.todo('action=remove deletes gateway by id (cascades credentials and models)');
  it.todo('action=validate returns health check result for gateway');
  it.todo('rejects invalid gateway type');
});

// ADM-06: POST /api/admin/bridge/routing-rules
describe('POST /api/admin/bridge/routing-rules', () => {
  it.todo('action=create inserts routing rule with valid scope and action');
  it.todo('action=update modifies existing rule');
  it.todo('action=delete removes rule by id');
  it.todo('rejects invalid scope value');
  it.todo('rejects invalid action_type value');
  it.todo('action=list returns all routing rules ordered by priority');
});

// ADM-07: SSE event verification
describe('SSE bridge events', () => {
  it.todo('bridge:health events are emitted by health-probe.ts');
  it.todo('bridge:dispatch events are emitted by routing-engine.ts');
  it.todo('bridge:circuit-trip events are emitted by circuit-breaker-registry.ts');
});

// DS-03: Auth enforcement
describe('Auth enforcement (DS-03)', () => {
  it.todo('unauthenticated request to any admin/bridge endpoint returns 401');
  it.todo('non-admin user gets 403 on admin/bridge endpoints');
});
