import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { DispatchLog } from "~/components/bridge/dispatch-log"

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

// ── Helpers ───────────────────────────────────────────────

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ── Page ──────────────────────────────────────────────────

export default function BridgePage() {
  const { data, isLoading } = useQuery<{ gateways: BridgeGateway[] }>({
    queryKey: ["bridge"],
    queryFn: () => api("/api/admin/bridge"),
    refetchInterval: 30_000,
  })

  const gw = data?.gateways?.[0]
  const version = gw?.metadata?.version as string | undefined
  const isUp = gw?.status === "active" && gw?.enabled

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Bridge</h1>
      </div>

      {/* Gateway health bar */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        {isLoading ? (
          <span className="text-sm text-text3">Loading…</span>
        ) : gw ? (
          <>
            <div className={`size-2.5 rounded-full shrink-0 ${isUp ? "bg-success" : "bg-danger animate-pulse"}`} />
            <span className="text-sm font-medium text-text">{gw.name}</span>
            <Badge variant={isUp ? "default" : "destructive"} className="text-2xs">
              {isUp ? "up" : "down"}
            </Badge>
            {version && (
              <span className="text-2xs font-mono text-text3">v{version}</span>
            )}
            {gw.last_health_at && (
              <span className="text-2xs text-text3 ml-auto">
                checked {fmtRel(gw.last_health_at)}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-text3">No gateway configured</span>
        )}
      </div>

      {/* Dispatch log */}
      <DispatchLog />
    </div>
  )
}
