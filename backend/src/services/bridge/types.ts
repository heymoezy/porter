/**
 * Bridge Service — Type definitions
 *
 * Core types for the AI Gateway Registry (Phase 16).
 * All phases 16-23 depend on these types.
 */

// ── Type aliases matching DB column values ────────────────────────────────────

export type GatewayType = 'claude_cli' | 'codex_cli' | 'antigravity_cli';

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
  /**
   * Tool surface for backends that expose one (claude_cli).
   *   'none'    — spawn with no tool access; the model can ONLY emit text.
   *               Required for cross-app consumers (Tom on openclaw, Recall
   *               summarize/query) where tools are managed UPSTREAM of the
   *               adapter (openclaw MCPs, application-side logic). Without
   *               this, claude_cli's default agentic mode tries to call
   *               WebSearch/Read/Bash and either deadlocks or bubbles back
   *               "I don't have ymc-tom__* tools" — see Tom-bug 2026-05-18.
   *   'default' — keep the historic agentic tool set. Used for direct Porter
   *               admin chat where the user expects Claude Code behaviour.
   *   string[] — explicit allow-list (e.g. ['WebSearch','WebFetch','Read'])
   *               passed straight to claude_cli's --allowedTools. This is how a
   *               bounded WORKER agent is sandboxed to read-only research tools;
   *               anything not in the list is unavailable at the dispatch layer.
   * Adapters that don't expose tools (codex_cli) ignore this field.
   */
  tools?: 'none' | 'default' | string[];
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
  /** v6.31.0: consumer attribution — slug of WHO is dispatching (tom,
   *  doc-intel, dreams, episode-summarizer, cli…). Written to
   *  bridge_dispatch_log.source_agent; powers the Bridge consumers view. */
  sourceAgent?: string;
  /** Phase 38: Directive selection stats — for context_stats logging */
  directiveStats?: {
    total: number;
    injected: number;
    skipped: number;
    scoring_mode: 'task_aware' | 'all';
  };
  /**
   * v6.47.0 — model failover controls.
   *   fallback: false disables the chain (single-gateway hard-fail) for
   *     callers that MUST NOT switch models. Default true.
   *   simulateFailure: gateway types to force-fail (quota outcome) BEFORE
   *     dispatch — a test-only hook. The route gates it to loopback so it
   *     can never be triggered by a remote caller.
   */
  fallback?: boolean;
  simulateFailure?: GatewayType[];
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
  /**
   * v6.47.0 — model failover. Default true (chain claude_cli → codex_cli →
   * antigravity_cli on quota/failure). Set false to hard-fail on the target
   * gateway for callers that must not switch models.
   */
  fallback?: boolean;
  /**
   * Test-only: gateway types to force-fail before dispatch. The route accepts
   * this ONLY from a loopback caller; remote callers have it stripped.
   */
  simulateFailure?: GatewayType[];
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
  /**
   * Failover summary when a fallback chain ran (Moe 2026-07-06). Present so
   * callers can SEE that Bridge switched models — e.g. gatewaySwitched=true
   * with answeredBy='codex_cli' means claude_cli was down/quota'd and codex
   * carried the task. Absent/undefined when the lead gateway answered first.
   */
  failover?: {
    switched: boolean;
    answeredBy: string | null;
    chain: string[];
    attempts: Array<{ gatewayType: string; outcome: string; reason?: string }>;
  };
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
