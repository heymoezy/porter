import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Radio, BarChart3 } from "lucide-react"
import { StatusBadge } from "~/components/ui/status-badge"

interface MsgBusStats {
  total: number
  avgLatencyMs: number
  byIntent: Array<{ intent: string; count: number }>
  byStatus: Array<{ status: string; count: number }>
}

interface ConfidenceEntry {
  gateway_id: string
  gateway_name: string
  avg_score: number
  total_scored: number
  recent_avg: number
}

function scoreColor(score: number): string {
  if (score >= 4) return "bg-success"
  if (score >= 3) return "bg-warning"
  return "bg-danger"
}

export function OpsPanel() {
  const { data: busData } = useQuery({
    queryKey: ["admin", "msg-bus", "stats"],
    queryFn: () => api<MsgBusStats>("/api/admin/msg-bus/stats"),
    refetchInterval: 30_000,
  })

  const { data: routingData } = useQuery({
    queryKey: ["admin", "routing", "confidence"],
    queryFn: () => api<{ entries: ConfidenceEntry[] }>("/api/admin/routing/confidence"),
    refetchInterval: 30_000,
  })

  const entries = routingData?.entries ?? []

  return (
    <Card className="bg-[var(--surface,#222a38)] border-[var(--border,#3d4758)]">
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wide text-[var(--foreground,#f6f8fb)]">
          Ops
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3 space-y-3">
        {/* Message Bus */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Radio className="size-3 text-info" />
            <span className="text-2xs font-semibold text-[var(--foreground,#f6f8fb)]">Message Bus</span>
          </div>
          {busData ? (
            <>
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-2xs text-[var(--text3,#8a95a8)]">
                  <span className="text-[var(--foreground,#f6f8fb)] font-bold">{busData.total}</span> messages
                </span>
                <span className="text-2xs text-[var(--text3,#8a95a8)]">
                  avg <span className="text-[var(--foreground,#f6f8fb)] font-bold">{Math.round(busData.avgLatencyMs)}ms</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {busData.byStatus.map((s) => (
                  <StatusBadge key={s.status} status={s.status} label={`${s.status} ${s.count}`} className="px-1.5 py-0" />
                ))}
              </div>
            </>
          ) : (
            <p className="text-2xs text-[var(--text3,#8a95a8)]">Loading...</p>
          )}
        </div>

        <div className="h-px bg-[var(--border,#3d4758)]" />

        {/* Routing Confidence */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <BarChart3 className="size-3 text-success" />
            <span className="text-2xs font-semibold text-[var(--foreground,#f6f8fb)]">Routing</span>
          </div>
          {entries.length > 0 ? (
            <div className="space-y-1.5">
              {entries.map((e) => (
                <div key={e.gateway_id} className="flex items-center gap-2">
                  <span className="text-2xs text-[var(--foreground,#f6f8fb)] w-20 truncate shrink-0">{e.gateway_name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--raised,#2b3444)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${scoreColor(e.avg_score)} transition-all duration-500`}
                      style={{ width: `${(e.avg_score / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-2xs text-[var(--text3,#8a95a8)] tabular-nums shrink-0">
                    {e.avg_score.toFixed(1)} ({e.total_scored})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xs text-[var(--text3,#8a95a8)]">No routing data</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
