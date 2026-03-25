/**
 * Tests for bridge_dispatch_log — Dispatch Decision Logging
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/dispatch-log.test.ts
 */
import { describe, it } from 'node:test';

// RT-03: Every routing decision logged
describe('RoutingEngine.logDispatch()', () => {
  it.todo('inserts a row into bridge_dispatch_log with gateway, model, reason');
  it.todo('records alternatives as JSONB array');
  it.todo('records input/output token counts');
  it.todo('records latency_ms');
  it.todo('never blocks dispatch on logging failure');
  it.todo('emits bridge:dispatch SSE event');
});
