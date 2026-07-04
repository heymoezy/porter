import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { PixelPortrait } from "~/components/pixel-portrait"
import { AgentPresenceSummary } from "~/components/agent-presence"
import {
  Brain, Activity, AlertTriangle, CheckCircle, Server,
  Database, Cpu, HardDrive, Clock, Zap, MessageSquare,
  Users, Bot, FolderOpen, Terminal, RefreshCw, ChevronRight,
  Flame, Shield, Sparkles,
  Monitor, Bug, Globe, X, Search, Filter,
  BookOpen,
} from "lucide-react"
import { Link } from "react-router"
import {
  AGENT_REGISTRY, getAgentsByTeam, agentStatusCounts,
  type AgentDef, type AgentStatus,
} from "~/lib/agent-registry"

// ── Shared Types ────────────────────────────────────────

interface SystemData {
  memory: { total: number; used: number; free: number; pct: number }
  cpu: { cores: number; model: string; load1m: number; load5m: number; load15m: number }
  disk: { total: number; used: number; available: number; pct: number }
  uptime: number
  platform: { os: string; arch: string; hostname: string; nodeVersion: string }
  db: { size: number; path: string }
  sessions: { active: number; concurrent: number }
  process: { rss: number; heapUsed: number; heapTotal: number }
  runtimes: Array<{ name: string; url: string; status: string; latencyMs: number }>
}

interface DiagStats {
  total: number; open: number; today: number
  bySeverity: { critical: number; error: number; warning: number }
  bySource: { client_js: number; server_api: number; agent_error: number }
  topErrors: Array<{ message: string; source: string; severity: string; count: number; last_seen: number }>
}

interface DashboardData {
  projects: { total: number; byStatus: Array<{ status: string; cnt: number }> }
  agents: number; chats: number; messages: number; agentMessages: number
  tasks: number; orchestrations: number; decisions: number
  customers: number; sessions: number
  tokens: { input: number; output: number; requests: number }
  learnings: number; auditEvents: number; emails: number; skills: number
  recentActivity: Array<{ ts: number; actor: string; action: string; target: string }>
  version: string
}

interface LogEntry { ts: number; text: string; color: string }

interface AuditEntry {
  id: number
  ts: number
  ts_iso: string
  actor: string
  actor_type: string
  action: string
  target: string
  details: string
  project_id: string | null
}

interface Learning {
  sessionId: string
  source: string
  text: string
  backend: string | null
  extractedAt: number
}

interface ErrorEntry {
  id: number
  source: string
  severity: string
  message: string
  stack: string | null
  url: string | null
  username: string | null
  created_at: number
}

// ── Shared Helpers ─────────────────────────────────────

function fmtBytes(b: number) {
  if (!b) return "0 B"
  const k = 1024, s = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${(b / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ── Monitor: Verdict ─────────────────────────────────────

type Verdict = "healthy" | "degraded" | "down"

function deriveVerdict(system: SystemData | undefined, diagOpen: number): Verdict {
  if (!system) return "down"
  const anyDown = system.runtimes.some(r => r.status !== "healthy")
  const criticalResource = system.memory.pct >= 95 || system.disk.pct >= 95
  if (anyDown || criticalResource || diagOpen > 0) return "degraded"
  return "healthy"
}

const verdictConfig: Record<Verdict, { label: string; color: string; bg: string; border: string; pulse: boolean }> = {
  healthy:  { label: "All Systems Operational",  color: "text-success",  bg: "bg-success/8", border: "border-success/20", pulse: false },
  degraded: { label: "Issues Detected",          color: "text-warning",  bg: "bg-warning/8", border: "border-warning/20", pulse: true },
  down:     { label: "Systems Unreachable",       color: "text-danger",   bg: "bg-danger/8",  border: "border-danger/20",  pulse: true },
}

// ── Monitor: Agent-attributed actions ────────────────────

interface ActionItem {
  agent: string
  text: string
  severity: "critical" | "warning" | "info"
  link?: string
}

function deriveActions(sys: SystemData | undefined, diagStats: DiagStats | undefined): ActionItem[] {
  const actions: ActionItem[] = []
  if (!sys) {
    actions.push({ agent: "Sentinel", text: "System metrics unreachable — backend down?", severity: "critical" })
    return actions
  }

  for (const rt of sys.runtimes) {
    if (rt.status !== "healthy") actions.push({ agent: "Sentinel", text: `${rt.name} is DOWN`, severity: "critical" })
    else if (rt.latencyMs > 1000) actions.push({ agent: "Sentinel", text: `${rt.name} responding slowly (${rt.latencyMs}ms)`, severity: "warning" })
  }

  if (sys.memory.pct >= 90) actions.push({ agent: "Pulse", text: `Memory critical at ${sys.memory.pct}%`, severity: "critical" })
  else if (sys.memory.pct >= 75) actions.push({ agent: "Pulse", text: `Memory elevated at ${sys.memory.pct}%`, severity: "warning" })

  if (sys.disk.pct >= 90) actions.push({ agent: "Hygienist", text: `Disk at ${sys.disk.pct}% — cleanup needed`, severity: "critical" })
  else if (sys.disk.pct >= 75) actions.push({ agent: "Hygienist", text: `Disk at ${sys.disk.pct}% — monitoring`, severity: "warning" })

  if (diagStats) {
    if (diagStats.bySeverity.critical > 0)
      actions.push({ agent: "Diagnostician", text: `${diagStats.bySeverity.critical} critical errors need attention`, severity: "critical", link: "/diagnostics" })
    if (diagStats.bySeverity.error > 0)
      actions.push({ agent: "Diagnostician", text: `${diagStats.bySeverity.error} unresolved errors`, severity: "warning", link: "/diagnostics" })
  }

  if (actions.length === 0)
    actions.push({ agent: "Sentinel", text: "All systems nominal — nothing to do", severity: "info" })

  return actions
}

// ── Monitor: Subcomponents ───────────────────────────────

function ResourceBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-accent-porter"
  return (
    <div className="h-1 rounded-full bg-border/50 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ease-out ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function LiveTerminal({ logs }: { logs: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0 }, [logs])
  return (
    <div ref={ref} className="h-[180px] overflow-y-auto rounded-lg bg-[var(--terminal-bg)] p-3 font-mono text-2xs leading-relaxed scrollbar-thin">
      {logs.length === 0 ? <span className="text-text3">No recent activity</span> : (
        logs.map((log, i) => (
          <div key={`${log.ts}-${i}`} className={`${log.color} ${i === 0 ? "animate-list-stagger-in" : ""}`}>{log.text}</div>
        ))
      )}
    </div>
  )
}

const statusDot: Record<AgentStatus, string> = {
  planned: "bg-text3/40",
  forging: "bg-warning animate-pulse-badge",
  active: "bg-success animate-pulse-badge",
  paused: "bg-text3/60",
  error: "bg-danger animate-pulse-badge",
}

function BrainAgentCard({ agent, detail }: { agent: AgentDef; detail?: string }) {
  const isGhost = agent.status === "planned"
  return (
    <Link to={`/agents/${agent.id}`} className={`block rounded-lg border px-3 py-2.5 transition-all hover:border-accent-porter/30 ${isGhost ? "border-border/40 bg-card" : "border-accent-porter/20 bg-accent-porter/3"}`}>
      <div className="flex items-center gap-2.5">
        <div className={isGhost ? "grayscale opacity-40" : ""}>
          <PixelPortrait {...agent.avatar} size="xs" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-2xs font-bold ${isGhost ? "text-text2" : "text-text"}`}>{agent.name}</p>
            <span className="text-2xs text-text3 font-mono">· {agent.role}</span>
          </div>
          <p className="text-2xs text-text3 truncate">{detail ?? agent.description}</p>
        </div>
        <span className="flex items-center gap-1 text-2xs font-mono shrink-0">
          <span className={`size-1.5 rounded-full ${statusDot[agent.status]}`} />
          <span className={isGhost ? "text-text3" : "text-success"}>{agent.status}</span>
        </span>
      </div>
      {isGhost && agent.plannedCapabilities.length > 0 && (
        <div className="mt-1.5 pl-8 flex flex-wrap gap-1">
          {agent.plannedCapabilities.slice(0, 2).map((cap, i) => (
            <span key={i} className="text-2xs text-text3 bg-raised/50 rounded px-1.5 py-0.5">{cap}</span>
          ))}
          {agent.plannedCapabilities.length > 2 && (
            <span className="text-2xs text-text3">+{agent.plannedCapabilities.length - 2} more</span>
          )}
        </div>
      )}
    </Link>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 1: Monitor (from brain.tsx)
// ══════════════════════════════════════════════════════════

interface IntellectHealthData {
  corrections: { last7d: number; prev7d: number; trend: "improving" | "flat" | "rising" | "unknown" }
  validator: { autoFixed7d: number; stale7d: number; accuracyRatio: number }
  workflows: Array<{ name: string; runCount: number; failures7d: number; health: "healthy" | "idle" | "failing" | "unknown" }>
  promotion: { candidates: number; promoted7d: number; velocity: number }
  episodes: { created7d: number; uniqueSessions7d: number; coverageRatio: number }
}

function MonitorTab() {
  const system = useQuery({ queryKey: ["brain", "system"], queryFn: () => api<SystemData>("/api/admin/system"), refetchInterval: 30_000 })
  const diag = useQuery({ queryKey: ["brain", "diagnostics"], queryFn: () => api<{ errors: unknown[]; stats: DiagStats }>("/api/admin/diagnostics"), refetchInterval: 30_000 })
  const dashboard = useQuery({ queryKey: ["brain", "dashboard"], queryFn: () => api<DashboardData>("/api/admin/health/dashboard"), refetchInterval: 30_000 })
  const logs = useQuery({ queryKey: ["brain", "logs"], queryFn: () => api<{ logs: LogEntry[] }>("/api/admin/health/logs?limit=30"), refetchInterval: 30_000 })
  const intellectHealth = useQuery({ queryKey: ["intellect", "health"], queryFn: () => api<IntellectHealthData>("/api/v1/intellect/health"), refetchInterval: 60_000 })

  const s = system.data
  const diagStats = diag.data?.stats
  const diagOpen = diagStats?.open ?? 0
  const d = dashboard.data
  const logEntries = logs.data?.logs ?? []

  const verdict = deriveVerdict(s, diagOpen)
  const vc = verdictConfig[verdict]
  const actions = deriveActions(s, diagStats)
  const counts = agentStatusCounts()

  const brainAgents = getAgentsByTeam("brain")
  const memoryAgents = getAgentsByTeam("memory")
  const allBrainAgents = [...brainAgents, ...memoryAgents]

  if (system.isLoading && dashboard.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        <p className="text-xs text-text3">Connecting to brain...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-page-fade-slide">

      {/* ── Verdict Banner ── */}
      <div className={`flex items-center gap-3 rounded-xl border ${vc.border} ${vc.bg} px-4 py-3`}>
        <div className="relative">
          <Brain className={`size-5 ${vc.color}`} />
          {vc.pulse && <span className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ${verdict === "down" ? "bg-danger" : "bg-warning"} animate-pulse-badge`} />}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${vc.color}`}>{vc.label}</p>
          {s && <p className="text-2xs text-text3">{s.platform.hostname} · up {fmtUptime(s.uptime)} · {s.sessions.active} sessions</p>}
        </div>

        {d && <Badge variant="outline" className="text-2xs text-text3">v{d.version}</Badge>}
        <Button variant="ghost" size="icon-xs" onClick={() => { system.refetch(); diag.refetch(); dashboard.refetch(); logs.refetch() }} className={system.isFetching ? "animate-spin" : ""}>
          <RefreshCw className="size-3" />
        </Button>
      </div>

      {/* ── Intellect Status (Phase 3 self-monitor) ── */}
      {intellectHealth.data && (() => {
        const ih = intellectHealth.data
        const failingWf = ih.workflows.filter(w => w.health === "failing").length
        const healthyWf = ih.workflows.filter(w => w.health === "healthy").length
        const totalWf = ih.workflows.length
        const trendColor =
          ih.corrections.trend === "improving" ? "text-success" :
          ih.corrections.trend === "rising" ? "text-warning" : "text-text3"
        const trendLabel =
          ih.corrections.trend === "improving" ? "↓ improving" :
          ih.corrections.trend === "rising" ? "↑ rising" :
          ih.corrections.trend === "flat" ? "→ flat" : "—"
        return (
          <div className="rounded-xl border border-accent-porter/20 bg-accent-porter/[0.04] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-3.5 text-accent-porter" />
              <Link to="/intelligence" className="text-2xs font-semibold uppercase tracking-wide text-accent-porter hover:underline">
                Intellect (autonomous brain)
              </Link>
              {failingWf > 0 && (
                <Badge variant="outline" className="text-2xs text-danger border-danger/40">{failingWf} failing</Badge>
              )}
              <span className="ml-auto text-2xs text-text3">Phase 3 self-monitor · refreshed every 60s</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                <p className="text-2xs text-text3">Corrections /7d</p>
                <p className={`text-base font-bold tabular-nums ${trendColor}`}>
                  {ih.corrections.last7d}
                  <span className="text-2xs text-text3 ml-1">{trendLabel}</span>
                </p>
              </div>
              <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                <p className="text-2xs text-text3">Validator accuracy</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {(ih.validator.accuracyRatio * 100).toFixed(0)}%
                </p>
              </div>
              <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                <p className="text-2xs text-text3">Episode coverage</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {(ih.episodes.coverageRatio * 100).toFixed(0)}%
                  <span className="text-2xs text-text3 ml-1">{ih.episodes.created7d}/{ih.episodes.uniqueSessions7d}</span>
                </p>
              </div>
              <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                <p className="text-2xs text-text3">Pending rules</p>
                <p className={`text-base font-bold tabular-nums ${ih.promotion.candidates > 0 ? "text-warning" : "text-text3"}`}>
                  {ih.promotion.candidates}
                  <span className="text-2xs text-text3 ml-1">+{ih.promotion.promoted7d}/7d</span>
                </p>
              </div>
              <div className="rounded-md bg-surface border border-border/50 px-3 py-2">
                <p className="text-2xs text-text3">Workflows</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                  {healthyWf}/{totalWf}
                  <span className="text-2xs text-text3 ml-1">healthy</span>
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Services + Resources ── */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 rounded-xl border border-border bg-surface p-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">Services</p>
          <div className="space-y-1.5">
            {s?.runtimes.map(rt => (
              <div key={rt.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-background/50">
                <div className={`size-2 rounded-full ${rt.status === "healthy" ? "bg-success" : "bg-danger animate-pulse-badge"}`} />
                <span className="text-xs font-medium text-text flex-1">{rt.name}</span>
                <span className="text-2xs tabular-nums text-text3">{rt.latencyMs}ms</span>
              </div>
            )) ?? <p className="text-xs text-text3">Loading...</p>}
          </div>
        </div>

        <div className="col-span-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5"><Server className="size-3 text-accent-porter" /><span className="text-2xs font-semibold uppercase tracking-wide text-text3">RAM</span></div>
            <span className={`text-xs font-bold tabular-nums ${(s?.memory.pct ?? 0) >= 80 ? "text-danger" : "text-text"}`}>{s?.memory.pct ?? 0}%</span>
          </div>
          <ResourceBar pct={s?.memory.pct ?? 0} />
          <div className="flex justify-between mt-2 text-2xs text-text3"><span>{fmtBytes(s?.memory.used ?? 0)}</span><span>{fmtBytes(s?.memory.total ?? 0)}</span></div>
        </div>

        <div className="col-span-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5"><Cpu className="size-3 text-accent-porter" /><span className="text-2xs font-semibold uppercase tracking-wide text-text3">CPU</span></div>
            <span className="text-2xs text-text3">{s?.cpu.cores ?? 0}c</span>
          </div>
          <ResourceBar pct={s ? Math.round(s.cpu.load1m / s.cpu.cores * 100) : 0} />
          <div className="flex gap-2 mt-2 text-2xs text-text3 tabular-nums"><span>1m: {s?.cpu.load1m.toFixed(2) ?? "-"}</span><span>5m: {s?.cpu.load5m.toFixed(2) ?? "-"}</span></div>
        </div>

        <div className="col-span-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5"><HardDrive className="size-3 text-accent-porter" /><span className="text-2xs font-semibold uppercase tracking-wide text-text3">Disk</span></div>
            <span className={`text-xs font-bold tabular-nums ${(s?.disk.pct ?? 0) >= 80 ? "text-danger" : "text-text"}`}>{s?.disk.pct ?? 0}%</span>
          </div>
          <ResourceBar pct={s?.disk.pct ?? 0} />
          <div className="flex justify-between mt-2 text-2xs text-text3"><span>{fmtBytes(s?.disk.used ?? 0)}</span><span>{fmtBytes(s?.disk.total ?? 0)}</span></div>
        </div>
      </div>

      {/* ── Platform Pulse + Terminal ── */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5 rounded-xl border border-border bg-surface p-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">Platform Pulse</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: FolderOpen, label: "Projects", value: d?.projects.total ?? 0 },
              { icon: Bot, label: "Agents", value: d?.agents ?? 0 },
              { icon: Users, label: "Customers", value: d?.customers ?? 0 },
              { icon: MessageSquare, label: "Messages", value: fmtNum(d?.messages ?? 0) },
              { icon: Activity, label: "Orchestrations", value: d?.orchestrations ?? 0 },
              { icon: Zap, label: "Tokens", value: fmtNum((d?.tokens.input ?? 0) + (d?.tokens.output ?? 0)) },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-2 rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5">
                <m.icon className="size-3 text-accent-porter" />
                <div><p className="text-sm font-bold text-text tabular-nums">{m.value}</p><p className="text-2xs text-text3">{m.label}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-7 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Terminal className="size-3 text-accent-porter" />
              <p className="text-2xs font-semibold uppercase tracking-wide text-text3">Live Feed</p>
            </div>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-success animate-pulse-badge" /><span className="text-2xs text-text3">Live</span></span>
          </div>
          <LiveTerminal logs={logEntries} />
        </div>
      </div>

      {/* ── DB + Process + Sessions ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 mb-2"><Database className="size-3 text-accent-porter" /><span className="text-2xs font-semibold uppercase tracking-wide text-text3">Database</span></div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">Size</span><span className="text-text2 tabular-nums">{fmtBytes(s?.db.size ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Audit Events</span><span className="text-text2 tabular-nums">{fmtNum(d?.auditEvents ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Learnings</span><span className="text-text2 tabular-nums">{d?.learnings ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-text3">Emails</span><span className="text-text2 tabular-nums">{d?.emails ?? 0}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 mb-2"><Cpu className="size-3 text-accent-porter" /><span className="text-2xs font-semibold uppercase tracking-wide text-text3">Process</span></div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">RSS</span><span className="text-text2 tabular-nums">{fmtBytes(s?.process.rss ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Heap</span><span className="text-text2 tabular-nums">{fmtBytes(s?.process.heapUsed ?? 0)} / {fmtBytes(s?.process.heapTotal ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-text3">Node</span><span className="text-text2">{s?.platform.nodeVersion ?? "-"}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 mb-2"><Clock className="size-3 text-accent-porter" /><span className="text-2xs font-semibold uppercase tracking-wide text-text3">Sessions</span></div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">Active</span><span className="text-text2 tabular-nums">{s?.sessions.active ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-text3">Concurrent</span><span className="text-text2 tabular-nums">{s?.sessions.concurrent ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-text3">Platform</span><span className="text-text2">{s?.platform.os ?? "-"}/{s?.platform.arch ?? "-"}</span></div>
          </div>
          <Link to="/sessions" className="text-xs text-accent-porter hover:underline mt-2 block">View Active Sessions →</Link>
        </div>
      </div>

      {/* ── Quick Links ── */}
      <div className="flex items-center gap-4 mt-1">
        <Link to="/msg-bus" className="text-xs text-accent-porter hover:underline">View Message Bus →</Link>
        <Link to="/decisions" className="text-xs text-accent-porter hover:underline">View Decisions →</Link>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 2: Activity (from activity.tsx)
// ══════════════════════════════════════════════════════════

const actionColors: Record<string, string> = {
  "auth.login.ok": "bg-success/15 text-success",
  "auth.logout": "bg-text3/15 text-text3",
  "auth.login.fail": "bg-danger/15 text-danger",
  "project.create": "bg-accent-porter/15 text-accent-porter",
  "project.update": "bg-accent-porter/15 text-accent-porter",
  "persona.create": "bg-purple-500/15 text-purple-400",
  "chat.message": "bg-blue-500/15 text-blue-400",
}

function ActivityTab() {
  const [subtab, setSubtab] = useState<"feed" | "learnings">("feed")
  const [actionFilter, setActionFilter] = useState("")

  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ["admin", "activity", actionFilter],
    queryFn: () => {
      const params = actionFilter ? `?action=${actionFilter}&limit=100` : "?limit=100"
      return api<{ entries: AuditEntry[]; actionCounts: Array<{ action: string; cnt: number }>; total: number }>(`/api/admin/activity${params}`)
    },
  })

  const { data: learnData, isLoading: learnLoading } = useQuery({
    queryKey: ["admin", "activity", "learnings"],
    queryFn: () => api<{ learnings: Learning[]; count: number }>("/api/admin/activity/learnings"),
    enabled: subtab === "learnings",
  })

  const isLoading = subtab === "feed" ? feedLoading : learnLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Tabs + filter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSubtab("feed")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            subtab === "feed" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2"
          }`}
        >
          <Activity className="size-3" /> Feed
        </button>
        <button
          onClick={() => setSubtab("learnings")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            subtab === "learnings" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2"
          }`}
        >
          <Brain className="size-3" /> Learnings ({learnData?.count ?? "..."})
        </button>

        {subtab === "feed" && (
          <div className="ml-auto flex items-center gap-1.5">
            {actionFilter && (
              <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0 cursor-pointer" onClick={() => setActionFilter("")}>
                {actionFilter} ×
              </Badge>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
              <Input
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                placeholder="Filter actions..."
                className="h-7 w-[160px] bg-raised border-border pl-7 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {subtab === "feed" ? (
        <>
          {/* Action type chips */}
          {feedData?.actionCounts && feedData.actionCounts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {feedData.actionCounts.slice(0, 12).map(ac => (
                <button
                  key={ac.action}
                  onClick={() => setActionFilter(ac.action === actionFilter ? "" : ac.action)}
                  className={`rounded-md px-2 py-0.5 text-2xs transition-colors ${
                    ac.action === actionFilter
                      ? "bg-accent-porter/15 text-accent-porter"
                      : "bg-raised text-text3 hover:text-text2"
                  }`}
                >
                  {ac.action} ({ac.cnt})
                </button>
              ))}
            </div>
          )}

          {/* Activity table */}
          <div className="rounded-xl border border-border overflow-hidden">
            {!feedData?.entries?.length ? (
              <div className="px-3 py-6 text-center text-xs text-text3">No activity</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 text-left">
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Time</th>
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Actor</th>
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Action</th>
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {feedData.entries.map(e => (
                    <tr key={e.id} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-1 text-2xs text-text3 whitespace-nowrap">{fmtRel(e.ts)}</td>
                      <td className="px-3 py-1 text-xs font-medium text-text">{e.actor}</td>
                      <td className="px-3 py-1">
                        <Badge className={`text-2xs border-0 ${actionColors[e.action] || "bg-text3/15 text-text3"}`}>
                          {e.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-1 text-xs text-text2 truncate max-w-[200px]">{e.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        /* Learnings */
        <div className="rounded-xl border border-border overflow-hidden">
          {!learnData?.learnings?.length ? (
            <div className="px-3 py-6 text-center text-xs text-text3">No learnings extracted yet</div>
          ) : (
            <div className="divide-y divide-border/30">
              {learnData.learnings.map(l => (
                <div key={l.sessionId} className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0">{l.source}</Badge>
                    <span className="text-2xs text-text3">{fmtRel(l.extractedAt)}</span>
                  </div>
                  <p className="text-xs text-text2 leading-relaxed whitespace-pre-wrap">{l.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// TAB 3: Diagnostics (from diagnostics.tsx)
// ══════════════════════════════════════════════════════════

const sourceIcon: Record<string, React.ElementType> = {
  client_js: Globe,
  server_api: Server,
  agent_error: Bot,
  server_unhandled: Bug,
}

const severityColor: Record<string, string> = {
  critical: "bg-danger/15 text-danger",
  error: "bg-warning/15 text-warning",
  warning: "bg-text3/15 text-text3",
}

function DiagnosticsTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "diagnostics"],
    queryFn: () => api<{ errors: ErrorEntry[]; stats: DiagStats }>("/api/admin/diagnostics"),

  })

  const resolve = useMutation({
    mutationFn: (id: number) => api(`/api/admin/diagnostics/${id}/resolve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "diagnostics"] }),
  })

  const resolveAll = useMutation({
    mutationFn: (body: { source?: string; message?: string }) =>
      api("/api/admin/diagnostics/resolve-all", { method: "POST", json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "diagnostics"] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const stats = data?.stats ?? { total: 0, open: 0, today: 0, bySeverity: { critical: 0, error: 0, warning: 0 }, bySource: { client_js: 0, server_api: 0, agent_error: 0 }, topErrors: [] }
  const errors = data?.errors ?? []

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="border-border bg-surface">
          <CardContent className="flex items-center gap-2 p-3">
            <div className="flex size-6 items-center justify-center rounded-lg bg-danger/15">
              <Bug className="size-3 text-danger" />
            </div>
            <div>
              <p className="text-xl font-bold text-text">{stats.open}</p>
              <p className="text-2xs text-text3">Open errors</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardContent className="flex items-center gap-2 p-3">
            <div className="flex size-6 items-center justify-center rounded-lg bg-warning/15">
              <AlertTriangle className="size-3 text-warning" />
            </div>
            <div>
              <p className="text-xl font-bold text-text">{stats.today}</p>
              <p className="text-2xs text-text3">Last 24h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">By Severity</p>
            <div className="flex gap-2">
              {stats.bySeverity.critical > 0 && <Badge className="bg-danger/15 text-danger border-0 text-2xs">{stats.bySeverity.critical} critical</Badge>}
              {stats.bySeverity.error > 0 && <Badge className="bg-warning/15 text-warning border-0 text-2xs">{stats.bySeverity.error} error</Badge>}
              {stats.bySeverity.warning > 0 && <Badge variant="outline" className="text-2xs">{stats.bySeverity.warning} warn</Badge>}
              {stats.bySeverity.critical === 0 && stats.bySeverity.error === 0 && stats.bySeverity.warning === 0 && (
                <span className="text-xs text-success">All clear</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">By Source</p>
            <div className="flex gap-2">
              {stats.bySource.client_js > 0 && <Badge variant="outline" className="text-2xs">{stats.bySource.client_js} frontend</Badge>}
              {stats.bySource.server_api > 0 && <Badge variant="outline" className="text-2xs">{stats.bySource.server_api} API</Badge>}
              {stats.bySource.agent_error > 0 && <Badge variant="outline" className="text-2xs">{stats.bySource.agent_error} agent</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top recurring errors */}
      {stats.topErrors.length > 0 && (
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-text3">Recurring Errors</h3>
              <Button variant="outline" size="xs" onClick={() => resolveAll.mutate({})}>Resolve All</Button>
            </div>
            <div className="space-y-1.5">
              {stats.topErrors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
                  <Badge className={`text-2xs ${severityColor[e.severity] ?? "bg-text3/15 text-text3"} border-0`}>
                    {e.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text truncate">{e.message}</p>
                    <p className="text-2xs text-text3">{e.source} · {fmtRel(e.last_seen)}</p>
                  </div>
                  <Badge variant="outline" className="text-2xs shrink-0">{e.count}x</Badge>
                  <Button variant="ghost" size="icon-xs" onClick={() => resolveAll.mutate({ message: e.message })}>
                    <CheckCircle className="size-3 text-success" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error list */}
      <Card className="border-border bg-surface">
        <CardContent className="p-3">
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2">Error Log</h3>
          {errors.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-success">
              <CheckCircle className="size-4" /> No open errors
            </div>
          ) : (
            <div className="space-y-1">
              {errors.map((e) => {
                const Icon = sourceIcon[e.source] ?? Bug
                const isExpanded = expanded === e.id
                return (
                  <div key={e.id}>
                    <div
                      className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 cursor-pointer hover:bg-raised transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : e.id)}
                    >
                      <Icon className="size-3.5 text-text3 shrink-0" />
                      <Badge className={`text-2xs ${severityColor[e.severity] ?? ""} border-0 shrink-0`}>
                        {e.severity}
                      </Badge>
                      <p className="text-xs text-text flex-1 min-w-0 truncate">{e.message}</p>
                      {e.username && <span className="text-2xs text-text3 shrink-0">@{e.username}</span>}
                      <span className="text-2xs text-text3 shrink-0">{fmtRel(e.created_at)}</span>
                      <Button variant="ghost" size="icon-xs" onClick={(ev) => { ev.stopPropagation(); resolve.mutate(e.id) }}>
                        <X className="size-3" />
                      </Button>
                    </div>
                    {isExpanded && e.stack && (
                      <pre className="mx-3 mt-1 mb-2 overflow-x-auto rounded-md bg-background p-3 text-2xs text-text3 font-mono leading-relaxed">
                        {e.stack}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Page: System (3-tab container)
// ══════════════════════════════════════════════════════════

export default function SystemPage() {
  return (
    <div className="overflow-y-auto p-4 flex-1 scrollbar-thin">
      <Tabs defaultValue="monitor" className="gap-3">
        <TabsList variant="page">
          <TabsTrigger value="monitor"><Monitor className="size-3.5" /> Monitor</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="size-3.5" /> Activity</TabsTrigger>
          <TabsTrigger value="diagnostics"><Bug className="size-3.5" /> Diagnostics</TabsTrigger>
        </TabsList>

        <TabsContent value="monitor">
          <MonitorTab />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab />
        </TabsContent>

        <TabsContent value="diagnostics">
          <DiagnosticsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
