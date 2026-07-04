import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Switch } from "~/components/ui/switch"
import { Wrench, Link2 } from "lucide-react"

// ── Types ──────────────────────────────────────────────────

interface Tool {
  key: string
  detected: boolean
  version: string
  source: string
  health: string
  lastChecked: number
}

interface Connection {
  id: string
  provider: string
  kind: string
  status: string
  displayName: string
  toolsCount: number
  lastSync: number
  lastError: string
  installedBy: string
  createdAt: number
}

// ── Component ──────────────────────────────────────────────

export function ToolsStudio() {
  const qc = useQueryClient()
  const { data: toolsData, isLoading: toolsLoading } = useQuery({
    queryKey: ["admin", "tools"],
    queryFn: () => api<{ tools: Tool[]; count: number }>("/api/admin/tools"),
  })
  const { data: connData, isLoading: connLoading } = useQuery({
    queryKey: ["admin", "tools", "connections"],
    queryFn: () => api<{ connections: Connection[]; count: number }>("/api/admin/tools/connections"),
  })
  const toggleTool = useMutation({
    mutationFn: (key: string) => api(`/api/admin/tools/${key}/toggle`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tools"] }),
  })

  if (toolsLoading || connLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const tools = toolsData?.tools ?? []
  const connections = connData?.connections ?? []
  const serverTools = tools.filter(t => ["local", "system"].includes(t.source) || !t.source)
  const runtimeTools = tools.filter(t => t.source && !["local", "system"].includes(t.source))

  return (
    <div className="space-y-3">
      {/* Server Tools */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
          <Wrench className="size-3 text-accent-porter" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Server Tools ({serverTools.length})</span>
        </div>
        {serverTools.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text3">No server tools detected</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Tool</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Version</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Status</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Visible</th>
              </tr>
            </thead>
            <tbody>
              {serverTools.map(t => {
                const visible = t.health !== "hidden"
                return (
                  <tr key={t.key} className="border-b border-border/30 last:border-0">
                    <td className="px-3 py-1.5 text-xs font-medium text-text">{t.key}</td>
                    <td className="px-3 py-1.5 text-xs text-text2">{t.version || "—"}</td>
                    <td className="px-3 py-1.5">
                      <Badge className={`text-2xs border-0 ${t.detected ? "bg-success/15 text-success" : "bg-text3/15 text-text3"}`}>
                        {t.detected ? "detected" : "missing"}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Switch
                        checked={visible}
                        onCheckedChange={() => toggleTool.mutate(t.key)}
                        className="scale-75"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Runtime Tools (user-side) */}
      {runtimeTools.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
            <Wrench className="size-3 text-warning" />
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Runtime Tools ({runtimeTools.length})</span>
            <span className="text-2xs text-text3 ml-1">user-side</span>
          </div>
          <table className="w-full">
            <tbody>
              {runtimeTools.map(t => (
                <tr key={t.key} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5 text-xs font-medium text-text">{t.key}</td>
                  <td className="px-3 py-1.5 text-xs text-text2">{t.version || "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-text3">{t.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Connections */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
          <Link2 className="size-3 text-accent-porter" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Connections ({connections.length})</span>
        </div>
        {connections.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text3">No workspace connections configured</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Provider</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Kind</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Tools</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Status</th>
              </tr>
            </thead>
            <tbody>
              {connections.map(c => (
                <tr key={c.id} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5 text-xs font-medium text-text">{c.displayName || c.provider}</td>
                  <td className="px-3 py-1.5 text-xs text-text2">{c.kind}</td>
                  <td className="px-3 py-1.5 text-xs text-text2">{c.toolsCount}</td>
                  <td className="px-3 py-1.5">
                    <Badge className={`text-2xs border-0 ${c.status === "connected" ? "bg-success/15 text-success" : "bg-text3/15 text-text3"}`}>
                      {c.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
