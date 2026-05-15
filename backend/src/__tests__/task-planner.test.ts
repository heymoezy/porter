/**
 * Tests for task-planner.ts — TDE Phase 42 Plan 02
 * Uses Node.js built-in test runner (node:test) + tsx for TypeScript support.
 * Run with: npx tsx --test backend/src/__tests__/task-planner.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDAG } from '../services/task-decomposition/task-planner.js';
import type { PlannedTask } from '../services/task-decomposition/types.js';

// ── validateDAG ────────────────────────────────────────────────────────────────

describe('validateDAG()', () => {
  it('rejects plans with 0 tasks', () => {
    const result = validateDAG([]);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('2') || result.error?.includes('task'));
  });

  it('rejects plans with 1 task', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'Do a thing', deps: [], agentRole: 'researcher', taskType: 'research' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, false);
  });

  it('rejects plans with more than 7 tasks', () => {
    const tasks: PlannedTask[] = Array.from({ length: 8 }, (_, i) => ({
      localId: i + 1,
      description: `Task ${i + 1}`,
      deps: [],
      agentRole: 'researcher',
      taskType: 'research',
    }));
    const result = validateDAG(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes('7') || result.error?.toLowerCase().includes('maximum'));
  });

  it('rejects cycles (A depends on B, B depends on A)', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'Task A', deps: [2], agentRole: 'researcher', taskType: 'research' },
      { localId: 2, description: 'Task B', deps: [1], agentRole: 'researcher', taskType: 'research' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.error?.toLowerCase().includes('cycle'));
  });

  it('rejects self-dependencies (task depends on itself)', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'Task A', deps: [1], agentRole: 'researcher', taskType: 'research' },
      { localId: 2, description: 'Task B', deps: [], agentRole: 'researcher', taskType: 'research' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, false);
  });

  it('rejects out-of-range dep references', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'Task A', deps: [], agentRole: 'researcher', taskType: 'research' },
      { localId: 2, description: 'Task B', deps: [99], agentRole: 'researcher', taskType: 'research' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.error?.toLowerCase().includes('dep') || result.error?.includes('99'));
  });

  it('accepts valid DAG with 2 tasks and no dependencies', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'Research the topic', deps: [], agentRole: 'researcher', taskType: 'research' },
      { localId: 2, description: 'Write summary', deps: [], agentRole: 'writer', taskType: 'communicate' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it('accepts valid DAG with dependencies (linear chain)', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'Research', deps: [], agentRole: 'researcher', taskType: 'research' },
      { localId: 2, description: 'Code', deps: [1], agentRole: 'coder', taskType: 'code' },
      { localId: 3, description: 'Review', deps: [2], agentRole: 'reviewer', taskType: 'review' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, true);
  });

  it('accepts valid DAG with 7 tasks (maximum)', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'T1', deps: [], agentRole: 'r', taskType: 'research' },
      { localId: 2, description: 'T2', deps: [], agentRole: 'r', taskType: 'research' },
      { localId: 3, description: 'T3', deps: [1], agentRole: 'r', taskType: 'code' },
      { localId: 4, description: 'T4', deps: [2], agentRole: 'r', taskType: 'code' },
      { localId: 5, description: 'T5', deps: [3, 4], agentRole: 'r', taskType: 'review' },
      { localId: 6, description: 'T6', deps: [5], agentRole: 'r', taskType: 'test' },
      { localId: 7, description: 'T7', deps: [5, 6], agentRole: 'r', taskType: 'deploy' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, true);
  });

  it('rejects 3-task cycle (A→B→C→A)', () => {
    const tasks: PlannedTask[] = [
      { localId: 1, description: 'A', deps: [3], agentRole: 'r', taskType: 'research' },
      { localId: 2, description: 'B', deps: [1], agentRole: 'r', taskType: 'research' },
      { localId: 3, description: 'C', deps: [2], agentRole: 'r', taskType: 'research' },
    ];
    const result = validateDAG(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.error?.toLowerCase().includes('cycle'));
  });
});

// ── planTasks (smoke test — requires live LLM, skip in unit) ──────────────────

describe('planTasks()', () => {
  it.todo('sends planner prompt to routingEngine (single claude_cli gateway since v6.9.0)');
  it.todo('retries with error feedback when first response fails validation');
  it.todo('throws after second invalid response');
  it.todo('parses response stripping markdown code fences');
});

// ── insertTaskTree (requires live DB, skip in unit) ───────────────────────────

describe('insertTaskTree()', () => {
  it.todo('creates root task_node at depth=0 with status=running');
  it.todo('creates subtask task_nodes at depth=1 with status=pending');
  it.todo('maps local dep IDs to UUIDs correctly');
  it.todo('runs entire INSERT in a single transaction');
  it.todo('sets root_id to rootId for all subtasks');
});
