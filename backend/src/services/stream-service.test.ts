/**
 * Unit tests for stream-service.ts (unified Bridge routing)
 * Tests the refactored selectStreamBackend which now delegates to the routing engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectStreamBackend } from './stream-service.js';

describe('selectStreamBackend (unified)', () => {
  it('returns a StreamBackend with name and stream method', async () => {
    const backend = await selectStreamBackend('Hello');
    assert.ok(backend, 'should return a backend');
    assert.equal(typeof backend.name, 'string');
    assert.equal(typeof backend.stream, 'function');
  });

  it('respects ollama hint', async () => {
    const backend = await selectStreamBackend('test', 'ollama');
    assert.equal(backend.name, 'ollama');
  });

  it('respects openclaw hint', async () => {
    const backend = await selectStreamBackend('test', 'openclaw');
    assert.equal(backend.name, 'openclaw');
  });

  it('defaults to auto routing', async () => {
    const backend = await selectStreamBackend('test', 'auto');
    assert.ok(['ollama', 'openclaw', 'auto'].includes(backend.name));
  });
});
