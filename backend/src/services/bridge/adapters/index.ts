/**
 * Bridge Adapters — barrel export
 *
 * Single adapter: Claude CLI. Porter routes all AI dispatch through Claude.
 */

export { ClaudeCLIAdapter } from './claude-cli.js';
export { StreamNormalizer } from '../stream-normalizer.js';

// ── Dynamic instantiation ────────────────────────────────────────────────────

import type { GatewayRow, GatewayAdapter } from '../types.js';
import { ClaudeCLIAdapter } from './claude-cli.js';

export const ADAPTER_MAP: Record<string, new (row: GatewayRow) => GatewayAdapter> = {
  claude_cli: ClaudeCLIAdapter,
};

/**
 * Create an adapter instance from a gateway DB row.
 * Returns null for unknown gateway types.
 */
export function createAdapter(row: GatewayRow): GatewayAdapter | null {
  const Ctor = ADAPTER_MAP[row.type];
  if (!Ctor) return null;
  return new Ctor(row);
}
