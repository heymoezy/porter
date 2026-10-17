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

  it('ignores the backend hint: every stream routes through Bridge', async () => {
    for (const hint of [undefined, 'auto', 'ollama', 'anything']) {
      const backend = await selectStreamBackend('test', hint);
      assert.equal(backend.name, 'claude_cli');
    }
  });
});
