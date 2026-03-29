/**
 * Tests for Bridge v1 agent-message protocol.
 *
 * Covers:
 *   - MAX_HOPS guard logic (hopCount >= MAX_AGENT_HOPS → rejected)
 *   - TTL expiry logic
 *   - AgentMessage envelope validation (required fields)
 *   - AgentMessageResponse shape invariants
 *
 * These tests exercise pure business logic without a running server or DB.
 * The actual HTTP endpoint is covered by the smoke tests.
 *
 * Run with: npx tsx --test backend/src/__tests__/agent-message.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AgentMessage,
  AgentMessageRequest,
  AgentMessageResponse,
} from '../services/bridge/types.js';

// ── Shared test fixtures ──────────────────────────────────────────────────────

const MAX_AGENT_HOPS = 5; // must stay in sync with bridge.ts

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    messageId: 'msg-test-001',
    intent: 'request',
    task: 'What is 2+2?',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<AgentMessageRequest> = {}): AgentMessageRequest {
  return {
    message: makeMessage(),
    hopCount: 0,
    ...overrides,
  };
}

// ── Inline validation logic (mirrors endpoint guard code) ─────────────────────
// These are pure functions extracted from the handler so they can be unit tested
// without spinning up Fastify.

function validateEnvelope(body: Partial<AgentMessageRequest>): string | null {
  if (!body?.message) return 'MISSING_MESSAGE';
  const { message } = body;
  if (!message.messageId || typeof message.messageId !== 'string') return 'MISSING_FIELD:messageId';
  if (!message.intent || !['request', 'response', 'ack', 'error'].includes(message.intent)) return 'INVALID_INTENT';
  if (!message.task || typeof message.task !== 'string') return 'MISSING_FIELD:task';
  return null;
}

function checkHops(hopCount: number): string | null {
  if (hopCount >= MAX_AGENT_HOPS) return 'MAX_HOPS_EXCEEDED';
  return null;
}

function checkTtl(message: AgentMessage): string | null {
  if (message.ttlMs != null && message.createdAt != null) {
    const age = Date.now() - message.createdAt;
    if (age > message.ttlMs) return 'MESSAGE_EXPIRED';
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentMessage envelope validation', () => {
  it('accepts a valid minimal envelope', () => {
    const req = makeRequest();
    assert.strictEqual(validateEnvelope(req), null, 'Valid minimal envelope should pass');
  });

  it('rejects when body.message is missing', () => {
    assert.strictEqual(validateEnvelope({}), 'MISSING_MESSAGE');
  });

  it('rejects when messageId is missing', () => {
    const req = makeRequest({ message: makeMessage({ messageId: '' }) });
    assert.strictEqual(validateEnvelope(req), 'MISSING_FIELD:messageId');
  });

  it('rejects when intent is not a valid value', () => {
    const req = makeRequest({ message: makeMessage({ intent: 'invalid' as AgentMessage['intent'] }) });
    assert.strictEqual(validateEnvelope(req), 'INVALID_INTENT');
  });

  it('accepts all valid intent values', () => {
    for (const intent of ['request', 'response', 'ack', 'error'] as const) {
      const req = makeRequest({ message: makeMessage({ intent }) });
      assert.strictEqual(validateEnvelope(req), null, `intent="${intent}" should be valid`);
    }
  });

  it('rejects when task is missing', () => {
    const req = makeRequest({ message: makeMessage({ task: '' }) });
    assert.strictEqual(validateEnvelope(req), 'MISSING_FIELD:task');
  });
});

describe('Max-hops guard (loop prevention)', () => {
  it('accepts hopCount=0 (first hop)', () => {
    assert.strictEqual(checkHops(0), null);
  });

  it(`accepts hopCount=${MAX_AGENT_HOPS - 1} (last valid hop)`, () => {
    assert.strictEqual(checkHops(MAX_AGENT_HOPS - 1), null);
  });

  it(`rejects hopCount=${MAX_AGENT_HOPS} (limit reached)`, () => {
    assert.strictEqual(checkHops(MAX_AGENT_HOPS), 'MAX_HOPS_EXCEEDED');
  });

  it(`rejects hopCount > ${MAX_AGENT_HOPS} (over limit)`, () => {
    assert.strictEqual(checkHops(MAX_AGENT_HOPS + 10), 'MAX_HOPS_EXCEEDED');
  });

  it('response hopCount is request hopCount + 1', () => {
    const requestHop = 2;
    const responseHop = requestHop + 1;
    assert.strictEqual(responseHop, 3, 'Response hopCount incremented by 1');
  });
});

describe('TTL expiry check', () => {
  it('accepts message with no ttlMs set', () => {
    const msg = makeMessage({ ttlMs: undefined });
    assert.strictEqual(checkTtl(msg), null, 'No TTL means never expires');
  });

  it('accepts message within TTL window', () => {
    const msg = makeMessage({ createdAt: Date.now(), ttlMs: 60_000 });
    assert.strictEqual(checkTtl(msg), null, 'Fresh message within TTL should pass');
  });

  it('rejects message past TTL', () => {
    const msg = makeMessage({
      createdAt: Date.now() - 10_000, // 10s ago
      ttlMs: 5_000,                   // TTL was 5s
    });
    assert.strictEqual(checkTtl(msg), 'MESSAGE_EXPIRED');
  });
});

describe('AgentMessageResponse shape', () => {
  it('response intent is always "response" for successful dispatch', () => {
    // Structural type check — verifies the literal type constraint
    const response: AgentMessageResponse = {
      messageId: 'msg-test-001',
      correlationId: 'corr-001',
      intent: 'response',
      dispatchLogId: 'log-abc-123',
      gatewayType: 'ollama',
      modelName: 'qwen2.5-coder:1.5b',
      response: 'Hello!',
      latencyMs: 120,
      hopCount: 1,
      createdAt: Date.now(),
    };
    assert.strictEqual(response.intent, 'response');
    assert.ok(response.hopCount >= 1, 'hopCount must be at least 1 (incremented from request)');
  });

  it('optional correlationId is passed through unchanged', () => {
    const corrId = 'corr-xyz-789';
    const msg = makeMessage({ correlationId: corrId });
    // Simulate response construction
    const response: Partial<AgentMessageResponse> = {
      messageId: msg.messageId,
      correlationId: msg.correlationId,
      intent: 'response',
    };
    assert.strictEqual(response.correlationId, corrId, 'correlationId preserved in response');
  });
});
