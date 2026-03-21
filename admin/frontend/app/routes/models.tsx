import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { RefreshCw, ToggleLeft, ToggleRight } from "lucide-react"

interface Gateway {
  name: string
  type: string
  url: string
  status: string
  latencyMs: number
  activeModel?: string | null
  models?: string[]
}

interface ModelsResponse {
  gateways: Gateway[]
  activeModels: Record<string, string>
  backendConfig: Record<string, unknown>
}

interface UsageRow {
  model: string
  inputTokens: number
  outputTokens: number
  requests: number
  cost: number
}

interface UsageResponse {
  usage: UsageRow[]
  totalCost: number
  totalTokens: number
  totalRequests: number
}

interface FlagsResponse {
  flags: Record<string, boolean>
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function ModelsContent() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "models"],
    queryFn: () => api<ModelsResponse>("/api/admin/models"),
    refetchInterval: 30_000,
  })

  const { data: usage } = useQuery({
    queryKey: ["admin", "models", "usage"],
    queryFn: () => api<UsageResponse>("/api/admin/models/usage"),
  })

  const { data: flagsData } = useQuery({
    queryKey: ["admin", "models", "flags"],
    queryFn: () => api<FlagsResponse>("/api/admin/models/flags"),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const gateways = data?.gateways ?? []
  const usageRows = usage?.usage ?? []
  const flags = flagsData?.flags ?? {}

  return (
    <div className="space-y-3">
      {/* AI Gateways table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">AI Gateways</span>
          <button onClick={() => refetch()} className="flex items-center gap-1 text-[10px] text-text3 hover:text-accent-porter transition-colors">
            <RefreshCw className="size-3" /> Refresh
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 text-left">
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Gateway</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Type</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Active Model</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Latency</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {gateways.map(gw => {
              const healthy = gw.status === "healthy" || gw.status === "configured"
              return (
                <tr key={gw.name} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`size-2 rounded-full ${healthy ? "bg-success animate-pulse-badge" : "bg-danger"}`} />
                      <span className="text-xs font-bold text-text">{gw.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text3">{gw.type}</td>
                  <td className="px-3 py-1.5 text-xs text-accent-porter font-medium">{gw.activeModel || "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{gw.latencyMs > 0 ? `${gw.latencyMs}ms` : "—"}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Badge className={`text-[10px] border-0 ${healthy ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                      {gw.status}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Token usage */}
      {usageRows.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Token Usage</span>
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">
                {fmtTokens(usage?.totalTokens ?? 0)} tokens
              </Badge>
              <Badge className="text-[10px] bg-warning/15 text-warning border-0">
                ${(usage?.totalCost ?? 0).toFixed(2)}
              </Badge>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Model</th>
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Input</th>
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Output</th>
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Reqs</th>
                <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map(row => (
                <tr key={row.model} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5 text-xs font-medium text-text">{row.model}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtTokens(row.inputTokens)}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtTokens(row.outputTokens)}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{row.requests}</td>
                  <td className="px-3 py-1.5 text-xs font-medium text-warning text-right">${row.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Feature flags */}
      {Object.keys(flags).length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-surface border-b border-border">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Feature Flags</span>
          </div>
          <table className="w-full">
            <tbody>
              {Object.entries(flags).map(([key, val]) => (
                <tr key={key} className="border-b border-border/20 last:border-0">
                  <td className="px-3 py-1 text-xs text-text2 flex-1">{key.replace(/_/g, " ")}</td>
                  <td className="px-3 py-1 text-right">
                    {val
                      ? <ToggleRight className="size-4 text-success inline" />
                      : <ToggleLeft className="size-4 text-text3 inline" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-1 border-t border-border/30">
            <p className="text-[10px] text-text3">Read-only — edit in porter_config.json</p>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-text3">Auto-refreshes every 30s</p>
    </div>
  )
}

export default function ModelsPage() {
  return (
    <AdminShell>
      <ModelsContent />
    </AdminShell>
  )
}
