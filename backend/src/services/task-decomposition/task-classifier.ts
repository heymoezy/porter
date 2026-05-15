/**
 * task-classifier.ts — Task Decomposition Engine: Phase 42
 *
 * Decides whether a message needs decomposition (complex) or can be answered
 * directly (simple). Two paths:
 *
 *   1. Fast path — pure heuristics, zero LLM calls, handles ~80%+ of messages
 *   2. LLM fallback — Bridge dispatch (claude_cli, single gateway) for ambiguous cases
 *
 * The classifier is a pure input gate: it does NOT call any TDE services.
 * Classifier errors must NEVER block normal chat flow — fail-safe is 'simple'.
 */

import { routingEngine } from '../bridge/routing-engine.js';
import type { ClassificationResult } from './types.js';

// ── Fast-path heuristic ───────────────────────────────────────────────────────

/**
 * Classify a message with pure heuristics (no LLM, no async).
 *
 * Returns:
 *   'simple'    — short, direct, single-step question
 *   'complex'   — clearly multi-step, list-driven, or long
 *   'uncertain' — ambiguous; trigger LLM fallback via classify()
 */
export function classifyFast(message: string): 'simple' | 'complex' | 'uncertain' {
  const words = message.split(/\s+/).filter(Boolean).length;

  // Code block paste — user is providing context, not requesting decomposition
  const hasCodeBlock = (message.match(/```/g) || []).length >= 2;
  if (hasCodeBlock) return 'simple';

  const hasConjunctions = /\b(and then|after that|also|plus|additionally|as well as)\b/i.test(message);
  const hasMultiStep = /\b(first|second|third|step \d|phase|stage|next)\b/i.test(message);
  const hasList = (message.match(/^[-*\d+\.]\s/gm) || []).length >= 2;

  // Simple: short, no multi-step indicators, no lists
  if (words < 25 && !hasConjunctions && !hasMultiStep && !hasList) {
    return 'simple';
  }

  // Complex: long text, explicit multi-step, bulleted list, or long with conjunctions
  if (words > 80 || hasMultiStep || hasList || (words > 40 && hasConjunctions)) {
    return 'complex';
  }

  // Uncertain: everything else — route to LLM for judgment
  return 'uncertain';
}

// ── LLM fallback ──────────────────────────────────────────────────────────────

/**
 * Use the Bridge (single claude_cli gateway since v6.9.0) to classify an ambiguous
 * message. Returns ClassificationResult. On any error, defaults to 'simple' (fail-safe).
 */
export async function classifyWithLLM(message: string): Promise<ClassificationResult> {
  try {
    const decision = await routingEngine.select({ message });

    const prompt = `Classify this task. Respond with JSON only, no explanation, no markdown fences.
{"complexity": "simple or complex", "reason": "one sentence max", "estimated_subtasks": 0}

Rules:
- simple = answerable in a single focused response, no dependencies between steps
- complex = requires multiple sequential or parallel subtasks to complete properly

Task: "${message.slice(0, 500)}"`;

    const result = await routingEngine.dispatchWithQueue(decision, {
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a task complexity classifier. Respond with valid JSON only.',
      temperature: 0,
      maxTokens: 200,
    });

    // Parse JSON response
    const raw = result.response.trim();
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as {
      complexity: string;
      reason: string;
      estimated_subtasks?: number;
    };

    const classification = parsed.complexity === 'complex' ? 'complex' : 'simple';
    return {
      classification,
      reason: parsed.reason ?? 'LLM classification',
      estimatedSubtasks: parsed.estimated_subtasks,
    };
  } catch (err) {
    // Fail-safe: never decompose by accident on classifier errors
    console.warn('[task-classifier] classifyWithLLM failed, defaulting to simple:', err);
    return {
      classification: 'simple',
      reason: 'Classifier error — defaulting to simple (fail-safe)',
    };
  }
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

/**
 * Classify a message and return a ClassificationResult.
 *
 * Fast path (classifyFast) handles most cases synchronously.
 * LLM fallback only for 'uncertain'. Errors are swallowed — classifier
 * failures never block normal chat flow.
 */
export async function classify(message: string): Promise<ClassificationResult> {
  const fast = classifyFast(message);

  if (fast === 'simple') {
    return {
      classification: 'simple',
      reason: 'Fast path: short direct question',
    };
  }

  if (fast === 'complex') {
    return {
      classification: 'complex',
      reason: 'Fast path: multi-step indicators detected',
    };
  }

  // 'uncertain' — delegate to LLM
  return classifyWithLLM(message);
}
