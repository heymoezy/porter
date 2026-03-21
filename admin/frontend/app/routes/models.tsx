import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import {
  Server, Database, Cpu, Globe, Cloud, HardDrive,
  RefreshCw, ToggleLeft, ToggleRight,
} from "lucide-react"

interface Gateway {
  name: string
  type: string
  url: string
  status: string
  latencyMs: number
  version?: string | null
  model?: string | null
  models?: string[]
  activeModel?: string | null
}

interface ModelsResponse {
  gateways: Gateway[]
  activeModels: Record<string, string>
  backendConfig: Record<string, unknown>
  db: { size: number; walSize: number; tables: number }
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

const gatewayIcons: Record<string, React.ElementType> = {
  "Porter.py": Globe,
  "Fastify Backend": Cpu,
  "OpenClaw": Server,
  "Ollama": HardDrive,
  "Gemini": Cloud,
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatTokens(n: number) {
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
  const db = data?.db
  const usageRows = usage?.usage ?? []
  const flags = flagsData?.flags ?? {}

  return (
    <div className="space-y-3">
      {/* Gateway cards */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Gateways</h3>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-text3 hover:text-accent-porter transition-colors">
          <RefreshCw className="size-3" />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {gateways.map((gw, i) => {
          const Icon = gatewayIcons[gw.name] ?? Server
          const healthy = gw.status === "healthy" || gw.status === "configured"
          return (
            <div
              key={gw.name}
              className="animate-card-deal-in rounded-xl border border-border bg-surface p-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`flex size-6 items-center justify-center rounded-lg ${healthy ? "bg-success/15" : "bg-danger/15"}`}>
                    <Icon className={`size-3 ${healthy ? "text-success" : "text-danger"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text">{gw.name}</p>
                    <p className="text-[10px] text-text3">{gw.type}</p>
                  </div>
                </div>
                <div className={`size-2.5 rounded-full ${healthy ? "bg-success animate-pulse-badge" : "bg-danger"}`} />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text3">URL</span>
                  <span className="text-text2 truncate ml-2 max-w-[120px]">{gw.url}</span>
                </div>
                {gw.latencyMs > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text3">Latency</span>
                    <span className="text-text2">{gw.latencyMs}ms</span>
                  </div>
                )}
                {gw.version && (
                  <div className="flex justify-between">
                    <span className="text-text3">Version</span>
                    <span className="text-text2">{gw.version}</span>
                  </div>
                )}
                {gw.model && (
                  <div className="flex justify-between">
                    <span className="text-text3">Model</span>
                    <span className="text-accent-porter font-medium truncate ml-2">{gw.model}</span>
                  </div>
                )}
                {gw.activeModel && (
                  <div className="flex justify-between">
                    <span className="text-text3">Active</span>
                    <span className="text-accent-porter font-medium truncate ml-2">{gw.activeModel}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Usage table */}
      {usageRows.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Token Usage</h3>
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">
                {formatTokens(usage?.totalTokens ?? 0)} tokens
              </Badge>
              <Badge className="text-[10px] bg-warning/15 text-warning border-0">
                ${(usage?.totalCost ?? 0).toFixed(2)} est. cost
              </Badge>
              <Badge className="text-[10px] bg-success/15 text-success border-0">
                {usage?.totalRequests ?? 0} requests
              </Badge>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3">Model</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Input</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Output</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Requests</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map(row => (
                <tr key={row.model} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-sm font-medium text-text">{row.model}</td>
                  <td className="px-3 py-2 text-sm text-text2 text-right">{formatTokens(row.inputTokens)}</td>
                  <td className="px-3 py-2 text-sm text-text2 text-right">{formatTokens(row.outputTokens)}</td>
                  <td className="px-3 py-2 text-sm text-text2 text-right">{row.requests}</td>
                  <td className="px-3 py-2 text-sm font-medium text-warning text-right">${row.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DB Health */}
      {db && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="size-3.5 text-accent-porter" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Database</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-text3">Size</p>
              <p className="text-sm font-medium text-text">{formatBytes(db.size)}</p>
            </div>
            <div>
              <p className="text-xs text-text3">WAL Size</p>
              <p className="text-sm font-medium text-text">{formatBytes(db.walSize)}</p>
            </div>
            <div>
              <p className="text-xs text-text3">Tables</p>
              <p className="text-sm font-medium text-text">{db.tables}</p>
            </div>
          </div>
        </div>
      )}

      {/* Feature Flags */}
      {Object.keys(flags).length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-2">Feature Flags</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(flags).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
                {val
                  ? <ToggleRight className="size-3 text-success shrink-0" />
                  : <ToggleLeft className="size-3 text-text3 shrink-0" />
                }
                <span className="text-xs text-text2 truncate">{key.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-text3">Read-only — edit in porter_config.json</p>
        </div>
      )}

      <p className="text-center text-xs text-text3">Auto-refreshes every 30s</p>
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
