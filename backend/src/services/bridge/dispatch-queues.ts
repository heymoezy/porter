/**
 * Bridge Dispatch Queues — concurrency control for CLI subprocess dispatch.
 *
 * ⚠️ WHAT THIS WAS UNTIL 2026-09-01, AND WHY IT MATTERED. One module-level
 * PQueue with concurrency 1, and an accessor `getQueue(_gatewayType?)` that
 * TOOK the gateway type and ignored it — the underscore is the author saying
 * the intent existed. So claude_cli, codex_cli, grok_cli and antigravity_cli
 * all shared a single lane and every model call on this box ran strictly one
 * at a time. A fan-out to codex and grok "in parallel" ran sequentially.
 * `routing-engine.ts` even documents the method as "Dispatch through
 * per-gateway concurrency queue"; it never was one.
 *
 * Worse, `WORKSPACE_TIMEOUT_MS` is 12 hours. On a single serial queue one
 * workspace job could block every model call on the machine — Tom's chat
 * turns, ops-chat, Recall, an interactive question — for half a day.
 *
 * ⚠️ AND WHY IT IS NOT SIMPLY "RAISE THE NUMBER". Removing the serial job
 * queue in 1d04e859 is what let two personas on thirty-second heartbeats
 * run ~285 Claude CLI cold boots an hour on Opus for 58 hours
 * (`_ops/incidents/2026-08-14-token-burn`). Serialisation was masking a
 * runaway. So the global in-flight cap below is not decoration: it is the
 * thing that makes per-gateway lanes safe on a 4 vCPU box.
 *
 * THE SHAPE, and it is copied rather than invented — `task-executor.ts`
 * already keeps a `Map<string, PQueue>` for exactly this reason 40 lines away.
 *
 *   lane queue   per (gateway, lane), concurrency 1  → ordering within a lane
 *   global gate  concurrency PORTER_BRIDGE_MAX_INFLIGHT (3) → protects the box
 *
 * A dispatch takes a lane slot, then waits for a global slot. An interactive
 * turn therefore never queues behind a 12-hour workspace job on the same
 * gateway, and the machine still cannot run more than N subprocesses at once.
 */

import PQueue from 'p-queue';

/**
 * `interactive` — someone is waiting: a chat turn, a delegated question, a
 * heartbeat tick. Bounded by the adapter's 5 minute TIMEOUT_MS.
 * `batch` — a workspace job, bounded by WORKSPACE_TIMEOUT_MS (12 hours).
 *
 * Derived at the call site from `req.workspace`, which is the same field
 * `resolveCwd()` uses to choose the ceiling. One signal, not two.
 */
export type DispatchLane = 'interactive' | 'batch';

/** Per (gateway, lane). Concurrency 1: ordering within a lane is still wanted. */
const _queues = new Map<string, PQueue>();

/**
 * ⚠️ THE GUARDRAIL. Total CLI subprocesses in flight across every gateway and
 * lane. 3 on a 4 vCPU box with 15GB, where an openclaw process runs ~270MB.
 * Raising this is a decision about the machine, not about throughput.
 */
export const MAX_INFLIGHT = Math.max(1, Number(process.env.PORTER_BRIDGE_MAX_INFLIGHT || 3));
const _global = new PQueue({ concurrency: MAX_INFLIGHT });

function keyFor(gatewayType: string, lane: DispatchLane): string {
  return `${gatewayType || 'unknown'}:${lane}`;
}

/** The queue for one gateway and lane. Created on first use, like getTaskQueue. */
export function getQueue(gatewayType = 'claude_cli', lane: DispatchLane = 'batch'): PQueue {
  const k = keyFor(gatewayType, lane);
  let q = _queues.get(k);
  if (!q) { q = new PQueue({ concurrency: 1 }); _queues.set(k, q); }
  return q;
}

/**
 * Run one dispatch: a slot in its own lane, then a slot in the global gate.
 *
 * ⚠️ Callers use THIS, not `getQueue(...).add(...)`. Going through the lane
 * queue alone would skip the global cap, which is the whole guardrail.
 */
export function runDispatch<T>(
  gatewayType: string,
  lane: DispatchLane,
  fn: () => Promise<T>,
): Promise<T> {
  return getQueue(gatewayType, lane).add(() => _global.add(fn)) as Promise<T>;
}

/** Stats for admin/debug. One row per live (gateway, lane), plus the global gate. */
export function getQueueStats(): Record<string, { pending: number; size: number; concurrency: number }> {
  const out: Record<string, { pending: number; size: number; concurrency: number }> = {
    _global: { pending: _global.pending, size: _global.size, concurrency: MAX_INFLIGHT },
  };
  for (const [k, q] of _queues) {
    out[k] = { pending: q.pending, size: q.size, concurrency: (q as unknown as { concurrency: number }).concurrency };
  }
  return out;
}
