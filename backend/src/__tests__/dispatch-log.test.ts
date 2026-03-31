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

// Bridge v1: agent-message correlation fields in dispatch log
describe('RoutingEngine.logDispatch() — agent-message fields', () => {
  it.todo('records correlation_id when agentMsgCtx.correlationId is provided');
  it.todo('records source_agent and source_gateway from AgentMessageLogContext');
  it.todo('records target_agent and target_gateway from AgentMessageLogContext');
  it.todo('records intent from AgentMessageLogContext');
  it.todo('records reply_to from AgentMessageLogContext');
  it.todo('sets is_agent_message=1 when agentMsgCtx is present, null when absent');
  it.todo('all agent-message fields are null when logDispatch is called without agentMsgCtx');
});
