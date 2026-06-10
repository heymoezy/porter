/**
 * Bridge — the live ops console for Porter's dispatch layer (v6.31.0 revamp).
 *
 * Layout (viewport-locked, no page scroll — Moe's rule):
 *   ┌ status strip: composite pill + counts ───────────────────────────┐
 *   ├ gateway cards (composite status, usage bars, last dispatch age)  │
 *   │ + consumers table (WHO uses the bridge — Tom, dreams, CLI…)      │
 *   ├ tabs: Dispatches / Costs / Models / CLI ─ internal scroll ───────┤
 *   └ OPERATOR LOG — dark navy live terminal (SSE dispatches + health) ┘
 *
 * Resurrects the best of the pre-v6.9.0 "rich bridge" (composite status,
 * usage bars w/ reset countdown, operator terminal) on real, live data only.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { AnimCount } from "~/components/ui/anim-count"
import { LLMTerminal } from "~/components/llm-terminal"
import { DispatchLog } from "~/components/bridge/dispatch-log"
import { CostAnalytics } from "~/components/bridge/cost-analytics"
import { ModelCatalog } from "~/components/bridge/model-catalog"
import { CliActivity } from "~/components/bridge/cli-activity"

// ── Types ──────────────────────────────────────────────────────────────

interface Gateway {
  id: string
  type: string
  name: string
  status: string
  enabled: number
  circuit_state: string
  last_health_at: number | null
  model_count: number
  metadata?: { version?: string }
}

interface UsageLimit {
  limit_type: string
  period: string
  current: number | null
  limit: number | null
  pct: number | null
  reset_at: number | null
}

interface CapacityGateway {
  gateway_id: string
  models: Array<{ model_name: string; limits: UsageLimit[] }>
  last_429_at?: number | null
}

interface ConsumerRow {
  consumer: string
  n_24h: number
  n_7d: number
  avg_latency_ms: number | null
  last_at: number | null
}

interface GatewayStats {
  gateway_type: string
  n_24h: number
  avg_latency_ms: number | null
  last_at: number | null
}

interface Summary {
  dispatches_24h: number
  dispatches_7d: number
  total_cost_usd_7d: number
  avg_latency_ms_24h: number | null
  active_models: number
  cli_activity_24h: number
}

// ── Composite status (resurrected from the rich bridge, 95abb6ca) ──────

type CompositeStatus = "online" | "busy" | "throttled" | "blocked" | "paused" | "offline"

const STATUS_STYLES: Record<CompositeStatus, { dot: string; label: string; text: string }> = {
  online:    { dot: "bg-success",                label: "online",    text: "text-success" },
  busy:      { dot: "bg-warning",                label: "busy",      text: "text-warning" },
  throttled: { dot: "bg-orange-500",             label: "throttled", text: "text-orange-600" },
  blocked:   { dot: "bg-danger",                 label: "blocked",   text: "text-danger" },
  paused:    { dot: "bg-text3",                  label: "paused",    text: "text-text3" },
  offline:   { dot: "bg-danger animate-pulse",   label: "offline",   text: "text-danger" },
}

function deriveCompositeStatus(gw: Gateway, cap?: CapacityGateway): CompositeStatus {
  if (!gw.enabled) return "paused"
  if (gw.status !== "active") return "offline"
  if (gw.circuit_state === "open") return "blocked"
  if (!cap) return "online"
  let maxPct = 0
  for (const m of cap.models) for (const l of m.limits) if (l.pct != null) maxPct = Math.max(maxPct, l.pct)
  if (maxPct >= 1) return "blocked"
  if (maxPct >= 0.9 || (cap.last_429_at && Date.now() / 1000 - cap.last_429_at < 300)) return "throttled"
  if (maxPct >= 0.7) return "busy"
  return "online"
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmtAge(epoch: number | null | undefined): string {
  if (!epoch) return "—"
  const s = Math.max(0, Math.round(Date.now() / 1000 - epoch))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function fmtResetIn(resetAt: number | null): string | null {
  if (!resetAt) return null
  const left = Math.max(0, Math.round(resetAt - Date.now() / 1000))
  if (left <= 0) return "resetting"
  if (left < 60) return `resets ${left}s`
  if (left < 3600) return `resets ${Math.round(left / 60)}m`
  if (left < 86400) return `resets ${Math.floor(left / 3600)}h ${Math.round((left % 3600) / 60)}m`
  return `resets ${Math.round(left / 86400)}d`
}

function capacityBarColor(pct: number): string {
  if (pct >= 100) return "bg-danger"
  if (pct >= 90) return "bg-orange-500"
  if (pct >= 70) return "bg-warning"
  return "bg-accent-porter"
}

const fmtUsd = (v: number) => (v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`)
const fmtMs = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)

// ── Operator log (terminal feed) ───────────────────────────────────────

interface OpLine { text: string; color: string; _key: number }
let opKey = 1

function useOperatorLog(gateways: Gateway[], consumers: ConsumerRow[]) {
  const [events, setEvents] = useState<OpLine[]>([])
  const eventsRef = useRef<OpLine[]>([])

  useEffect(() => {
    const es = new EventSource("/api/events")
    const push = (text: string, color: string) => {
      const next = [...eventsRef.current, { text, color, _key: opKey++ }].slice(-80)
      eventsRef.current = next
      setEvents(next)
    }
    const ts = () => new Date().toLocaleTimeString("en-SG", { hour12: false, timeZone: "Asia/Singapore" })
    es.addEventListener("bridge:dispatch", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        const src = d.source_agent ? ` ‹${d.source_agent}›` : ""
        push(`${ts()} → ${d.model_name ?? d.gateway_type ?? "dispatch"}${src} ${d.latency_ms ? `· ${fmtMs(d.latency_ms)}` : ""}`, "text-accent-porter")
      } catch { /* ignore malformed */ }
    })
    es.addEventListener("bridge:health", () => push(`${ts()} ✓ gateway health refreshed`, "text-text3"))
    es.addEventListener("bridge:circuit-trip", (e) => {
      try { const d = JSON.parse((e as MessageEvent).data); push(`${ts()} ✗ circuit OPEN on ${d.gateway_type ?? "gateway"}`, "text-danger") } catch { /* */ }
    })
    es.addEventListener("cli:activity", (e) => {
      try { const d = JSON.parse((e as MessageEvent).data); push(`${ts()} ↳ cli ${d.tool ?? d.intent ?? "activity"}`, "text-chart-2") } catch { /* */ }
    })
    return () => es.close()
  }, [])

  // Baseline lines so the terminal is informative at rest (real data, not filler)
  const baseline: OpLine[] = useMemo(() => {
    const lines: OpLine[] = []
    let k = -1000
    for (const gw of gateways) {
      const ver = gw.metadata?.version ? ` ${gw.metadata.version}` : ""
      lines.push({ text: `gateway ${gw.type}${ver} — ${gw.status}, circuit ${gw.circuit_state}, ${gw.model_count} models`, color: gw.status === "active" ? "text-success" : "text-danger", _key: k++ })
    }
    for (const c of consumers.slice(0, 6)) {
      lines.push({ text: `consumer ${c.consumer} — ${c.n_24h} dispatches 24h, avg ${fmtMs(c.avg_latency_ms)}, last ${fmtAge(c.last_at)}`, color: "text-text2", _key: k++ })
    }
    return lines
  }, [gateways, consumers])

  return [...baseline, ...events]
}

// ── Screen ─────────────────────────────────────────────────────────────

export default function BridgePage() {
  const gatewaysQ = useQuery({
    queryKey: ["bridge", "gateway-cards"],
    queryFn: () => api<{ gateways: Gateway[] }>("/api/admin/bridge"),
    refetchInterval: 30_000,
  })
  const summaryQ = useQuery({
    queryKey: ["bridge", "summary"],
    queryFn: () => api<Summary>("/api/admin/bridge/summary"),
    refetchInterval: 30_000,
  })
  const capacityQ = useQuery({
    queryKey: ["bridge", "capacity"],
    queryFn: () => api<{ gateways: CapacityGateway[] }>("/api/admin/bridge/capacity"),
    refetchInterval: 60_000,
  })
  const consumersQ = useQuery({
    queryKey: ["bridge", "consumers"],
    queryFn: () => api<{ consumers: ConsumerRow[]; gateways: GatewayStats[] }>("/api/admin/bridge/consumers"),
    refetchInterval: 30_000,
  })

  const gateways = gatewaysQ.data?.gateways ?? []
  const summary = summaryQ.data
  const capacities = capacityQ.data?.gateways ?? []
  const consumers = consumersQ.data?.consumers ?? []
  const gwStats = consumersQ.data?.gateways ?? []
  const logLines = useOperatorLog(gateways, consumers)

  const statuses = gateways.map(gw => deriveCompositeStatus(gw, capacities.find(c => c.gateway_id === gw.id)))
  const overall: { label: string; cls: string } =
    statuses.length === 0 ? { label: "No gateways", cls: "bg-danger/10 text-danger" }
    : statuses.includes("offline") || statuses.includes("blocked") ? { label: "Degraded", cls: "bg-danger/10 text-danger" }
    : statuses.includes("throttled") || statuses.includes("busy") ? { label: "Under load", cls: "bg-warning/10 text-warning" }
    : { label: "All systems go", cls: "bg-success/10 text-success" }

  const [tab, setTab] = useState("dispatches")

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4 animate-page-fade-slide">
      {/* ── Status strip ── */}
      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 shadow-[var(--shadow-card)]">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${overall.cls}`}>
          <span className="size-1.5 rounded-full bg-current animate-pulse-badge" />
          {overall.label}
        </span>
        <div className="flex items-center gap-4 text-2xs text-text2">
          <span><strong className="text-text tabular-nums"><AnimCount to={summary?.dispatches_24h ?? 0} /></strong> dispatches 24h</span>
          <span><strong className="text-text tabular-nums"><AnimCount to={summary?.dispatches_7d ?? 0} /></strong> 7d</span>
          <span>avg <strong className="text-text">{fmtMs(summary?.avg_latency_ms_24h)}</strong></span>
          <span><strong className="text-text tabular-nums"><AnimCount to={summary?.cli_activity_24h ?? 0} /></strong> CLI calls 24h</span>
          <span title="API-equivalent estimate — CLI backends run on subscription OAuth (actual marginal cost $0)">
            est. API-equiv 7d <strong className="text-text">{summary ? fmtUsd(summary.total_cost_usd_7d) : "—"}</strong>
          </span>
        </div>
      </div>

      {/* ── Gateways + consumers ── */}
      <div className="grid shrink-0 grid-cols-12 gap-3">
        {gateways.map(gw => {
          const cap = capacities.find(c => c.gateway_id === gw.id)
          const st = STATUS_STYLES[deriveCompositeStatus(gw, cap)]
          const stats = gwStats.find(s => s.gateway_type === gw.type)
          const limits = (cap?.models ?? []).flatMap(m => m.limits).filter(l => l.pct != null)
            .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 2)
          return (
            <div key={gw.id} className="col-span-4 rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${st.dot}`} />
                <span className="text-sm font-semibold text-text">{gw.name}</span>
                <span className={`text-2xs font-medium ${st.text}`}>{st.label}</span>
                <span className="ml-auto font-mono text-2xs text-text3">{gw.metadata?.version ?? ""}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-2xs text-text3">
                <span>{gw.model_count} models</span>
                <span><strong className="text-text2 tabular-nums">{stats?.n_24h ?? 0}</strong> dispatches 24h</span>
                <span>avg {fmtMs(stats?.avg_latency_ms)}</span>
                <span>last {fmtAge(stats?.last_at)}</span>
              </div>
              {limits.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {limits.map((l, i) => {
                    const pct = Math.round((l.pct ?? 0) * 100)
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-2xs text-text3">
                          <span>{l.limit_type} · {l.period} ({pct}%)</span>
                          <span>{fmtResetIn(l.reset_at)}</span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-raised">
                          <div className={`h-full rounded-full transition-all duration-700 ${capacityBarColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Consumers — WHO is driving the bridge */}
        <div className="col-span-4 rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
          <p className="text-2xs font-semibold uppercase tracking-wider text-text3">Consumers · 7d</p>
          <div className="mt-1.5 space-y-0.5">
            {consumers.length === 0 && <p className="text-2xs text-text3">{consumersQ.isError ? "query failed" : "no dispatches in 7d"}</p>}
            {consumers.slice(0, 5).map(c => (
              <div key={c.consumer} className="flex items-center gap-2 text-xs">
                <span className="size-1.5 rounded-full bg-accent-porter/60" />
                <span className="font-medium text-text">{c.consumer}</span>
                <span className="ml-auto tabular-nums text-text2">{c.n_24h}<span className="text-text3">/24h</span></span>
                <span className="w-14 text-right tabular-nums text-text3">{fmtMs(c.avg_latency_ms)}</span>
                <span className="w-16 text-right text-2xs text-text3">{fmtAge(c.last_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Detail tabs (internal scroll) ── */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="dispatches">Dispatches</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="cli">CLI Activity</TabsTrigger>
        </TabsList>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <TabsContent value="dispatches" className="animate-tab-crossfade"><DispatchLog /></TabsContent>
          <TabsContent value="costs" className="animate-tab-crossfade"><CostAnalytics /></TabsContent>
          <TabsContent value="models" className="animate-tab-crossfade"><ModelCatalog /></TabsContent>
          <TabsContent value="cli" className="animate-tab-crossfade"><CliActivity /></TabsContent>
        </div>
      </Tabs>

      {/* ── Operator log — the live navy strip ── */}
      <div className="h-40 shrink-0">
        <LLMTerminal lines={logLines} title="Operator Log" pulse className="h-full" />
      </div>
    </div>
  )
}
