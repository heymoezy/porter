/**
 * Tests for session_routing_context — Per-Turn Routing Records
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/session-routing.test.ts
 */
import { describe, it } from 'node:test';

// RT-05: Session routing context per conversation turn
describe('RoutingEngine.recordSessionTurn()', () => {
  it.todo('inserts a row into session_routing_context with chat_id and message_sequence');
  it.todo('links to bridge_dispatch_log via dispatch_log_id');
  it.todo('skips insert when ctx.chatId is undefined');
  it.todo('never blocks dispatch on recording failure');
});
