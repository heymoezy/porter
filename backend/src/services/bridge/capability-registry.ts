/**
 * Bridge Service — Gateway Capability Registry
 *
 * Claude CLI capabilities. Single gateway, single set of capabilities.
 */

import type { GatewayType } from './types.js';

// ── Capability record type ────────────────────────────────────────────────────

export interface GatewayCapabilityRecord {
  legacy_tags: string[];
  strengths: Array<'reasoning' | 'coding' | 'analysis' | 'writing' | 'vision'>;
  cost_tier: 'premium' | 'standard' | 'budget';
  context_window: number;
  tool_support: 'full' | 'limited' | 'none';
  agentic: boolean;
}

// ── Registry ─────────────────────────────────────────────────────────────────

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
    legacy_tags: ['chat', 'one_shot', 'no_tools'],
    strengths: ['reasoning', 'coding', 'analysis'],
    cost_tier: 'premium',
    context_window: 200_000,
    tool_support: 'none',
    agentic: false,
  },
};

// ── Helper functions ──────────────────────────────────────────────────────────

export function normalizeCapabilities(raw: unknown): GatewayCapabilityRecord | null {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if ('cost_tier' in obj) {
      return obj as unknown as GatewayCapabilityRecord;
    }
  }
  return null;
}

export function getLegacyTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  const rec = normalizeCapabilities(raw);
  return rec?.legacy_tags ?? [];
}

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
