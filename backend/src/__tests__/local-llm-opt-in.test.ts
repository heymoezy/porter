/**
 * The local_llm gateway is OPT-IN ONLY: a 4B model on a shared CPU must never become the fallback
 * for callers who did not ask for it (Tom's chats, digests, Recall). It may only lead a chain it
 * was named for, and a job sent to it never fails over to a paid gateway.
 *
 * Run: npx tsx --test src/__tests__/local-llm-opt-in.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderChain } from '../services/bridge/failover.js';

const ALL = ['claude_cli', 'codex_cli', 'antigravity_cli', 'grok_cli', 'local_llm'];

describe('local_llm is opt-in only', () => {
  it('is not in a chain nobody pointed at it', () => {
    assert.deepEqual(orderChain(ALL), ['claude_cli', 'codex_cli', 'antigravity_cli', 'grok_cli']);
  });
  it('is not a fallback behind another forced gateway', () => {
    assert.ok(!orderChain(ALL, 'codex_cli').includes('local_llm'));
  });
  it('a job sent to it runs there alone: no silent fallback to a paid gateway', () => {
    assert.deepEqual(orderChain(ALL, 'local_llm'), ['local_llm']);
  });
  it('CONTROL: a forced premium gateway still keeps its fallbacks', () => {
    assert.deepEqual(orderChain(ALL, 'codex_cli'), ['codex_cli', 'claude_cli', 'antigravity_cli', 'grok_cli']);
  });
  it('an env chain cannot put it back in by listing it', () => {
    const prev = process.env.PORTER_BRIDGE_FALLBACK_CHAIN;
    process.env.PORTER_BRIDGE_FALLBACK_CHAIN = 'local_llm,claude_cli';
    try {
      assert.deepEqual(orderChain(ALL), ['claude_cli']);
    } finally {
      if (prev === undefined) delete process.env.PORTER_BRIDGE_FALLBACK_CHAIN; else process.env.PORTER_BRIDGE_FALLBACK_CHAIN = prev;
    }
  });
});
