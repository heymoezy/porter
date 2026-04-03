/**
 * delegation-doctrine.ts -- Porter Control Plane: Phase 45
 *
 * Core decision engine for Porter's delegation doctrine. Takes a message and
 * optional context, returns which strategy Porter should use for dispatch:
 *
 *   direct   -- answer directly, no decomposition
 *   delegate -- route to task decomposition engine
 *   parallel -- (reserved) concurrent multi-agent dispatch
 *   escalate -- ambiguous intent, request clarification from user
 *
 * Pure synchronous function. No LLM calls, no side effects. The caller is
 * responsible for logging the decision and routing accordingly.
 */

import { classifyFast } from '../task-decomposition/task-classifier.js';

// -- Types -----------------------------------------------------------------

export type DispatchStrategy = 'direct' | 'delegate' | 'parallel' | 'escalate';

export interface DoctrineDecision {
  strategy: DispatchStrategy;
  reason: string;
  /** Whether the classifier was consulted (false for fast-path decisions) */
  classifierUsed: boolean;
}

// -- Question word set (first-word check) ----------------------------------

const QUESTION_WORDS = new Set([
  'what', 'how', 'why', 'when', 'where', 'who', 'which',
  'is', 'are', 'can', 'do', 'does', 'will', 'should',
]);

// -- Action verb pattern ---------------------------------------------------

const ACTION_VERBS = /\b(create|build|implement|design|analyze|compare|migrate|refactor|deploy|set up|configure)\b/i;

// -- Public API ------------------------------------------------------------

export function decideDoctrine(
  message: string,
  opts?: { hasAgent?: boolean; isDecompositionContext?: boolean },
): DoctrineDecision {
  // 1. Subtasks always execute directly -- no re-decomposition
  if (opts?.isDecompositionContext) {
    return {
      strategy: 'direct',
      reason: 'Already in decomposition context',
      classifierUsed: false,
    };
  }

  // 2. Use classifyFast heuristics
  const fast = classifyFast(message);

  if (fast === 'simple') {
    return {
      strategy: 'direct',
      reason: 'Simple request -- direct answer',
      classifierUsed: true,
    };
  }

  if (fast === 'complex') {
    return {
      strategy: 'delegate',
      reason: 'Complex request -- decomposition',
      classifierUsed: true,
    };
  }

  // 3. Uncertain -- apply additional heuristics
  const firstWord = message.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (QUESTION_WORDS.has(firstWord)) {
    return {
      strategy: 'direct',
      reason: 'Question -- direct answer',
      classifierUsed: true,
    };
  }

  if (message.length > 200 && ACTION_VERBS.test(message)) {
    return {
      strategy: 'delegate',
      reason: 'Action request with detail -- decomposition',
      classifierUsed: true,
    };
  }

  // Default: escalate for clarification
  return {
    strategy: 'escalate',
    reason: 'Ambiguous intent -- requesting clarification',
    classifierUsed: true,
  };
}
