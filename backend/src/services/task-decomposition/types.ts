/**
 * types.ts — Task Decomposition Engine: Phase 42
 *
 * All TypeScript types for the TDE: task nodes, classification, planning,
 * execution, and joining. Safety constants for circuit-breaker limits.
 */

// ── Status ────────────────────────────────────────────────────────────────────

export type TaskNodeStatus =
  | 'pending'    // waiting for deps or scheduling
  | 'ready'      // all deps satisfied, can execute
  | 'running'    // claimed by executor
  | 'completed'  // done successfully
  | 'failed'     // failed after max retries
  | 'blocked'    // waiting on external resource
  | 'cancelled'; // parent cancelled or replanned

// ── Task Node ─────────────────────────────────────────────────────────────────

export interface TaskNode {
  id: string;                      // UUID primary key
  rootId: string;                  // top-level task (self-referencing for root)
  parentId: string | null;         // immediate parent task_node
  projectId: string | null;        // optional project context
  chatId: string | null;           // chat that triggered this

  // Task definition
  description: string;             // what to do
  taskType: string;                // classify for routing: research, code, review, etc.
  assignedAgentId: string | null;  // which worker executes this

  // DAG structure
  depth: number;                   // 0 = root, 1 = first decomposition, etc.
  dependencies: string[];          // array of task_node IDs that must complete first

  // Execution state
  status: TaskNodeStatus;
  attempt: number;
  maxAttempts: number;

  // Context & results
  context: Record<string, unknown>; // input data from deps/parent
  result: Record<string, unknown> | null; // output when completed
  error: string | null;

  // Budgets
  tokenBudget: number | null;       // max tokens for this task
  tokensUsed: number;

  // Timestamps (epoch seconds)
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ── Classifier ────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  classification: 'simple' | 'complex';
  reason: string;
  estimatedSubtasks?: number;
}

// ── Planner ───────────────────────────────────────────────────────────────────

export interface PlanRequest {
  message: string;           // the user's complex idea
  projectId?: string;        // project context
  chatId?: string;           // originating chat
  availableAgents: Array<{
    id: string;
    name: string;
    role?: string;
    skills?: string[];
  }>;
  maxDepth?: number;         // default 3
}

export interface PlannedTask {
  localId: number;           // local ID within this plan (1-based)
  description: string;       // what this task should do
  deps: number[];            // local IDs of tasks this depends on
  agentRole: string;         // which worker type should handle this
  taskType: string;          // one of: research, code, review, design, test, deploy, communicate
}

export interface PlanResult {
  tasks: PlannedTask[];
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface TaskResult {
  response: string;
  model: string;
  tokens: number;
}

// ── Joiner ────────────────────────────────────────────────────────────────────

export interface JoinResult {
  action: 'synthesized' | 'partial' | 'replan' | 'failed';
  response: string;
  failedTasks?: string[];    // IDs of tasks that failed
  context?: string;          // additional context for replan
}

// ── DAG Statistics ────────────────────────────────────────────────────────────

export interface DAGStats {
  total: number;
  pending: number;
  ready: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  blocked: number;
}

// ── Safety Constants ──────────────────────────────────────────────────────────

/** Maximum depth of subtask nesting (root = 0) */
export const MAX_DEPTH = 3;

/** Maximum tasks per decomposition level */
export const MAX_TASKS_PER_LEVEL = 7;

/** Maximum retry attempts per task */
export const MAX_RETRIES = 3;

/** Maximum concurrent task dispatches */
export const MAX_CONCURRENT = 3;

/** Maximum total token budget across all tasks in a tree */
export const TOKEN_BUDGET = 50000;

/** Timeout for an entire task tree in milliseconds (5 minutes) */
export const TREE_TIMEOUT_MS = 300000;
