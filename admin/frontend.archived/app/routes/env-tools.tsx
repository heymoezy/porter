import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Wrench, RefreshCw } from "lucide-react"
import { StatusDot, statusTextClass } from "~/components/ui/status-badge"

// ── Types ──────────────────────────────────────────────

interface EnvTool {
  key: string
  detected: boolean
  version: string
  source: string
  health: string
  lastChecked: number
}

// ── Helpers ────────────────────────────────────────────

function fmtDate(epoch: number) {
  if (!epoch) return "Never"
  return new Date(epoch * 1000).toLocaleString()
}

const SOURCE_BADGE: Record<string, string> = {
  local:     "bg-blue-500/15 text-blue-400 border-blue-500/20",
  system:    "bg-purple-500/15 text-purple-400 border-purple-500/20",
  npm:       "bg-orange-500/15 text-orange-400 border-orange-500/20",
  pip:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  manual:    "bg-text3/15 text-text3 border-text3/20",
}

// ── Component ──────────────────────────────────────────

export default function EnvToolsPage() {
  const qc = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "env-tools"],
    queryFn: () => api<{ tools: EnvTool[]; count: number }>("/api/admin/env-tools"),
  })

  const refresh = useMutation({
    mutationFn: () => api("/api/admin/env-tools/refresh", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "env-tools"] }),
  })

  const tools = data?.tools ?? []

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Wrench className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Environment Tools</h1>
          <p className="text-sm text-text3 mt-0.5">{tools.length} tool{tools.length !== 1 ? "s" : ""} detected</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-text3 hover:text-text"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${isFetching || refresh.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && tools.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Wrench className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No environment tools detected</p>
        </div>
      )}

      {/* Tool Cards Grid */}
      {!isLoading && tools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map(tool => (
            <div
              key={tool.key}
              className="rounded-xl border border-border bg-surface p-4 hover:border-border/80 transition-colors"
            >
              {/* Header row: name + health dot */}
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={tool.health} />
                <h3 className="text-sm font-semibold text-foreground flex-1 truncate">{tool.key}</h3>
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-text3">Version</span>
                  <span className="text-xs text-text2 font-mono">{tool.version || "--"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-text3">Source</span>
                  <Badge variant="outline" className={`text-2xs ${SOURCE_BADGE[tool.source] ?? SOURCE_BADGE.manual}`}>
                    {tool.source}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-text3">Health</span>
                  <span className={`text-xs font-medium ${statusTextClass(tool.health)}`}>
                    {tool.health}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-text3">Last Checked</span>
                  <span className="text-2xs text-text3">{fmtDate(tool.lastChecked)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
