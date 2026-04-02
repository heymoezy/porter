/**
 * Tests for skill-selector.ts — Runtime Skill Selection Service
 *
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/skill-selector.test.ts
 *
 * Tests are split into two groups:
 *   1. scoreSkill — pure function, no DB/FS mocking needed
 *   2. selectSkills — async, tests shape/guard behavior
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── scoreSkill pure function tests ──────────────────────────────────────────

describe('scoreSkill', () => {
  it('RTS-02: scores > 0 when task words match description/tags/name', async () => {
    const { scoreSkill } = await import('../services/skill-selector.js');
    const taskWords = new Set(['chat', 'orchestration', 'help']);
    const skill = {
      name: 'chat-orchestrator',
      description: 'Orchestrates multi-turn chat conversations',
      tags: ['chat', 'conversation'],
      triggers: [],
    };
    const result = scoreSkill(taskWords, skill);
    assert.ok(result.score > 0, `Expected score > 0, got ${result.score}`);
    assert.ok(result.reason.includes('matched'), `Expected reason to include "matched", got: ${result.reason}`);
  });

  it('scoreSkill returns 0 when no keywords match', async () => {
    const { scoreSkill } = await import('../services/skill-selector.js');
    const taskWords = new Set(['deploy', 'kubernetes', 'cluster']);
    const skill = {
      name: 'chat-orchestrator',
      description: 'Orchestrates multi-turn chat conversations',
      tags: ['chat', 'conversation'],
      triggers: [],
    };
    const result = scoreSkill(taskWords, skill);
    assert.equal(result.score, 0);
    assert.equal(result.reason, 'no match');
  });

  it('tags contribute more weight than description words', async () => {
    const { scoreSkill } = await import('../services/skill-selector.js');
    // Word appears in both description and tags — tag match should add more
    const taskWords = new Set(['writing']);
    const skillWithTag = {
      name: 'copywriter',
      description: 'Handles writing tasks',
      tags: ['writing'],
      triggers: [],
    };
    const skillWithDesc = {
      name: 'copywriter',
      description: 'Handles writing tasks',
      tags: [],
      triggers: [],
    };
    const withTag = scoreSkill(taskWords, skillWithTag);
    const withDesc = scoreSkill(taskWords, skillWithDesc);
    assert.ok(withTag.score > withDesc.score, `Tag match (${withTag.score}) should beat desc match (${withDesc.score})`);
  });
});

// ── selectSkills guard behavior tests ───────────────────────────────────────

describe('selectSkills', () => {
  it('RTS-05: undefined agentId returns empty result', async () => {
    const { selectSkills } = await import('../services/skill-selector.js');
    const result = await selectSkills(undefined, 'some task text');
    assert.deepEqual(result, { candidates: [], selected: [], promptBlock: '' });
  });

  it('RTS-05: empty string agentId returns empty result', async () => {
    const { selectSkills } = await import('../services/skill-selector.js');
    const result = await selectSkills('', 'some task text');
    assert.deepEqual(result, { candidates: [], selected: [], promptBlock: '' });
  });
});

// ── SkillSelectionResult interface shape tests ───────────────────────────────

describe('SkillSelectionResult shape', () => {
  it('result has candidates, selected, and promptBlock fields', async () => {
    const { selectSkills } = await import('../services/skill-selector.js');
    const result = await selectSkills(undefined, 'task text');
    assert.ok('candidates' in result, 'result must have candidates field');
    assert.ok('selected' in result, 'result must have selected field');
    assert.ok('promptBlock' in result, 'result must have promptBlock field');
    assert.ok(Array.isArray(result.candidates), 'candidates must be an array');
    assert.ok(Array.isArray(result.selected), 'selected must be an array');
    assert.equal(typeof result.promptBlock, 'string', 'promptBlock must be a string');
  });
});
