/**
 * Bridge Service — Type definitions
 *
 * Core types for the AI Gateway Registry (Phase 16).
 * All phases 16-23 depend on these types.
 */

// ── Type aliases matching DB column values ────────────────────────────────────

export type GatewayType =
  | 'ollama'
  | 'openclaw'
  | 'codex_cli'
  | 'claude_cli'
  | 'gemini_cli'
  | 'openai_compat';

export type GatewayStatus = 'active' | 'stale' | 'unavailable';

export type GatewaySource = 'auto_detected' | 'env_bootstrap' | 'manual';

export type GatewayAuthMethod = 'none' | 'bearer_token' | 'api_key';

// ── Result interfaces ─────────────────────────────────────────────────────────

export interface DetectResult {
  found: boolean;
  binaryPath?: string;
  version?: string;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface BridgeDispatchRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface BridgeDispatchResult {
  response: string;
  model: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  cached: boolean;
}

// ── GatewayAdapter interface (5 methods) ─────────────────────────────────────

export interface GatewayAdapter {
  readonly name: string;
  readonly gatewayType: GatewayType;
  detect(): Promise<DetectResult>;
  health(): Promise<HealthResult>;
  dispatch(req: BridgeDispatchRequest): Promise<BridgeDispatchResult>;
  stream(req: BridgeDispatchRequest, signal: AbortSignal): AsyncIterable<string>;
  listModels(): Promise<string[]>;
}

// ── DB row types (for mapping DB rows in service code) ────────────────────────

export interface GatewayRow {
  id: string;
  type: GatewayType;
  name: string;
  url: string | null;
  authMethod: GatewayAuthMethod;
  status: GatewayStatus;
  source: GatewaySource;
  priority: number;
  capabilities: string[];
  metadata: Record<string, unknown>;
  enabled: number;
  maskedDisplay: string;
  createdAt: number | null;
  updatedAt: number | null;
  lastHealthAt: number | null;
}

export interface GatewayCredentialRow {
  id: string;
  gatewayId: string;
  label: string;
  encryptedValue: string;
  maskedDisplay: string;
  createdAt: number | null;
  rotatedAt: number | null;
}
