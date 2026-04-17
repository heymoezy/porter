/**
 * Bridge Dispatch Queues — Claude CLI concurrency control
 *
 * Single PQueue with concurrency=1 (CLI subprocess).
 *
 * Phase 20: Smart Routing Engine (RT-04)
 */

import PQueue from 'p-queue';

/** Module-level singleton queue — concurrency 1 for CLI subprocess */
const _queue = new PQueue({ concurrency: 1 });

/**
 * Get the concurrency-limited dispatch queue.
 * Always returns the same singleton queue (concurrency=1 for CLI).
 */
export function getQueue(_gatewayType?: string): PQueue {
  return _queue;
}

/**
 * Get stats for the dispatch queue — useful for admin/debug endpoints.
 */
export function getQueueStats(): Record<string, { pending: number; size: number; concurrency: number }> {
  return {
    claude_cli: {
      pending: _queue.pending,
      size: _queue.size,
      concurrency: (_queue as unknown as { concurrency: number }).concurrency,
    },
  };
}
