import { useState, useRef, useEffect } from "react"
import { Link } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"

import { LLMTerminal } from "~/components/llm-terminal"
import { ModelCatalog } from "~/components/bridge/model-catalog"
import { DispatchLog } from "~/components/bridge/dispatch-log"
import { CostAnalytics } from "~/components/bridge/cost-analytics"
import { UserKeyManager } from "~/components/bridge/user-key-manager"
import {
  Clock, Server, XCircle,
  Pause, Play, Settings, RefreshCw, Save, FileText,
  ArrowLeft, ArrowUpCircle, Link2, Download,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface BridgeGateway {
  id: string; type: string; name: string; url: string | null
  auth_method: string; masked_display: string | null
  status: string; enabled: boolean; priority: number
  circuit_state: string; last_health_at: number | null
  model_count: number; model_names: string[]
  capabilities: string[]
  metadata: Record<string, unknown>
  status_indicator: string
}

interface GatewayModel {
  id: string; gateway_id: string; model_name: string
  capabilities: string[]; context_window: number | null
  pricing_input_per_m: number | null; pricing_output_per_m: number | null
  is_active: number
}

interface PromptLayer {
  name: string; source: string; content: string; tokens_est: number
}

interface ConfigFile {
  name: string; path: string; content: string; exists: boolean
}

interface GatewayPromptProfile {
  gateway_type: string; gateway_name: string
  system_prompt: string; layers: PromptLayer[]
  config_files: ConfigFile[]; porter_system_prompt: string
}

interface HookDetail {
  event: string; matcher?: string; command: string; type: string
}

interface GatewayVersion {
  gateway_id: string; version: string | null; latest: string | null
  update_cmd: string | null; is_latest: boolean | null
  hooks?: { hooks_configured: boolean; hook_count: number; details?: HookDetail[] }
}

interface UsageLimit {
  limit_type: string       // 'requests' | 'tokens' | 'input_tokens' | 'output_tokens'
  period: string           // 'minute' | 'daily' | 'weekly' | 'monthly'
  current: number
  limit: number | null
  pct: number | null       // 0-1
  reset_at: number | null
  source: string
}

interface ModelLimits {
  model_name: string       // actual model name or '_gateway_' for gateway-level
  limits: UsageLimit[]
}

interface GatewayCapacity {
  gateway_id: string
  models: ModelLimits[]
  last_429_at: number | null; total_429_count: number
}

interface GatewayMetrics {
  gateway_id: string
  p95_latency_ms: number | null; success_rate_pct: number | null
  error_429_count: number; total_dispatches: number
}

type CompositeStatus = "online" | "busy" | "throttled" | "blocked" | "paused" | "offline"

function deriveCompositeStatus(gw: BridgeGateway, cap?: GatewayCapacity): CompositeStatus {
  if (!gw.enabled) return "paused"
  if (gw.status !== "active") return "offline"
  if (gw.circuit_state === "open") return "blocked"
  if (!cap) return "online"
  // Check all limits across all models
  let maxPct = 0
  for (const m of cap.models) {
    for (const l of m.limits) {
      if (l.pct != null) maxPct = Math.max(maxPct, l.pct)
    }
  }
  if (maxPct >= 1) return "blocked"
  if (maxPct >= 0.9 || (cap.last_429_at && (Date.now() / 1000 - cap.last_429_at) < 300)) return "throttled"
  if (maxPct >= 0.7) return "busy"
  return "online"
}

const STATUS_STYLES: Record<CompositeStatus, { dot: string; label: string; text: string }> = {
  online:    { dot: "bg-success",                     label: "online",    text: "text-success" },
  busy:      { dot: "bg-warning",                     label: "busy",      text: "text-warning" },
  throttled: { dot: "bg-orange-400",                  label: "throttled", text: "text-orange-400" },
  blocked:   { dot: "bg-danger",                      label: "blocked",   text: "text-danger" },
  paused:    { dot: "bg-text3",                       label: "paused",    text: "text-text3" },
  offline:   { dot: "bg-danger animate-pulse",        label: "offline",   text: "text-danger" },
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function capacityBarColor(pct: number): string {
  if (pct >= 100) return "bg-danger"
  if (pct >= 90) return "bg-orange-400"
  if (pct >= 70) return "bg-warning"
  return "bg-accent-porter"
}

function fmtResetIn(resetAt: number | null): string | null {
  if (!resetAt) return null
  const secsLeft = Math.max(0, Math.round(resetAt - Date.now() / 1000))
  if (secsLeft <= 0) return "Resetting now"
  if (secsLeft < 60) return `Resets in ${secsLeft}s`
  if (secsLeft < 3600) return `Resets in ${Math.round(secsLeft / 60)}m`
  if (secsLeft < 86400) {
    const h = Math.floor(secsLeft / 3600)
    const m = Math.round((secsLeft % 3600) / 60)
    return `Resets in ${h}h ${m}m`
  }
  // More than 24h — show the day and time
  const d = new Date(resetAt * 1000)
  const day = d.toLocaleDateString("en-SG", { weekday: "short", timeZone: "Asia/Singapore" })
  const time = d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" })
  return `Resets ${day} ${time}`
}

function periodLabel(period: string): string {
  if (period === "session") return " this session"
  if (period === "minute") return "/min"
  if (period === "daily") return " today"
  if (period === "weekly") return " this week"
  if (period === "monthly") return " this month"
  return ""
}

function limitLabel(lt: string, period: string): string {
  const type = lt === "requests" ? "Requests" : lt === "tokens" ? "Tokens" : lt === "input_tokens" ? "Input tokens" : "Output tokens"
  return `${type}${periodLabel(period)}`
}

function UsageBlock({ label, requests, tokens }: { label: string; requests?: UsageLimit; tokens?: UsageLimit }) {
  const primary = requests || tokens
  if (!primary) return null
  // Try requests pct first, then tokens pct
  const rawPct = requests?.pct ?? tokens?.pct
  const pctNum = rawPct != null ? Math.round(rawPct * 100) : null
  const resetStr = fmtResetIn(requests?.reset_at ?? tokens?.reset_at ?? null)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium text-text2">
          {label}{pctNum != null ? ` (${pctNum}% used)` : primary.limit == null && primary.current === 0 ? '' : tokens && tokens.current > 0 ? ' (tracking)' : ''}
        </span>
        <span className="text-2xs text-text3">{resetStr ?? (primary.limit == null && primary.current === 0 ? '∞ No limit' : 'Limit not published')}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
        {pctNum != null ? (
          <div className={`h-full rounded-full transition-all ${capacityBarColor(pctNum)}`} style={{ width: `${Math.min(pctNum, 100)}%` }} />
        ) : (
          <div className="h-full rounded-full bg-accent-porter/20" style={{ width: `${Math.min(primary.current > 0 ? 25 : 0, 100)}%` }} />
        )}
      </div>
    </div>
  )
}

function UsageMeter({ label, rl }: { label: string; rl: UsageLimit }) {
  const pctNum = rl.pct != null ? Math.round(rl.pct * 100) : null
  const resetStr = fmtResetIn(rl.reset_at)
  const hasKnownLimit = rl.limit != null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium text-text2">{label}</span>
        {resetStr ? (
          <span className="text-2xs text-text3">{resetStr}</span>
        ) : (
          <span className="text-2xs text-text3">Limit not published</span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
        {pctNum != null ? (
          <div className={`h-full rounded-full transition-all ${capacityBarColor(pctNum)}`} style={{ width: `${Math.min(pctNum, 100)}%` }} />
        ) : (
          <div className="h-full rounded-full bg-accent-porter/20" style={{ width: `${Math.min(rl.current > 0 ? 20 : 0, 100)}%` }} />
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-2xs text-text3">
          {pctNum != null ? `${pctNum}% used` : rl.current > 0 ? `${fmtCompact(rl.current)} used` : 'No usage yet'}
        </span>
        {hasKnownLimit && (
          <span className="text-2xs text-text3 font-mono">{fmtCompact(rl.current)} / {fmtCompact(rl.limit!)}</span>
        )}
      </div>
    </div>
  )
}

/** Compact inline bar for per-model limits — one line each */
function InlineUsageBar({ rl }: { rl: UsageLimit }) {
  const pctNum = rl.pct != null ? Math.round(rl.pct * 100) : null
  const label = limitLabel(rl.limit_type, rl.period)
  return (
    <div className="flex items-center gap-2 text-2xs">
      <span className="text-text3 w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-border/30 overflow-hidden">
        {pctNum != null ? (
          <div className={`h-full rounded-full ${capacityBarColor(pctNum)}`} style={{ width: `${Math.min(pctNum, 100)}%` }} />
        ) : (
          <div className="h-full rounded-full bg-text3/20" style={{ width: '10%' }} />
        )}
      </div>
      <span className="text-text3 font-mono shrink-0 tabular-nums">
        {pctNum != null ? `${pctNum}%` : "—"}
        {rl.limit != null && <span className="ml-1">{fmtCompact(rl.current)}/{fmtCompact(rl.limit)}</span>}
      </span>
    </div>
  )
}

function PerModelLimits({ models }: { models: ModelLimits[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="px-4 pb-2 space-y-0.5">
      {models.map(m => (
        <div key={m.model_name}>
          <button
            onClick={() => setExpanded(expanded === m.model_name ? null : m.model_name)}
            className="flex items-center gap-1.5 w-full py-1 text-2xs text-text2 hover:text-text transition-colors"
          >
            <span className={`transition-transform ${expanded === m.model_name ? "rotate-90" : ""}`}>&#9654;</span>
            <span className="font-medium truncate">{m.model_name}</span>
            {m.limits.some(l => l.pct != null && l.pct >= 0.9) && (
              <span className="size-1.5 rounded-full bg-orange-400 shrink-0" />
            )}
          </button>
          {expanded === m.model_name && (
            <div className="pl-4 pb-1.5 space-y-1">
              {m.limits.map((l, i) => (
                <InlineUsageBar key={i} rl={l} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function fmtLatency(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function MetricsRow({ metrics }: { metrics?: GatewayMetrics }) {
  if (!metrics || metrics.total_dispatches === 0) return null
  const parts: { text: string; danger?: boolean }[] = []

  if (metrics.p95_latency_ms != null) {
    parts.push({ text: `p95 ${fmtLatency(metrics.p95_latency_ms)}` })
  }
  if (metrics.success_rate_pct != null) {
    parts.push({ text: `${metrics.success_rate_pct.toFixed(0)}% success`, danger: metrics.success_rate_pct < 95 })
  }
  if (metrics.error_429_count > 0) {
    parts.push({ text: `${metrics.error_429_count}× rate limited`, danger: true })
  }
  parts.push({ text: `${metrics.total_dispatches} calls` })

  return (
    <p className="text-2xs text-text3 px-4 pb-2">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1">·</span>}
          <span className={p.danger ? "text-danger font-medium" : ""}>{p.text}</span>
        </span>
      ))}
      <span className="text-text3/50 ml-1">(1h)</span>
    </p>
  )
}

// ── Helpers ──────────────────────────────────────────────

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function fmtCtx(n: number | null) {
  if (!n) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtNow() {
  return new Date().toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour12: false })
}

// ── Bridge Agent Team ────────────────────────────────

const BRIDGE_TABS = [
  { tab: "status", label: "Status" },
  { tab: "models", label: "Models" },
  { tab: "costs", label: "Costs" },
]

// ── Operator Event Log ────────────────────────────────

type OpEvent = { text: string; color: string; ts: number }
let opEvents: OpEvent[] = []
function pushOpEvent(text: string, color = "text-text3") {
  opEvents = [{ text, color, ts: Date.now() }, ...opEvents].slice(0, 50)
}
function getOpEvents() { return opEvents }

// ── Gateway Card ──────────────────────────────────────

function GatewayCard({ gw, models, versionInfo, capacity, metrics, onOpenEditor, tickLog }: {
  gw: BridgeGateway; models: GatewayModel[]; versionInfo?: GatewayVersion
  capacity?: GatewayCapacity; metrics?: GatewayMetrics
  onOpenEditor: (mode: "config" | "prompt") => void; tickLog?: () => void
}) {
  const qc = useQueryClient()
  const [showConfig, setShowConfig] = useState(false)
  const [showHooks, setShowHooks] = useState(false)
  const isOnline = gw.status === "active"
  const circuitOpen = gw.circuit_state === "open"
  const circuitHalf = gw.circuit_state === "half_open"
  const lastSeen = gw.last_health_at ? fmtRel(gw.last_health_at) : null
  const version = gw.metadata?.version as string | undefined
  const protocols = gw.metadata?.messaging_protocols as string[] | undefined
  const compositeStatus = deriveCompositeStatus(gw, capacity)
  const statusStyle = STATUS_STYLES[compositeStatus]

  const toggle = useMutation({
    mutationFn: () => api("/api/admin/bridge/gateways", { method: "POST", json: { action: "update", id: gw.id, enabled: gw.enabled ? 0 : 1 } }),
    onSuccess: () => {
      pushOpEvent(`${fmtNow()} [manual] ${gw.enabled ? "paused" : "resumed"}: ${gw.name}`, gw.enabled ? "text-warning" : "text-success")
      tickLog?.(); qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
    },
  })

  const restart = useMutation({
    mutationFn: () => api<{ restarted: boolean; error?: string; message?: string }>("/api/admin/bridge/gateways/restart", { method: "POST", json: { gateway_id: gw.id } }),
    onSuccess: (r) => {
      pushOpEvent(`${fmtNow()} [manual] restart: ${gw.name} — ${r.restarted ? "restarted" : r.message || r.error || "failed"}`, r.restarted ? "text-success" : "text-danger")
      tickLog?.(); setTimeout(() => qc.invalidateQueries({ queryKey: ["bridge"] }), 6_000)
    },
  })

  const toggleModel = useMutation({
    mutationFn: (modelId: string) => api(`/api/admin/bridge/models/${modelId}/toggle`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bridge", "all-models"] }); qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] }) },
  })

  const runUpdate = useMutation({
    mutationFn: () => api<{ success: boolean; old_version?: string; new_version?: string; version_changed?: boolean; error?: string }>(
      "/api/admin/bridge/gateways/run-update", { method: "POST", json: { gateway_type: gw.type } }
    ),
    onSuccess: (r) => {
      pushOpEvent(
        `${fmtNow()} [manual] update: ${gw.name} — ${r.version_changed ? `${r.old_version} → ${r.new_version}` : r.error || "no change"}`,
        r.success ? "text-success" : "text-danger"
      )
      tickLog?.()
      qc.invalidateQueries({ queryKey: ["bridge"] })
    },
  })

  const refreshUsage = useMutation({
    mutationFn: () => api<{ gateways: GatewayCapacity[]; refreshed: boolean }>("/api/admin/bridge/capacity/refresh", { method: "POST" }),
    onSuccess: () => {
      pushOpEvent(`${fmtNow()} [manual] usage refresh: ${gw.name}`, "text-accent-porter")
      tickLog?.()
      qc.invalidateQueries({ queryKey: ["bridge", "capacity"] })
    },
  })

  return (
    <div className={`rounded-xl border overflow-hidden ${compositeStatus === "offline" || compositeStatus === "blocked" ? "border-danger/30 bg-danger/5" : "border-border bg-surface"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`size-2.5 rounded-full shrink-0 ${statusStyle.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text leading-tight">{gw.name}</p>
          <div className="flex items-center gap-2">
            {(versionInfo?.version || version) ? (
              <span className={`text-2xs font-mono ${versionInfo?.is_latest === false ? "text-warning" : "text-accent-porter"}`}>
                v{versionInfo?.version || version}
                {versionInfo?.is_latest === false && versionInfo.latest && (
                  <span className="text-text3 ml-1">→ {versionInfo.latest}</span>
                )}
              </span>
            ) : (
              <span className="text-2xs font-mono text-text3">not installed</span>
            )}
            {versionInfo?.is_latest === false && (
              <Button variant="ghost" size="sm" onClick={() => runUpdate.mutate()} disabled={runUpdate.isPending}
                title={`Update ${gw.name} to ${versionInfo.latest}`}
                className={`h-5 px-1.5 text-2xs gap-1 ${runUpdate.isPending ? "text-warning" : "text-warning hover:text-success"}`}>
                <ArrowUpCircle className={`size-3 ${runUpdate.isPending ? "animate-spin" : ""}`} />
                {runUpdate.isPending ? "Updating…" : "Update"}
              </Button>
            )}
            {!versionInfo?.version && !version && versionInfo?.update_cmd && (
              <Button variant="ghost" size="sm" onClick={() => runUpdate.mutate()} disabled={runUpdate.isPending}
                title={`Install ${gw.name}`}
                className={`h-5 px-1.5 text-2xs gap-1 ${runUpdate.isPending ? "text-accent-porter" : "text-accent-porter hover:text-success"}`}>
                <Download className={`size-3 ${runUpdate.isPending ? "animate-spin" : ""}`} />
                {runUpdate.isPending ? "Installing…" : "Install"}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon-xs" onClick={() => toggle.mutate()} disabled={toggle.isPending}
            className={gw.enabled ? "text-success hover:text-warning" : "text-text3 hover:text-success"}
            title={gw.enabled ? "Pause" : "Resume"}>
            {gw.enabled ? <Pause className="size-3" /> : <Play className="size-3" />}
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => { if (confirm(`Restart ${gw.name}? This will briefly interrupt traffic.`)) restart.mutate() }} disabled={restart.isPending}
            title="Restart gateway" className={restart.isPending ? "text-warning animate-spin" : "text-text3 hover:text-warning"}>
            <RefreshCw className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onOpenEditor("prompt")} title="Files">
            <FileText className="size-3" />
          </Button>
          {(gw.url != null || gw.auth_method === "bearer_token") && (
            <Button variant="ghost" size="icon-xs" onClick={() => setShowConfig(!showConfig)} title="Connection settings"
              className={showConfig ? "text-accent-porter" : "text-text3 hover:text-text"}>
              <Settings className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 px-4 pb-2.5 text-2xs text-text3 flex-wrap">
        <span className={`font-medium ${statusStyle.text}`}>{statusStyle.label}</span>
        {circuitOpen && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />circuit open</span>}
        {circuitHalf && <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-warning" />half-open</span>}
        <span className="flex items-center gap-1"><Server className="size-2.5" />{gw.model_count} {gw.model_count === 1 ? "model" : "models"}</span>
        {lastSeen && <span className="flex items-center gap-1"><Clock className="size-2.5" />{lastSeen}</span>}
        {capacity && capacity.total_429_count > 0 && (
          <span className="text-danger font-medium">{capacity.total_429_count}× 429s</span>
        )}
        {protocols && protocols.map(p => (
          <Badge key={p} className="text-2xs bg-success/10 text-success border-0">{p}</Badge>
        ))}
        {versionInfo?.hooks?.hooks_configured && (
          <button onClick={() => setShowHooks(!showHooks)} className="flex items-center gap-1 text-accent-porter hover:text-foreground transition-colors" title={`${versionInfo.hooks.hook_count} hook${versionInfo.hooks.hook_count !== 1 ? "s" : ""} — click to view`}>
            <Link2 className="size-2.5" />{versionInfo.hooks.hook_count} hook{versionInfo.hooks.hook_count !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Hook configurations */}
      {showHooks && versionInfo?.hooks?.details && versionInfo.hooks.details.length > 0 && (
        <div className="px-4 py-3 border-t border-border/30 space-y-2 bg-background/50">
          <p className="text-2xs font-semibold text-text2 uppercase tracking-wider">Hooks</p>
          {versionInfo.hooks.details.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-2xs">
              <Badge className="bg-accent-porter/15 text-accent-porter border-0 text-2xs shrink-0">{h.event}</Badge>
              {h.matcher && <span className="text-text3 shrink-0">/{h.matcher}/</span>}
              <code className="text-text2 font-mono truncate flex-1" title={h.command}>{h.command}</code>
              <span className="text-text3 shrink-0">{h.type}</span>
            </div>
          ))}
        </div>
      )}

      {/* Usage limits — Session/Daily + Weekly, with token details */}
      {capacity && (() => {
        // Only show limits that have an actual limit_value — no bars for unlimited local models
        const allLimits = capacity.models.flatMap(m => m.limits).filter(l => l.limit !== null && l.limit > 0)
        if (allLimits.length === 0) return null

        // Group limits by period
        const quotaOrder = ['5hour', 'hourly', 'daily', 'minute']
        let quotaPeriod: string | null = null
        for (const p of quotaOrder) {
          if (allLimits.some(l => l.period === p)) { quotaPeriod = p; break }
        }

        const quotaLimits = quotaPeriod ? allLimits.filter(l => l.period === quotaPeriod) : []
        const weeklyLimits = allLimits.filter(l => l.period === 'weekly')

        if (quotaLimits.length === 0 && weeklyLimits.length === 0) return null

        const periodLabels: Record<string, string> = {
          'session': 'Latest session', '5hour': 'Current session', 'hourly': 'Hourly limit', 'daily': 'Daily limit', 'minute': 'Per minute'
        }

        const reqQuota = quotaLimits.find(l => l.limit_type === 'requests')
        const tokQuota = quotaLimits.find(l => l.limit_type === 'tokens')
        const reqWeekly = weeklyLimits.find(l => l.limit_type === 'requests')
        const tokWeekly = weeklyLimits.find(l => l.limit_type === 'tokens')

        return (
          <div className="px-4 py-3 space-y-3 border-t border-border/30">
            {quotaPeriod && (reqQuota || tokQuota) && (
              <UsageBlock label={periodLabels[quotaPeriod] ?? 'Quota'} requests={reqQuota} tokens={tokQuota} />
            )}
            {(reqWeekly || tokWeekly) && (
              <UsageBlock label="Weekly limit" requests={reqWeekly} tokens={tokWeekly} />
            )}
            <button onClick={() => refreshUsage.mutate()}
              disabled={refreshUsage.isPending}
              className="text-2xs text-text3 hover:text-accent-porter transition-colors flex items-center gap-1">
              <RefreshCw className={`size-2.5 ${refreshUsage.isPending ? "animate-spin" : ""}`} />
              {refreshUsage.isPending ? "Refreshing…" : "Refresh usage"}
            </button>
          </div>
        )
      })()}

      {/* Metrics row */}
      <MetricsRow metrics={metrics} />

      {/* Inline config (gear toggle) */}
      {showConfig && (
        <div className="px-4 py-3 border-t border-border/30 space-y-2 bg-background/50">
          {gw.url && (
            <div>
              <label className="text-2xs text-text3 block mb-1">URL</label>
              <p className="text-2xs font-mono text-text2">{gw.url}</p>
            </div>
          )}
          {gw.auth_method === "bearer_token" && gw.masked_display && (
            <div>
              <label className="text-2xs text-text3 block mb-1">Token</label>
              <p className="text-2xs font-mono text-text2">{gw.masked_display}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-2xs text-text3">Priority: {gw.priority}</span>
            <span className="text-2xs text-text3">· Auth: {gw.auth_method}</span>
          </div>
        </div>
      )}

      {/* Models */}
      {models.length > 0 && (
        <div className="border-t border-border/30">
          {models.map((model, i) => (
            <div key={model.id}
              className={`flex items-center gap-2.5 px-4 py-1.5 w-full text-left ${i < models.length - 1 ? "border-b border-border/15" : ""} bg-background/30`}>
              <span className={`size-2 rounded-full shrink-0 ${model.is_active ? "bg-success/60" : "bg-text3/15"}`} title={model.is_active ? "Active" : "Inactive"} />
              <p className={`text-2xs font-mono flex-1 min-w-0 truncate ${model.is_active ? "text-text" : "text-text3"}`}>{model.model_name}</p>
              <div className="flex gap-0.5 shrink-0">
                {(model.capabilities ?? []).map(cap => (
                  <span key={cap} className={`rounded px-1 py-0.5 text-2xs font-medium ${
                    cap === "coding" ? "bg-blue-500/15 text-blue-400" :
                    cap === "writing" ? "bg-purple-500/15 text-purple-400" :
                    cap === "analysis" ? "bg-amber-500/15 text-amber-400" :
                    cap === "vision" ? "bg-emerald-500/15 text-emerald-400" :
                    "bg-raised text-text3"
                  }`}>{cap}</span>
                ))}
              </div>
              <span className="text-2xs text-text3 tabular-nums shrink-0">{fmtCtx(model.context_window)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gateway File Editor (full-width, file tabs like agent detail) ──

function GatewayFileEditor({ gw, promptProfile, onClose }: {
  gw: BridgeGateway; promptProfile?: GatewayPromptProfile; onClose: () => void
}) {
  // Build file list: system prompt + config files
  const files: Array<{ id: string; label: string; content: string; editable: boolean }> = [
    { id: "system-prompt", label: "System Prompt", content: promptProfile?.porter_system_prompt || "", editable: true },
  ]
  for (const cf of (promptProfile?.config_files ?? [])) {
    if (cf.exists) files.push({ id: cf.name, label: cf.name, content: cf.content, editable: false })
  }

  const [activeFile, setActiveFile] = useState(files[0]?.id || "system-prompt")
  const [editContent, setEditContent] = useState<Record<string, string>>({})

  const currentFile = files.find(f => f.id === activeFile) ?? files[0]
  const currentContent = editContent[activeFile] ?? currentFile?.content ?? ""

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-xs text-text3 hover:text-text transition-colors">
          <ArrowLeft className="size-3" /> Back
        </button>
        <span className="text-sm font-bold text-foreground">{gw.name}</span>
        <span className="text-2xs text-text3">Files</span>
        {currentFile?.editable && editContent[activeFile] !== undefined && (
          <div className="ml-auto">
            <Button size="sm" className="gap-1.5 text-xs">
              <Save className="size-3" /> Save
            </Button>
          </div>
        )}
      </div>

      {/* File tabs + editor */}
      <div className="flex-1 min-h-0 flex">
        {/* Left nav — file tabs */}
        <div className="w-48 shrink-0 border-r border-border overflow-y-auto bg-surface/50">
          {files.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFile(f.id)}
              className={`w-full text-left px-3 py-2 text-2xs transition-colors border-b border-border/20 ${
                activeFile === f.id ? "bg-accent-porter/5 text-foreground font-semibold" : "text-text3 hover:bg-raised/30 hover:text-text2"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{f.label}</span>
              </div>
              {!f.editable && <span className="text-2xs text-text3/50">read-only</span>}
            </button>
          ))}
        </div>

        {/* Editor area */}
        <div className="flex-1 min-w-0 flex flex-col border-b border-r border-border">
          {/* File header */}
          <div className="flex items-center px-3 py-1.5 border-b border-border bg-muted/50 shrink-0">
            <span className="text-2xs font-mono text-text3">{currentFile?.id === "system-prompt" ? "Porter → " + gw.name : currentFile?.id}</span>
          </div>

          {/* Content */}
          {currentFile?.editable ? (
            <textarea
              value={currentContent}
              onChange={e => setEditContent(prev => ({ ...prev, [activeFile]: e.target.value }))}
              className="flex-1 w-full bg-background p-4 font-mono text-xs text-foreground placeholder:text-text3 focus:outline-none resize-none"
              spellCheck={false}
              placeholder="Enter system prompt..."
            />
          ) : (
            <pre className="flex-1 w-full bg-background p-4 font-mono text-xs text-text2 whitespace-pre-wrap overflow-y-auto">{currentContent}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Gateway Config Editor (connection settings only) ──

function GatewayConfigEditor({ gw, onClose, tickLog }: {
  gw: BridgeGateway; onClose: () => void; tickLog?: () => void
}) {
  const qc = useQueryClient()
  const [editPort, setEditPort] = useState(() => { try { return gw.url ? new URL(gw.url).port : "" } catch { return "" } })
  const [editToken, setEditToken] = useState(gw.masked_display || "")

  const saveToken = useMutation({
    mutationFn: (token: string) => api("/api/admin/bridge/gateways/save-token", { method: "POST", json: { gateway_id: gw.id, token } }),
    onSuccess: () => {
      pushOpEvent(`${fmtNow()} [manual] token changed: ${gw.name}`, "text-warning")
      tickLog?.(); qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
    },
  })

  const updateField = useMutation({
    mutationFn: (fields: Record<string, unknown>) => api("/api/admin/bridge/gateways", { method: "POST", json: { action: "update", id: gw.id, ...fields } }),
    onSuccess: () => {
      pushOpEvent(`${fmtNow()} [manual] config changed: ${gw.name}`, "text-warning")
      tickLog?.(); qc.invalidateQueries({ queryKey: ["bridge", "gateway-cards"] })
    },
  })

  const restart = useMutation({
    mutationFn: () => api<{ restarted: boolean }>("/api/admin/bridge/gateways/restart", { method: "POST", json: { gateway_id: gw.id } }),
    onSuccess: () => {
      pushOpEvent(`${fmtNow()} [manual] restart after config: ${gw.name}`, "text-success")
      tickLog?.(); setTimeout(() => qc.invalidateQueries({ queryKey: ["bridge"] }), 6_000)
    },
  })

  function saveAndRestart() {
    const saves: Promise<unknown>[] = []
    if (gw.url) {
      try {
        const u = new URL(gw.url); u.port = editPort
        const newUrl = u.toString().replace(/\/$/, "")
        if (newUrl !== gw.url) saves.push(updateField.mutateAsync({ url: newUrl }))
      } catch { /* */ }
    }
    if (gw.auth_method === "bearer_token" && editToken !== gw.masked_display) {
      saves.push(saveToken.mutateAsync(editToken))
    }
    Promise.all(saves).then(() => {
      if (gw.type === "ollama" || gw.type === "openclaw") restart.mutate()
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-xs text-text3 hover:text-text transition-colors">
          <ArrowLeft className="size-3" /> Back
        </button>
        <span className="text-sm font-bold text-foreground">{gw.name}</span>
        <span className="text-2xs text-text3">Connection</span>
        <div className="ml-auto">
          <Button size="sm" onClick={saveAndRestart} disabled={saveToken.isPending || updateField.isPending || restart.isPending} className="gap-1.5 text-xs">
            <Save className="size-3" /> Save & Restart
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-lg">
        {gw.url != null && (
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Port</label>
            <input value={editPort} onChange={e => setEditPort(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-porter" />
          </div>
        )}
        {gw.auth_method === "bearer_token" && (
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Gateway Token</label>
            <input value={editToken} onChange={e => setEditToken(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-porter" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Gateway Grid ──────────────────────────────────────

function GatewayGrid({ tickLog, onOpenEditor }: { tickLog?: () => void; onOpenEditor: (gwId: string, mode: "config" | "prompt") => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["bridge", "gateway-cards"],
    queryFn: () => api<{ gateways: BridgeGateway[]; summary: { zeroConfigReady: boolean; healthy: number; degraded: number; unavailable: number } }>("/api/admin/bridge"),
    staleTime: 30_000,
  })
  const modelsQuery = useQuery({
    queryKey: ["bridge", "all-models"],
    queryFn: () => api<{ models: GatewayModel[] }>("/api/admin/bridge/models"),
    staleTime: 30_000,
  })
  const versionsQuery = useQuery({
    queryKey: ["bridge", "versions"],
    queryFn: () => api<{ versions: GatewayVersion[] }>("/api/admin/bridge/versions"),
    staleTime: 60_000,
  })
  const capacityQuery = useQuery({
    queryKey: ["bridge", "capacity"],
    queryFn: () => api<{ gateways: GatewayCapacity[] }>("/api/admin/bridge/capacity").catch(() => ({ gateways: [] as GatewayCapacity[] })),
    staleTime: 30_000,
    retry: false,
  })
  const metricsQuery = useQuery({
    queryKey: ["bridge", "metrics"],
    queryFn: () => api<{ period: string; metrics: GatewayMetrics[] }>("/api/admin/bridge/metrics").catch(() => ({ period: "1h", metrics: [] as GatewayMetrics[] })),
    staleTime: 30_000,
    retry: false,
  })
  const versionMap = new Map((versionsQuery.data?.versions ?? []).map(v => [v.gateway_id, v]))
  const capacityMap = new Map((capacityQuery.data?.gateways ?? []).map(c => [c.gateway_id, c]))
  const metricsMap = new Map((metricsQuery.data?.metrics ?? []).map(m => [m.gateway_id, m]))

  if (isLoading) return (
    <div className="grid grid-cols-1 gap-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-border bg-surface px-4 py-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="size-2.5 rounded-full bg-text3/30" />
            <div className="h-3 w-24 rounded bg-text3/20" />
            <div className="h-3 w-16 rounded bg-text3/10 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  )
  if (error || (data?.gateways ?? []).length === 0) return (
    <div className="flex flex-col items-center py-10 gap-2 text-center">
      <XCircle className="size-5 text-text3" />
      <p className="text-xs text-text3">{error ? "Failed to load gateways" : "No gateways detected"}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {data!.gateways.map(gw => (
        <GatewayCard key={gw.id} gw={gw}
          models={(modelsQuery.data?.models ?? []).filter(m => m.gateway_id === gw.id)}
          versionInfo={versionMap.get(gw.id)}
          capacity={capacityMap.get(gw.id)}
          metrics={metricsMap.get(gw.id)}
          onOpenEditor={(mode) => onOpenEditor(gw.id, mode)}
          tickLog={tickLog} />
      ))}
    </div>
  )
}

// ── Operator Activity Log ─────────────────────────────

interface IntelEntry {
  id: string; source_agent: string; entry_type: string
  title: string; body: string; status: string; created_at: number
}
interface SessionEntry {
  id: string; chat_id: string | null; agent_id: string | null
  username: string | null; gateway_type: string | null; model_name: string | null
  tokens_used: number; token_budget: number; context_pct: number
  status: string; last_active_at: number
}
interface PatternEntry {
  id: string; pattern_type: string; gateway_type: string | null; agent_id: string | null
  summary: string; confidence: number; status: string; created_at: number
}
interface MsgBusEntry {
  id: string; source_gateway: string | null; target_gateway: string | null
  intent: string; status: string; latency_ms: number | null; created_at: number
}

function fmtTs(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour12: false })
}

function OperatorActivityLog() {
  const [, setSnifferTick] = useState(0)

  // Listen for real-time sniffer events from Bridge
  useEffect(() => {
    function onActivity(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail?.text) return
      const color = detail.event === "session_end" ? "text-text3"
        : detail.event === "session_start" ? "text-success"
        : "text-accent-porter"
      pushOpEvent(`${fmtNow()} [sniffer] ${detail.text}`, color)
      setSnifferTick(t => t + 1)
    }
    window.addEventListener("bridge:activity", onActivity)
    return () => window.removeEventListener("bridge:activity", onActivity)
  }, [])

  useEffect(() => {
    function onContextPressure(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const pct = typeof detail.context_pct === 'number' ? Math.round(detail.context_pct * 100) : 0
      const color = pct >= 95 ? "text-danger" : "text-warning"
      const action = detail.action === 'rotated' ? '↻ rotated' : '⚠ pressure'
      const gw = detail.gateway_type ?? '?'
      const agent = detail.agent_id ? detail.agent_id.slice(0, 8) : detail.username ?? '?'
      pushOpEvent(`${fmtNow()} [session] ${action} ${agent}@${gw} ${pct}% context`, color)
      setSnifferTick(t => t + 1)
    }
    function onIntelligence(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const promoted = detail.promoted ? ' → promoted to Recall' : ''
      const conf = detail.confidence ?? 0
      pushOpEvent(`${fmtNow()} [intel] ${detail.pattern_type}: ${(detail.summary ?? '').slice(0, 80)} (${conf}% conf${promoted})`, "text-chart-2")
      setSnifferTick(t => t + 1)
    }
    window.addEventListener("bridge:context-pressure", onContextPressure)
    window.addEventListener("bridge:intelligence", onIntelligence)
    return () => {
      window.removeEventListener("bridge:context-pressure", onContextPressure)
      window.removeEventListener("bridge:intelligence", onIntelligence)
    }
  }, [])

  const { data: bridgeData } = useQuery({
    queryKey: ["bridge", "gateway-cards"],
    queryFn: () => api<{ gateways: Array<{ id: string; name: string; type: string; status: string; enabled: boolean; circuit_state: string; last_health_at: number | null; model_count: number; metadata: Record<string, unknown> }> }>("/api/admin/bridge"),
    staleTime: 30_000,
  })
  const { data: versionData } = useQuery({
    queryKey: ["bridge", "versions"],
    queryFn: () => api<{ versions: GatewayVersion[] }>("/api/admin/bridge/versions"),
    staleTime: 60_000,
  })
  const { data: intelData } = useQuery({
    queryKey: ["bridge", "intel-recent"],
    queryFn: () => api<{ entries: IntelEntry[] }>("/api/admin/intelligence?limit=10&source_agent=bridge-operator"),
    staleTime: 30_000,
  })
  const { data: capacityData } = useQuery({
    queryKey: ["bridge", "capacity"],
    queryFn: () => api<{ gateways: GatewayCapacity[] }>("/api/admin/bridge/capacity").catch(() => ({ gateways: [] as GatewayCapacity[] })),
    staleTime: 30_000,
    retry: false,
  })
  const { data: sessionsData } = useQuery({
    queryKey: ["bridge", "sessions"],
    queryFn: () => api<{ sessions: SessionEntry[] }>("/api/admin/bridge/sessions?limit=10").catch(() => ({ sessions: [] as SessionEntry[] })),
    staleTime: 15_000,
    retry: false,
  })
  const { data: patternsData } = useQuery({
    queryKey: ["bridge", "patterns"],
    queryFn: () => api<{ patterns: PatternEntry[] }>("/api/admin/bridge/patterns?limit=10").catch(() => ({ patterns: [] as PatternEntry[] })),
    staleTime: 60_000,
    retry: false,
  })
  const { data: msgbusData } = useQuery({
    queryKey: ["bridge", "msgbus"],
    queryFn: () => api<{ events: MsgBusEntry[] }>("/api/admin/bridge/msgbus?limit=10").catch(() => ({ events: [] as MsgBusEntry[] })),
    staleTime: 15_000,
    retry: false,
  })

  const gateways = bridgeData?.gateways ?? []
  const versions = new Map((versionData?.versions ?? []).map(v => [v.gateway_id, v]))
  const intel = intelData?.entries ?? []
  const capacities = new Map((capacityData?.gateways ?? []).map(c => [c.gateway_id, c]))

  let k = 0
  const lines: { text: string; color: string; _key: number }[] = []

  // Manual events first (user actions like pause/restart/update)
  for (const e of getOpEvents()) {
    lines.push({ text: e.text, color: e.color, _key: k++ })
  }

  // Gateway status + version + circuit state + capacity alerts
  for (const gw of gateways) {
    const meta = gw.metadata ?? {}
    const ver = versions.get(gw.id)
    const cap = capacities.get(gw.id)
    const ts = gw.last_health_at ? fmtTs(gw.last_health_at) : "--:--:--"
    const ok = gw.status === "active"
    const v = (meta.version as string) || ver?.version || ""
    const vStr = v ? ` v${v}` : ""
    const models = gw.model_count ? ` · ${gw.model_count} model${gw.model_count > 1 ? "s" : ""}` : ""

    // Health line
    if (!ok) {
      lines.push({ text: `${ts} [health] ✗ ${gw.name}${vStr} — unreachable (${gw.status})`, color: "text-danger", _key: k++ })
    } else if (!gw.enabled) {
      lines.push({ text: `${ts} [health] ⏸ ${gw.name}${vStr} — paused`, color: "text-warning", _key: k++ })
    } else {
      lines.push({ text: `${ts} [health] ✓ ${gw.name}${vStr}${models} — online`, color: "text-success", _key: k++ })
    }

    // Circuit breaker
    if (gw.circuit_state === "open") {
      lines.push({ text: `${ts} [circuit] ⚡ ${gw.name} — OPEN (traffic blocked)`, color: "text-danger", _key: k++ })
    } else if (gw.circuit_state === "half-open") {
      lines.push({ text: `${ts} [circuit] ⚠ ${gw.name} — half-open (testing)`, color: "text-warning", _key: k++ })
    }

    // Rate limit / capacity alerts
    if (cap) {
      for (const m of cap.models) {
        for (const rl of m.limits) {
          if (rl.pct != null && rl.pct >= 0.9) {
            const pctInt = Math.round(rl.pct * 100)
            const label = `${rl.limit_type}/${rl.period}${m.model_name !== "_gateway_" ? ` (${m.model_name})` : ""}`
            lines.push({
              text: `${ts} [throttle] ${gw.name} at ${pctInt}% ${label} (${fmtCompact(rl.current)}/${fmtCompact(rl.limit!)})`,
              color: pctInt >= 100 ? "text-danger" : "text-orange-400",
              _key: k++,
            })
          }
        }
      }
      if (cap.last_429_at && (Date.now() / 1000 - cap.last_429_at) < 300) {
        lines.push({
          text: `${fmtTs(cap.last_429_at)} [429] ${gw.name} rate limited (${cap.total_429_count} total)`,
          color: "text-danger",
          _key: k++,
        })
      }
    }

    // CLI activity from capacity data
    if (cap) {
      const allLimits = cap.models.flatMap(m => m.limits)
      // Find the session-level usage (5hour or daily)
      const session = allLimits.find(l => (l.period === '5hour' || l.period === 'daily') && l.limit_type === 'tokens' && l.current > 0)
      const weekly = allLimits.find(l => l.period === 'weekly' && l.limit_type === 'tokens' && l.current > 0)
      const sessionReq = allLimits.find(l => (l.period === '5hour' || l.period === 'daily') && l.limit_type === 'requests' && l.current > 0)

      if (session || sessionReq) {
        const pct = allLimits.find(l => (l.period === '5hour' || l.period === 'daily') && l.pct != null)
        const pctStr = pct ? ` (${Math.round(pct.pct! * 100)}% used)` : ''
        const tokStr = session ? `${fmtCompact(session.current)} tokens` : ''
        const reqStr = sessionReq ? `${fmtCompact(sessionReq.current)} requests` : ''
        const detail = [reqStr, tokStr].filter(Boolean).join(', ')
        lines.push({ text: `${ts} [activity] ${gw.name} session: ${detail}${pctStr}`, color: "text-accent-porter", _key: k++ })
      } else {
        lines.push({ text: `${ts} [activity] ${gw.name} — idle`, color: "text-text3", _key: k++ })
      }

      if (weekly && weekly.current > 0) {
        const weekPct = allLimits.find(l => l.period === 'weekly' && l.pct != null)
        const pctStr = weekPct ? ` (${Math.round(weekPct.pct! * 100)}% of weekly)` : ''
        lines.push({ text: `${ts} [weekly] ${gw.name}: ${fmtCompact(weekly.current)} tokens this week${pctStr}`, color: "text-text3", _key: k++ })
      }
    }

    // Update available
    if (ver?.is_latest === false && ver.latest) {
      lines.push({ text: `${ts} [update] ↑ ${gw.name} ${v} → ${ver.latest} available`, color: "text-warning", _key: k++ })
    }
  }

  // Intelligence feed entries
  if (intel.length > 0) {
    lines.push({ text: "", color: "text-text3", _key: k++ })
    for (const entry of intel) {
      const ts = fmtTs(entry.created_at)
      const color = entry.entry_type === "blocker" ? "text-danger"
        : entry.entry_type === "learning" ? "text-accent-porter"
        : entry.entry_type === "capability" ? "text-chart-2"
        : "text-text3"
      lines.push({ text: `${ts} [intel] ${entry.title}`, color, _key: k++ })
    }
  }

  // Active session state (BRG-01)
  const sessions = sessionsData?.sessions ?? []
  if (sessions.length > 0) {
    lines.push({ text: "", color: "text-text3", _key: k++ })
    for (const s of sessions) {
      const ts = fmtTs(s.last_active_at)
      const pct = s.context_pct
      const color = pct >= 95 ? "text-danger" : pct >= 80 ? "text-warning" : "text-accent-porter"
      const agent = s.agent_id ? s.agent_id.slice(0, 8) : s.username ?? s.chat_id?.slice(0, 8) ?? '?'
      const gw = s.gateway_type ?? '?'
      lines.push({ text: `${ts} [session] ${agent}@${gw} — ${pct.toFixed(1)}% context`, color, _key: k++ })
    }
  }

  // Message bus activity (BRG-02)
  const msgbusEvents = msgbusData?.events ?? []
  if (msgbusEvents.length > 0) {
    lines.push({ text: "", color: "text-text3", _key: k++ })
    for (const ev of msgbusEvents) {
      const ts = fmtTs(ev.created_at)
      const src = ev.source_gateway ?? '?'
      const tgt = ev.target_gateway ?? '?'
      const latency = ev.latency_ms ? ` ${ev.latency_ms}ms` : ''
      const color = ev.status === 'failed' ? "text-danger" : "text-text2"
      lines.push({ text: `${ts} [msgbus] ${src}→${tgt} ${ev.intent}${latency}`, color, _key: k++ })
    }
  }

  // Intelligence patterns (BRG-03)
  const patterns = patternsData?.patterns ?? []
  if (patterns.length > 0) {
    lines.push({ text: "", color: "text-text3", _key: k++ })
    for (const p of patterns) {
      const ts = fmtTs(p.created_at)
      const promoted = p.status === 'promoted' ? ' ✓' : ''
      const conf = p.confidence
      const color = p.status === 'promoted' ? "text-success" : conf >= 80 ? "text-chart-2" : "text-text3"
      lines.push({ text: `${ts} [pattern] ${p.pattern_type}: ${p.summary.slice(0, 70)} (${conf}%${promoted})`, color, _key: k++ })
    }
  }

  if (lines.length === 0) {
    lines.push({ text: "--:--:-- [operator] waiting: No gateways detected", color: "text-text3", _key: 0 })
  }

  return <LLMTerminal lines={lines} title="Operator Activity" className="!h-full" />
}

// ── Job Queue Helpers ─────────────────────────────────

interface JobRow {
  id: string
  agent_id: string
  project_id: string | null
  trigger_type: string
  prompt: string | null
  status: string
  scheduled_for: number
  started_at: number | null
  completed_at: number | null
  result_preview: string | null
  error: string | null
  source: string
  required_skill: string | null
  required_capability: string | null
  assigned_gateway: string | null
  assigned_agent_name: string | null
  duration_ms: number | null
  created_at: number
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "\u2014"
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

function formatRelativeTime(epochSec: number): string {
  const d = Date.now() / 1000 - epochSec
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function sourceBadgeVariant(source: string): string {
  if (source === "agent") return "bg-purple-500/15 text-purple-400 border-0"
  if (source === "human") return "bg-teal-500/15 text-teal-400 border-0"
  return "bg-raised text-text3 border-0"  // system
}

function statusBadgeVariant(status: string): string {
  if (status === "pending") return "bg-warning/15 text-warning border-0"
  if (status === "running") return "bg-accent-porter/15 text-accent-porter border-0"
  if (status === "complete") return "bg-success/15 text-success border-0"
  if (status === "failed") return "bg-danger/15 text-danger border-0"
  return "bg-raised text-text3 border-0"
}

// ── JobQueuePanel ─────────────────────────────────────

function JobQueuePanel() {
  const [jobTab, setJobTab] = useState("queue")

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["admin", "jobs", "queue"],
    queryFn: () => api<{ jobs: JobRow[] }>("/api/v1/admin/jobs/queue"),
    refetchInterval: jobTab === "queue" ? 10_000 : false,
    enabled: jobTab === "queue",
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["admin", "jobs", "history"],
    queryFn: () => api<{ jobs: JobRow[] }>("/api/v1/admin/jobs/history?limit=50"),
    enabled: jobTab === "completed" || jobTab === "history",
  })

  const tabs = [
    { key: "queue", label: "Queue" },
    { key: "completed", label: "Completed" },
    { key: "history", label: "History" },
  ]

  const activeJobs: JobRow[] =
    jobTab === "queue"
      ? queueData?.jobs ?? []
      : jobTab === "completed"
        ? (historyData?.jobs ?? []).filter(j => j.status === "complete")
        : historyData?.jobs ?? []

  const isLoading = jobTab === "queue" ? queueLoading : historyLoading

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <h2 className="text-sm font-semibold text-text">Job Queue</h2>
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setJobTab(t.key)}
              className={`px-2.5 py-1 text-2xs rounded-md font-medium transition-colors ${
                jobTab === t.key
                  ? "bg-accent-porter/15 text-accent-porter"
                  : "text-text3 hover:text-text2 hover:bg-raised/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 flex items-center justify-center">
          <RefreshCw className="size-4 text-text3 animate-spin" />
          <span className="ml-2 text-xs text-text3">Loading jobs...</span>
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-text3">
            {jobTab === "queue" ? "No pending or running jobs" : "No job history yet"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text3">
                <th className="text-left font-medium px-4 py-2">Source</th>
                <th className="text-left font-medium px-2 py-2">Type</th>
                <th className="text-left font-medium px-2 py-2">Agent</th>
                <th className="text-left font-medium px-2 py-2">Gateway</th>
                <th className="text-left font-medium px-2 py-2">Status</th>
                <th className="text-left font-medium px-2 py-2">Duration</th>
                <th className="text-left font-medium px-2 py-2">Skill</th>
                <th className="text-left font-medium px-2 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {activeJobs.map(job => (
                <tr key={job.id} className="border-b border-border/50 hover:bg-raised/30 transition-colors">
                  <td className="px-4 py-2">
                    <Badge className={`text-2xs ${sourceBadgeVariant(job.source)}`}>
                      {job.source}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-text2">{job.trigger_type}</td>
                  <td className="px-2 py-2 text-text2">{job.assigned_agent_name || (job.agent_id === "system" ? "system" : job.agent_id?.slice(0, 8) || "\u2014")}</td>
                  <td className="px-2 py-2 text-text2 font-mono text-2xs">{job.assigned_gateway || "\u2014"}</td>
                  <td className="px-2 py-2">
                    <Badge className={`text-2xs ${statusBadgeVariant(job.status)}`}>
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-text2 tabular-nums">{formatDuration(job.duration_ms)}</td>
                  <td className="px-2 py-2 text-text3">{job.required_skill || "\u2014"}</td>
                  <td className="px-2 py-2 text-text3">{job.created_at ? formatRelativeTime(job.created_at) : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab Content ───────────────────────────────────────

// ── Page ────────────────────────────────────────────────

export default function BridgePage() {
  const [activeTab, setActiveTab] = useState("status")
  const [, setLogTick] = useState(0)
  const tickLog = () => setLogTick(t => t + 1)

  // Editor state: which gateway is being edited
  const [editingGw, setEditingGw] = useState<{ id: string; mode: "config" | "prompt" } | null>(null)

  const bridgeQuery = useQuery({
    queryKey: ["bridge", "gateway-cards"],
    queryFn: () => api<{ gateways: BridgeGateway[]; summary: { healthy: number; degraded: number; unavailable: number } }>("/api/admin/bridge"),
    staleTime: 30_000,
  })

  // Intellect dispatch confidence — surfaces dispatch_scorer outcomes per gateway
  const confidenceQuery = useQuery({
    queryKey: ["bridge", "confidence"],
    queryFn: () => api<{ confidence: Array<{ gatewayType: string; avgScore: number; totalRated: number; recentTrend: string }> }>("/api/admin/bridge/confidence"),
    staleTime: 60_000,
  })
  const confidenceList = confidenceQuery.data?.confidence ?? []
  const totalRated = confidenceList.reduce((s, c) => s + (c.totalRated ?? 0), 0)
  const weightedAvg = totalRated > 0
    ? confidenceList.reduce((s, c) => s + (c.avgScore ?? 0) * (c.totalRated ?? 0), 0) / totalRated
    : 0
  const promptsQuery = useQuery({
    queryKey: ["bridge", "prompts"],
    queryFn: () => api<{ profiles: GatewayPromptProfile[] }>("/api/admin/bridge/prompts"),
    staleTime: 120_000,
  })
  const promptMap = new Map((promptsQuery.data?.profiles ?? []).map(p => [p.gateway_type, p]))

  const summary = bridgeQuery.data?.summary
  const gateways = bridgeQuery.data?.gateways ?? []
  const healthyCount = summary?.healthy ?? 0
  const totalGateways = gateways.length
  const totalModels = gateways.reduce((s, g) => s + (g.model_count ?? 0), 0)
  const openCircuits = gateways.filter(g => g.circuit_state === "open").length
  const bridgeHealthy = totalGateways > 0 && healthyCount === totalGateways && openCircuits === 0

  // Find the gateway being edited
  const editGw = editingGw ? gateways.find(g => g.id === editingGw.id) : null
  const editPromptProfile = editGw ? promptMap.get(editGw.type) : undefined

  function renderOperatorTab() {
    // If editing a gateway, show the right editor
    if (editGw && editingGw) {
      if (editingGw.mode === "prompt") {
        return <GatewayFileEditor gw={editGw} promptProfile={editPromptProfile} onClose={() => setEditingGw(null)} />
      }
      return <GatewayConfigEditor gw={editGw} onClose={() => setEditingGw(null)} tickLog={tickLog} />
    }
    return (
      <>
        <div className="flex-1 min-h-0 overflow-y-auto pb-4 space-y-4">
          <GatewayGrid tickLog={tickLog} onOpenEditor={(id, mode) => setEditingGw({ id, mode })} />
          <JobQueuePanel />
        </div>
        <div className="shrink-0 h-44">
          <OperatorActivityLog />
        </div>
      </>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

      {/* ── Status Bar ── */}
      <div className="shrink-0 flex items-center gap-4 px-5 py-2.5 border-b border-border">
        {bridgeHealthy ? (
          <Badge className="bg-success/15 text-success border-0 gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-success animate-pulse" /> All Systems Go
          </Badge>
        ) : totalGateways === 0 ? (
          <Badge className="bg-raised text-text3 border-0 text-xs">No Gateways</Badge>
        ) : (
          <Badge className="bg-warning/15 text-warning border-0 gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-warning animate-pulse" /> Degraded
          </Badge>
        )}
        <div className="flex items-center gap-3 text-2xs text-text2">
          <span><strong className="text-success tabular-nums">{healthyCount}</strong> gateways</span>
          {(summary?.degraded ?? 0) > 0 && <span><strong className="text-warning tabular-nums">{summary?.degraded}</strong> degraded</span>}
          {(summary?.unavailable ?? 0) > 0 && <span><strong className="text-danger tabular-nums">{summary?.unavailable}</strong> down</span>}
          <span className="text-text3">·</span>
          <span><strong className="text-text tabular-nums">{totalModels}</strong> models</span>
          {openCircuits > 0 && <span><strong className="text-danger tabular-nums">{openCircuits}</strong> circuits open</span>}
          {totalRated > 0 && (
            <>
              <span className="text-text3">·</span>
              <Link to="/intelligence" className="flex items-center gap-1 hover:text-accent-porter transition-colors" title="Intellect dispatch quality (avg outcome score)">
                <span className={
                  weightedAvg >= 4 ? "text-success" :
                  weightedAvg >= 3 ? "text-text2" :
                  "text-warning"
                }>
                  Quality <strong className="tabular-nums">{weightedAvg.toFixed(1)}</strong>/5
                </span>
                <span className="text-text3">({totalRated.toLocaleString()} scored)</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="shrink-0 flex items-stretch border-b border-border">
        {BRIDGE_TABS.map(t => {
          const isActive = t.tab === activeTab
          return (
            <button
              key={t.tab}
              onClick={() => { setActiveTab(t.tab); setEditingGw(null) }}
              className={`px-5 py-2.5 text-xs font-medium transition-colors relative ${
                isActive ? "text-foreground" : "text-text3 hover:text-text2"
              }`}
            >
              {isActive && <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full bg-accent-porter" />}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div className={`flex-1 min-h-0 px-5 py-4 ${activeTab === "status" ? "flex flex-col" : "overflow-y-auto"}`}>
        {activeTab === "status" && renderOperatorTab()}
        {activeTab === "models" && <div className="space-y-6"><ModelCatalog /><DispatchLog /><div className="flex justify-end"><Link to="/sessions" className="text-xs text-accent-porter hover:underline">View Sessions →</Link></div></div>}
        {activeTab === "costs" && <div className="space-y-6"><CostAnalytics /><div className="flex justify-end"><Link to="/costs" className="text-xs text-accent-porter hover:underline">Full Cost Analytics →</Link></div><UserKeyManager /></div>}
      </div>
    </div>
  )
}
