/**
 * Bridge Dispatch Queues — Per-gateway concurrency control
 *
 * Module-level PQueue singleton per gateway type.
 * CLI gateways (codex_cli, claude_cli, gemini_cli) get concurrency=1.
 * HTTP gateways (ollama, openclaw, openai_compat) get concurrency=3.
 *
 * Phase 20: Smart Routing Engine (RT-04)
 */

import PQueue from 'p-queue';

const CLI_TYPES = new Set(['codex_cli', 'claude_cli', 'gemini_cli']);

const DEFAULT_CONCURRENCY: Record<string, number> = {
  ollama: 3,
  openclaw: 3,
  codex_cli: 1,
  claude_cli: 1,
  gemini_cli: 1,
  openai_compat: 3,
};

/** Module-level singleton map — one PQueue per gateway type */
const _queues = new Map<string, PQueue>();

/**
 * Get or create a concurrency-limited queue for the given gateway type.
 * CLI gateways default to concurrency=1, HTTP gateways to concurrency=3.
 */
export function getQueue(gatewayType: string): PQueue {
  if (!_queues.has(gatewayType)) {
    _queues.set(gatewayType, new PQueue({
      concurrency: DEFAULT_CONCURRENCY[gatewayType] ?? (CLI_TYPES.has(gatewayType) ? 1 : 2),
    }));
  }
  return _queues.get(gatewayType)!;
}

/**
 * Get stats for all active queues — useful for admin/debug endpoints.
 * Returns pending + size for each gateway type that has a queue.
 */
export function getQueueStats(): Record<string, { pending: number; size: number; concurrency: number }> {
  const stats: Record<string, { pending: number; size: number; concurrency: number }> = {};
  for (const [type, queue] of _queues) {
    stats[type] = {
      pending: queue.pending,
      size: queue.size,
      concurrency: (queue as unknown as { concurrency: number }).concurrency,
    };
  }
  return stats;
}
