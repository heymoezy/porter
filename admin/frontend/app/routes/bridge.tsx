import { useState, useRef } from "react"
import { useNavigate } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { PixelPortrait } from "~/components/pixel-portrait"
import { LLMTerminal } from "~/components/llm-terminal"
import { ModelCatalog } from "~/components/bridge/model-catalog"
import { DispatchLog } from "~/components/bridge/dispatch-log"
import { CostAnalytics } from "~/components/bridge/cost-analytics"
import { RoutingRules } from "~/components/bridge/routing-rules"
import { UserKeyManager } from "~/components/bridge/user-key-manager"
import { WorkspaceGatewayOverrides } from "~/components/bridge/workspace-gateway-overrides"
import {
  Clock, Server, XCircle,
  Pause, Play, Settings, RotateCcw, Save, FileText,
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

interface GatewayVersion {
  gateway_id: string; version: string | null; latest: string | null
  update_cmd: string | null; is_latest: boolean | null
  hooks?: { hooks_configured: boolean; hook_count: number }
}

interface RateLimit {
  current: number; limit: number | null; pct: number | null; source: string
}

interface GatewayCapacity {
  gateway_id: string
  rpm: RateLimit; tpm: RateLimit; daily_tokens: RateLimit; concurrency: RateLimit
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
  const maxPct = Math.max(
    cap.rpm.pct ?? 0, cap.tpm.pct ?? 0,
    cap.daily_tokens.pct ?? 0, cap.concurrency.pct ?? 0,
  )
  if (maxPct >= 100) return "blocked"
  if (maxPct >= 90 || (cap.last_429_at && (Date.now() / 1000 - cap.last_429_at) < 300)) return "throttled"
  if (maxPct >= 70) return "busy"
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

function capacityBarColor(pct: number | null): string {
  if (pct == null) return "bg-text3/30"
  if (pct >= 100) return "bg-danger"
  if (pct >= 90) return "bg-orange-400"
  if (pct >= 70) return "bg-warning"
  return "bg-success"
}

function CapacityBar({ label, rl }: { label: string; rl: RateLimit }) {
  const pct = rl.pct != null ? Math.min(rl.pct, 100) : null
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs font-mono text-text3 w-7 shrink-0">{label}</span>
      {pct != null ? (
        <>
          <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${capacityBarColor(rl.pct)}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-2xs font-mono text-text3 tabular-nums shrink-0 w-16 text-right">
            {fmtCompact(rl.current)}/{fmtCompact(rl.limit!)}
          </span>
        </>
      ) : (
        <>
          <div className="flex-1 h-1.5 rounded-full bg-border/20" />
          <span className="text-2xs font-mono text-text3 tabular-nums shrink-0 w-16 text-right">~{fmtCompact(rl.current)}/min</span>
        </>
      )}
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

const BRIDGE_TEAM = [
  { id: "sys-bridge-operator", tab: "operator", name: "Bridge Operator", specialist: "The Watcher", role: "Health & Control", skin: "#c68642", hair: "#1a1a2e", eyes: "#0f172a", shirt: "#059669", hairStyle: "short" as const },
  { id: "sys-model-scout", tab: "scout", name: "Model Scout", specialist: "The Seeker", role: "Discovery", skin: "#f1c27d", hair: "#4a3728", eyes: "#1a1a2e", shirt: "#7c3aed", hairStyle: "parted" as const },
  { id: "sys-route-analyst", tab: "analyst", name: "Route Analyst", specialist: "The Optimizer", role: "Routing", skin: "#8d5524", hair: "#292524", eyes: "#1a1a2e", shirt: "#2563eb", hairStyle: "mohawk" as const },
  { id: "sys-cost-controller", tab: "controller", name: "Cost Controller", specialist: "The Auditor", role: "Costs", skin: "#e0ac69", hair: "#2C1810", eyes: "#1a1a2e", shirt: "#d97706", hairStyle: "short" as const },
]

// ── Operator Event Log ────────────────────────────────

type OpEvent = { text: string; color: string; ts: number }
let opEvents: OpEvent[] = []
function pushOpEvent(text: string, color = "text-text3") {
  opEvents = [{ text, color, ts: Date.now() }, ...opEvents].slice(0, 50)
}
function getOpEvents() { return opEvents }

// ── Gateway Card (clean — no expandable panels) ───────

function GatewayCard({ gw, models, versionInfo, capacity, metrics, onOpenEditor, tickLog }: {
  gw: BridgeGateway; models: GatewayModel[]; versionInfo?: GatewayVersion
  capacity?: GatewayCapacity; metrics?: GatewayMetrics
  onOpenEditor: (mode: "config" | "prompt") => void; tickLog?: () => void
}) {
  const qc = useQueryClient()
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
          <Button variant="ghost" size="icon-xs" onClick={() => restart.mutate()} disabled={restart.isPending}
            title="Remount" className={restart.isPending ? "text-warning animate-spin" : "text-text3 hover:text-warning"}>
            <RotateCcw className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => onOpenEditor("prompt")} title="Files">
            <FileText className="size-3" />
          </Button>
          {(gw.url != null || gw.auth_method === "bearer_token") && (
            <Button variant="ghost" size="icon-xs" onClick={() => onOpenEditor("config")} title="Connection">
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
          <span className="flex items-center gap-1 text-accent-porter" title={`${versionInfo.hooks.hook_count} hook${versionInfo.hooks.hook_count !== 1 ? "s" : ""} configured`}>
            <Link2 className="size-2.5" />{versionInfo.hooks.hook_count} hook{versionInfo.hooks.hook_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Capacity bars */}
      {capacity && (capacity.rpm.current > 0 || capacity.tpm.current > 0 || capacity.rpm.limit != null || capacity.tpm.limit != null) && (
        <div className="px-4 pb-2 space-y-1">
          <CapacityBar label="RPM" rl={capacity.rpm} />
          <CapacityBar label="TPM" rl={capacity.tpm} />
        </div>
      )}

      {/* Metrics row */}
      <MetricsRow metrics={metrics} />

      {/* Models */}
      {models.length > 0 && (
        <div className="border-t border-border/30">
          {models.map((model, i) => (
            <button key={model.id} onClick={() => toggleModel.mutate(model.id)}
              className={`flex items-center gap-2.5 px-4 py-1.5 w-full text-left ${i < models.length - 1 ? "border-b border-border/15" : ""} bg-background/30 hover:bg-raised/30 transition-colors`}>
              <span className={`size-2 rounded-full shrink-0 ${model.is_active ? "bg-text3/40" : "bg-text3/15"}`} title={model.is_active ? "Registered" : "Inactive"} />
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
            </button>
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

function fmtTs(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour12: false })
}

function OperatorActivityLog() {
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
      const rls: { label: string; rl: RateLimit }[] = [
        { label: "RPM", rl: cap.rpm }, { label: "TPM", rl: cap.tpm },
        { label: "Daily", rl: cap.daily_tokens }, { label: "Concurrency", rl: cap.concurrency },
      ]
      for (const { label, rl } of rls) {
        if (rl.pct != null && rl.pct >= 90) {
          lines.push({
            text: `${ts} [throttle] ⚠ ${gw.name} at ${Math.round(rl.pct)}% ${label} (${fmtCompact(rl.current)}/${fmtCompact(rl.limit!)})`,
            color: rl.pct >= 100 ? "text-danger" : "text-orange-400",
            _key: k++,
          })
        }
      }
      if (cap.last_429_at && (Date.now() / 1000 - cap.last_429_at) < 300) {
        lines.push({
          text: `${fmtTs(cap.last_429_at)} [429] ✗ ${gw.name} rate limited (${cap.total_429_count} total)`,
          color: "text-danger",
          _key: k++,
        })
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

  if (lines.length === 0) {
    lines.push({ text: "--:--:-- [operator] waiting: No gateways detected", color: "text-text3", _key: 0 })
  }

  return <LLMTerminal lines={lines} title="Operator Activity" className="!h-auto [&>div:last-child]:!flex-none [&>div:last-child]:max-h-[200px]" />
}

// ── Tab Content ───────────────────────────────────────

// ── Page ────────────────────────────────────────────────

export default function BridgePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("operator")
  const [, setLogTick] = useState(0)
  const tickLog = () => setLogTick(t => t + 1)

  // Editor state: which gateway is being edited
  const [editingGw, setEditingGw] = useState<{ id: string; mode: "config" | "prompt" } | null>(null)

  const bridgeQuery = useQuery({
    queryKey: ["bridge", "gateway-cards"],
    queryFn: () => api<{ gateways: BridgeGateway[]; summary: { healthy: number; degraded: number; unavailable: number } }>("/api/admin/bridge"),
    staleTime: 30_000,
  })
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
        <div className="flex-1 overflow-y-auto pb-4">
          <GatewayGrid tickLog={tickLog} onOpenEditor={(id, mode) => setEditingGw({ id, mode })} />
        </div>
        <div className="shrink-0" style={{ maxHeight: '40%' }}>
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
        </div>
      </div>

      {/* ── Agent Navigation ── */}
      <div className="shrink-0 flex items-stretch border-b border-border">
        {BRIDGE_TEAM.map(agent => {
          const isActive = agent.tab === activeTab
          return (
            <button
              key={agent.tab}
              onClick={() => {
                if (isActive) navigate(`/templates/${agent.id}`)
                else { setActiveTab(agent.tab); setEditingGw(null) }
              }}
              className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-3 transition-colors duration-200 relative ${
                isActive ? "bg-accent-porter/5" : "hover:bg-raised/30"
              }`}
            >
              {isActive && <div className="absolute bottom-0 left-[10%] right-[10%] h-[3px] rounded-t-full bg-accent-porter" />}
              <div className="grayscale opacity-50">
                <PixelPortrait size="sm" skin={agent.skin} hair={agent.hair} eyes={agent.eyes} shirt={agent.shirt} hairStyle={agent.hairStyle} />
              </div>
              <div className="text-left min-w-0">
                <p className={`text-xs font-bold leading-tight ${isActive ? "text-foreground" : "text-text3"}`}>{agent.name}</p>
                <p className="text-2xs text-text3 leading-tight">{agent.specialist}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div className={`flex-1 min-h-0 px-5 py-4 ${activeTab === "operator" ? "flex flex-col" : "overflow-y-auto"}`}>
        {activeTab === "operator" && renderOperatorTab()}
        {activeTab === "scout" && <ModelCatalog />}
        {activeTab === "analyst" && <div className="space-y-6"><DispatchLog /><RoutingRules /></div>}
        {activeTab === "controller" && <div className="space-y-6"><CostAnalytics /><UserKeyManager /><WorkspaceGatewayOverrides /></div>}
      </div>
    </div>
  )
}
