import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { Card, CardContent } from "~/components/ui/card"
import { DispatchLog } from "~/components/bridge/dispatch-log"
import { CostAnalytics } from "~/components/bridge/cost-analytics"
import { ModelCatalog } from "~/components/bridge/model-catalog"
import { CliActivity } from "~/components/bridge/cli-activity"
import { LiveDispatchTicker } from "~/components/bridge/live-dispatch-ticker"

// ── Types ─────────────────────────────────────────────────

interface BridgeGateway {
  id: string
  name: string
  status: string
  enabled: boolean
  last_health_at: number | null
  metadata: Record<string, unknown>
  status_indicator: string
}

interface BridgeMetrics {
  dispatches_24h: number
  dispatches_7d: number
  total_cost_usd_7d: number
  avg_latency_ms_24h: number | null
  active_models: number
  cli_activity_24h: number
}

// ── Helpers ───────────────────────────────────────────────

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function fmtUsd(v: number) {
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

function fmtMs(ms: number | null) {
  if (ms === null) return "—"
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

// ── Status header ─────────────────────────────────────────

function StatusHeader() {
  const { data: gw } = useQuery<{ gateways: BridgeGateway[] }>({
    queryKey: ["bridge"],
    queryFn: () => api("/api/admin/bridge"),
    refetchInterval: 30_000,
  })

  const { data: metrics } = useQuery<BridgeMetrics>({
    queryKey: ["bridge", "summary"],
    queryFn: () => api("/api/admin/bridge/summary"),
    refetchInterval: 30_000,
  })

  const gateway = gw?.gateways?.[0]
  const version = gateway?.metadata?.version as string | undefined
  const isUp = gateway?.status === "active" && gateway?.enabled

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        {gateway ? (
          <>
            <div className={`size-2.5 rounded-full shrink-0 ${isUp ? "bg-success" : "bg-danger animate-pulse"}`} />
            <span className="text-sm font-medium text-text">{gateway.name}</span>
            <Badge variant={isUp ? "default" : "destructive"} className="text-2xs">
              {isUp ? "up" : "down"}
            </Badge>
            {version && (
              <span className="text-2xs font-mono text-text3">v{version}</span>
            )}
            {gateway.last_health_at && (
              <span className="text-2xs text-text3 ml-auto">
                checked {fmtRel(gateway.last_health_at)}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-text3">No gateway configured</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><CardContent className="p-3">
          <div className="text-2xs uppercase tracking-wider text-text3">Dispatches 24h</div>
          <div className="mt-1 text-lg font-semibold text-text">{metrics?.dispatches_24h ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-2xs uppercase tracking-wider text-text3">Dispatches 7d</div>
          <div className="mt-1 text-lg font-semibold text-text">{metrics?.dispatches_7d ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-2xs uppercase tracking-wider text-text3" title="API-equivalent estimate — CLI backends run on subscription OAuth (actual marginal cost $0)">Est. API-equiv 7d</div>
          <div className="mt-1 text-lg font-semibold text-text">{metrics ? fmtUsd(metrics.total_cost_usd_7d) : "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-2xs uppercase tracking-wider text-text3">Avg latency</div>
          <div className="mt-1 text-lg font-semibold text-text">{fmtMs(metrics?.avg_latency_ms_24h ?? null)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-2xs uppercase tracking-wider text-text3">CLI calls 24h</div>
          <div className="mt-1 text-lg font-semibold text-text">{metrics?.cli_activity_24h ?? "—"}</div>
        </CardContent></Card>
      </div>

      <LiveDispatchTicker />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function BridgePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Bridge</h1>
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="dispatches">Dispatches</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="cli">CLI Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="status"><StatusHeader /></TabsContent>
        <TabsContent value="dispatches"><DispatchLog /></TabsContent>
        <TabsContent value="costs"><CostAnalytics /></TabsContent>
        <TabsContent value="models"><ModelCatalog /></TabsContent>
        <TabsContent value="cli"><CliActivity /></TabsContent>
      </Tabs>
    </div>
  )
}
