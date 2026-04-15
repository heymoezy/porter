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
  /** Structured capability record (populated when DB has JSONB object). Callers should treat as opaque if not needed. */
  capabilityRecord?: Record<string, unknown>;
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
  forceGatewayType?: string;
  forceModelName?: string;
  /** Phase 33: Runtime skill selection telemetry — passed through to logDispatch */
  skillsUsed?: {
    candidates: Array<{ skillId: string; name: string; score: number; reason: string }>;
    selected: Array<{ skillId: string; name: string; score: number; reason: string }>;
    threshold: number;
    totalCandidates: number;
  };
  /** Phase 45: Delegation doctrine strategy chosen for this dispatch */
  dispatchStrategy?: 'direct' | 'delegate' | 'parallel' | 'escalate';
  /** Phase 38: Directive selection stats — for context_stats logging */
  directiveStats?: {
    total: number;
    injected: number;
    skipped: number;
    scoring_mode: 'task_aware' | 'all';
  };
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

// ── Agent-to-agent messaging (Bridge v1) ──────────────────────────────────────

/** Intent field for agent-to-agent messages. */
export type AgentMessageIntent = 'request' | 'response' | 'ack' | 'error';

/**
 * Structured message envelope for hub/spoke agent-to-agent communication.
 * Carried in the body of POST /api/v1/bridge/agent-message.
 */
export interface AgentMessage {
  /** Unique ID for this message, generated by the sender. */
  messageId: string;
  /** Links messages in the same logical request/response cycle. */
  correlationId?: string;
  /** Logical agent name of the sender (e.g. "codex", "claude-cli"). */
  sourceAgent?: string;
  /** Gateway type of the sender (e.g. "codex_cli"). */
  sourceGateway?: string;
  /** Logical agent name of the intended recipient. */
  targetAgent?: string;
  /** Gateway type of the intended recipient. Informs routing if set. */
  targetGateway?: string;
  /** Message intent: what kind of interaction this is. */
  intent: AgentMessageIntent;
  /** The task or prompt to be dispatched. */
  task: string;
  /** Optional structured context passed to the model. */
  context?: Record<string, unknown>;
  /** Optional constraints for the dispatch (e.g. max tokens, model hints). */
  constraints?: Record<string, unknown>;
  /** messageId to reply to (for response/ack messages). */
  replyTo?: string;
  /** How long the sender considers this message valid, in ms. */
  ttlMs?: number;
  /** Unix ms timestamp when the sender created this message. */
  createdAt: number;
}

/** Request envelope for POST /api/v1/bridge/agent-message. */
export interface AgentMessageRequest {
  message: AgentMessage;
  /**
   * Number of Bridge hops already taken (0 = first hop from a spoke).
   * The endpoint rejects requests where hopCount >= MAX_AGENT_HOPS.
   */
  hopCount?: number;
}

/** Response envelope returned by POST /api/v1/bridge/agent-message. */
export interface AgentMessageResponse {
  messageId: string;
  correlationId?: string;
  /** Always 'response' for a successful synchronous dispatch. */
  intent: 'response';
  dispatchLogId: string;
  gatewayType: string;
  modelName: string;
  response: string;
  latencyMs: number;
  hopCount: number;
  createdAt: number;
}

/** Optional agent-message fields passed to logDispatch() for observability. */
export interface AgentMessageLogContext {
  correlationId?: string;
  sourceAgent?: string;
  sourceGateway?: string;
  targetAgent?: string;
  targetGateway?: string;
  intent?: string;
  replyTo?: string;
}

// ── Task Dispatch types (Phase 39) ──────────────────────────────────────────

export interface TaskRequest {
  prompt: string;            // The task description
  cwd: string;               // Working directory for the subprocess
  timeoutMs?: number;        // Default: 300_000 (5 min), max: 600_000 (10 min)
  tools?: string[];          // Optional tool allowlist (claude: --allowedTools)
}

export interface TaskEvent {
  type: 'progress' | 'result' | 'error' | 'tool_use' | 'tool_result';
  text?: string;             // Human-readable output chunk
  tool?: string;             // Tool name (for tool_use events)
  input?: unknown;           // Tool input (for tool_use events)
  exitCode?: number;         // Final exit code (for result/error)
  durationMs?: number;       // Total wall time (for result/error)
}

export interface TaskDispatchResult {
  taskId: string;
  gatewayType: string;
  model: string;
  status: 'complete' | 'failed' | 'cancelled';
  output: string;            // Full concatenated text output (max 1MB)
  durationMs: number;
  exitCode: number | null;
}

export type TaskStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
