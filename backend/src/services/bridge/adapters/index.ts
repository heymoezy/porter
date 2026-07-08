/**
 * Bridge Adapters — barrel export
 *
 * Adapters: Claude CLI (full agentic, tool-using), Codex CLI (chat one-shot),
 * Antigravity CLI (chat one-shot via `agy --print`).
 */

export { ClaudeCLIAdapter } from './claude-cli.js';
export { CodexCLIAdapter } from './codex-cli.js';
export { AntigravityCLIAdapter } from './antigravity-cli.js';
export { GrokCLIAdapter } from './grok-cli.js';
export { StreamNormalizer } from '../stream-normalizer.js';

// ── Dynamic instantiation ────────────────────────────────────────────────────

import type { GatewayRow, GatewayAdapter } from '../types.js';
import { ClaudeCLIAdapter } from './claude-cli.js';
import { CodexCLIAdapter } from './codex-cli.js';
import { AntigravityCLIAdapter } from './antigravity-cli.js';
import { GrokCLIAdapter } from './grok-cli.js';

export const ADAPTER_MAP: Record<string, new (row: GatewayRow) => GatewayAdapter> = {
  claude_cli: ClaudeCLIAdapter,
  codex_cli: CodexCLIAdapter,
  antigravity_cli: AntigravityCLIAdapter,
  grok_cli: GrokCLIAdapter,
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
