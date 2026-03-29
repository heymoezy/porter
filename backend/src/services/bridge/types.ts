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

export type ErrorClass = 'transient' | 'persistent' | 'configuration';
export type CircuitState = 'closed' | 'open' | 'half_open';

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
  version?: string;
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
  cachedTokens?: number;
  /** Raw response headers from HTTP-based adapters (for rate limit tracking) */
  responseHeaders?: Record<string, string>;
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

// ── Routing Engine types (Phase 20) ──────────────────────────────────────────

export type RoutingRuleScope = 'agent' | 'project' | 'gateway' | 'global';
export type RoutingRuleAction = 'force_model' | 'block_gateway' | 'cap_cost_usd' | 'prefer_local';

export interface RoutingContext {
  message: string;
  agentId?: string;
  projectId?: string | null;
  chatId?: string;
  messageSequence?: number;
  requiredCapabilities?: string[];
  username?: string;
}

export interface RoutingDecision {
  gatewayRow: GatewayRow;
  adapter: GatewayAdapter;
  modelName: string;
  reason: string;
  alternatives: Array<{ gatewayType: string; modelName: string; reasonSkipped: string }>;
  matchedRuleId: string | null;
}

export interface RoutingRuleRow {
  id: string;
  scope: RoutingRuleScope;
  scopeId: string | null;
  action: RoutingRuleAction;
  actionValue: string | null;
  enabled: number;
  priority: number;
  description: string | null;
  createdBy: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface DispatchLogEntry {
  id: string;
  gatewayId: string | null;
  gatewayType: string;
  modelName: string;
  chosenReason: string;
  alternatives: Array<{ gatewayType: string; modelName: string; reasonSkipped: string }>;
  estimatedCostUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  agentId: string | null;
  projectId: string | null;
  chatId: string | null;
  ruleId: string | null;
  createdAt: number | null;
}

export interface SessionRoutingRow {
  id: string;
  chatId: string;
  messageSequence: number;
  gatewayId: string | null;
  gatewayType: string;
  modelName: string;
  dispatchLogId: string | null;
  createdAt: number | null;
}

// ── Model Catalog types (Phase 19) ────────────────────────────────────────────

export interface ModelRow {
  id: string;
  gatewayId: string;
  modelName: string;
  capabilities: string[];
  contextWindow: number | null;
  pricingInputPerM: number | null;
  pricingOutputPerM: number | null;
  benchmarkScores: Record<string, number>;
  isActive: number;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface ModelVersionRow {
  id: string;
  modelId: string;
  versionLabel: string;
  snapshot: Record<string, unknown>;
  detectedAt: number | null;
}
