/**
 * Bridge Adapters — barrel export
 *
 * All 5 concrete GatewayAdapter implementations + StreamNormalizer.
 * Import from this file for clean one-line access to any adapter.
 *
 * Usage:
 *   import { OllamaAdapter, StreamNormalizer, createAdapter } from 'services/bridge/adapters';
 */

// HTTP-based adapters
export { OllamaAdapter } from './ollama.js';
export { OpenClawAdapter } from './openclaw.js';

// CLI subprocess adapters
export { CodexCLIAdapter } from './codex-cli.js';
export { ClaudeCLIAdapter } from './claude-cli.js';
export { GeminiCLIAdapter } from './gemini-cli.js';

// Stream normalizer
export { StreamNormalizer } from '../stream-normalizer.js';

// ── Dynamic instantiation helpers ─────────────────────────────────────────────

import type { GatewayRow, GatewayAdapter } from '../types.js';
import { OllamaAdapter } from './ollama.js';
import { OpenClawAdapter } from './openclaw.js';
import { CodexCLIAdapter } from './codex-cli.js';
import { ClaudeCLIAdapter } from './claude-cli.js';
import { GeminiCLIAdapter } from './gemini-cli.js';

/** Maps gateway type string to its adapter constructor. Used for dynamic instantiation from DB rows. */
export const ADAPTER_MAP: Record<string, new (row: GatewayRow) => GatewayAdapter> = {
  ollama: OllamaAdapter,
  openclaw: OpenClawAdapter,
  codex_cli: CodexCLIAdapter,
  claude_cli: ClaudeCLIAdapter,
  gemini_cli: GeminiCLIAdapter,
};

/**
 * Create an adapter instance from a gateway DB row.
 * Returns null for unknown gateway types.
 *
 * Enables Phase 20 (Smart Routing) to instantiate adapters dynamically:
 *   const adapter = createAdapter(gatewayRow);
 */
export function createAdapter(row: GatewayRow): GatewayAdapter | null {
  const Ctor = ADAPTER_MAP[row.type];
  if (!Ctor) return null;
  return new Ctor(row);
}
