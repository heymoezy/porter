/**
 * Bridge Service — Gateway Capability Registry
 *
 * Structured capability records for all gateway types.
 * Replaces flat string[] capabilities with queryable typed objects.
 *
 * Phase 40 (GWC-01): Foundation for dispatch routing and tool filtering.
 */

import type { GatewayType } from './types.js';

// ── Capability record type ────────────────────────────────────────────────────

export interface GatewayCapabilityRecord {
  /** Backward-compatible flat tag array (legacy consumers only) */
  legacy_tags: string[];
  /** Closed set: reasoning | coding | analysis | writing | vision */
  strengths: Array<'reasoning' | 'coding' | 'analysis' | 'writing' | 'vision'>;
  /** Relative cost classification */
  cost_tier: 'premium' | 'standard' | 'budget';
  /** Maximum context window in tokens */
  context_window: number;
  /** Tool use support level */
  tool_support: 'full' | 'limited' | 'none';
  /** Whether this gateway can run as an autonomous agent loop */
  agentic: boolean;
}

// ── Static registry for all 6 gateway types ───────────────────────────────────

export const GATEWAY_CAPABILITY_REGISTRY: Record<GatewayType, GatewayCapabilityRecord> = {
  claude_cli: {
    legacy_tags: ['chat', 'code', 'streaming', 'tool_use'],
    strengths: ['reasoning', 'coding', 'analysis', 'writing'],
    cost_tier: 'premium',
    context_window: 200_000,
    tool_support: 'full',
    agentic: true,
  },
  codex_cli: {
    legacy_tags: ['code', 'streaming'],
    strengths: ['coding'],
    cost_tier: 'premium',
    context_window: 128_000,
    tool_support: 'full',
    agentic: true,
  },
  gemini_cli: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['reasoning', 'coding', 'analysis', 'writing'],
    cost_tier: 'standard',
    context_window: 1_000_000,
    tool_support: 'full',
    agentic: true,
  },
  openclaw: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['reasoning', 'coding', 'analysis'],
    cost_tier: 'premium',
    context_window: 128_000,
    tool_support: 'full',
    agentic: true,
  },
  ollama: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['coding'],
    cost_tier: 'budget',
    context_window: 32_768,
    tool_support: 'limited',
    agentic: false,
  },
  openai_compat: {
    legacy_tags: ['chat', 'code', 'streaming'],
    strengths: ['coding', 'analysis'],
    cost_tier: 'standard',
    context_window: 128_000,
    tool_support: 'full',
    agentic: false,
  },
  anthropic_api: {
    legacy_tags: ['chat', 'code', 'streaming', 'tool_use', 'web_search'],
    strengths: ['reasoning', 'coding', 'analysis', 'writing'],
    cost_tier: 'premium',
    context_window: 200_000,
    tool_support: 'full',
    agentic: true,
  },
};

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * If `raw` is a structured capability object (has `cost_tier`), return it typed.
 * If `raw` is a flat array or null/undefined, return null.
 */
export function normalizeCapabilities(raw: unknown): GatewayCapabilityRecord | null {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if ('cost_tier' in obj) {
      return obj as unknown as GatewayCapabilityRecord;
    }
  }
  return null;
}

/**
 * Returns flat legacy_tags string[] regardless of whether capabilities is stored
 * as the old string[] or the new structured object.
 *
 * Safe for all callers that still expect string[].
 */
export function getLegacyTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw as string[];
  }
  const rec = normalizeCapabilities(raw);
  return rec?.legacy_tags ?? [];
}

/**
 * Filter a tools array based on the gateway's tool_support level.
 *
 * - 'none'    → empty array (gateway cannot use tools)
 * - 'limited' → only read_file and list_directory
 * - 'full'    → all tools unchanged
 *
 * Uses a generic type parameter so it works with any tools array shape
 * that has a `function.name` field (OpenAI tool format).
 */
export function filterToolsBySupport<T extends { function: { name: string } }>(
  tools: T[],
  support: 'full' | 'limited' | 'none'
): T[] {
  if (support === 'none') return [];
  if (support === 'limited') {
    const allowed = new Set(['read_file', 'list_directory']);
    return tools.filter(t => allowed.has(t.function.name));
  }
  return tools;
}
