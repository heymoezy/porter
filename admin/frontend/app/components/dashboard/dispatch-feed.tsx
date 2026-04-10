import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Activity } from "lucide-react"

interface DispatchEntry {
  id: string
  gateway_type: string
  model_name: string
  tokens_in: number
  tokens_out: number
  latency_ms: number
  persona_id: string | null
  created_at: number
}

function relativeTime(ts: number): string {
  const secs = Math.floor(Date.now() / 1000 - ts)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function DispatchFeed() {
  const { data } = useQuery({
    queryKey: ["admin", "costs", "dispatches"],
    queryFn: () => api<{ dispatches: DispatchEntry[] }>("/api/admin/costs/dispatches?limit=20"),
    refetchInterval: 30_000,
  })

  const dispatches = data?.dispatches ?? []

  return (
    <Card className="bg-[var(--surface,#222a38)] border-[var(--border,#3d4758)]">
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground,#f6f8fb)]">
          Dispatches
          {dispatches.length > 0 && (
            <Badge className="bg-[var(--accent-porter,#6366f1)]/15 text-[var(--accent-porter,#6366f1)] text-2xs px-1.5 py-0">
              {dispatches.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        {dispatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-[var(--text3,#8a95a8)]">
            <Activity className="size-5 mb-1 opacity-30" />
            <span className="text-xs">No dispatches yet</span>
          </div>
        ) : (
          <div className="space-y-0.5 max-h-[280px] overflow-y-auto scrollbar-thin">
            {dispatches.map((e, i) => {
              const totalTokens = (e.tokens_in ?? 0) + (e.tokens_out ?? 0)
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md py-1.5 px-2 hover:bg-[var(--raised,#2b3444)]/50 transition-colors"
                >
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${i === 0 ? "bg-green-400 animate-pulse" : "bg-[var(--text3,#8a95a8)]/40"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs text-[var(--foreground,#f6f8fb)]">
                      <span className="font-bold">{e.model_name}</span>
                      {" "}{formatTokens(totalTokens)} tokens
                      {" "}&middot; {Math.round(e.latency_ms)}ms
                      {e.persona_id && (
                        <span className="text-[var(--text3,#8a95a8)]"> &middot; {e.persona_id}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-2xs text-[var(--text3,#8a95a8)] shrink-0">{relativeTime(e.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
