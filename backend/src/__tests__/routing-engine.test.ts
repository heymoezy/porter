/**
 * Tests for routing-engine.ts — Smart Routing Engine
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/routing-engine.test.ts
 */
import { describe, it } from 'node:test';

// RT-01: DB-driven gateway selection
describe('RoutingEngine.select()', () => {
  it.todo('selects an active gateway from DB when multiple are available');
  it.todo('throws when no active gateways exist');
  it.todo('filters out gateways with enabled=0');
  it.todo('prefers higher-priority (lower number) gateways for complex messages');
  it.todo('prefers local gateways (ollama) for simple messages');
});

// RT-02: Routing rules evaluation
describe('RoutingEngine.evaluateRules()', () => {
  it.todo('returns matching force_model rule for specific agent');
  it.todo('returns matching block_gateway rule for specific gateway');
  it.todo('returns global rule when no scope-specific rule matches');
  it.todo('returns null when no rules match context');
  it.todo('evaluates rules in priority order (lowest number first)');
  it.todo('skips disabled rules');
});

// RT-04: Per-gateway dispatch queue
describe('RoutingEngine.dispatchWithQueue()', () => {
  it.todo('dispatches through PQueue for the correct gateway type');
  it.todo('CLI gateways enforce concurrency=1');
  it.todo('HTTP gateways enforce concurrency=3');
});
