import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Plug } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface McpServer {
  name: string
  scope: "user" | "project" | "user-settings" | "local-settings" | "project-file"
  sourcePath: string
  projectPath?: string
  transport: "stdio" | "http" | "sse" | "unknown"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled: boolean
}

interface McpResponse {
  servers: McpServer[]
  count: number
  byScope: Record<string, number>
  sources: {
    claudeJson: string
    settingsJson: string
    settingsLocalJson: string
    projectsRoot: string
  }
}

// ── Helpers ────────────────────────────────────────────

const SCOPE_BADGE: Record<string, string> = {
  user:             "bg-blue-500/15 text-blue-400 border-blue-500/20",
  project:          "bg-purple-500/15 text-purple-400 border-purple-500/20",
  "user-settings":  "bg-orange-500/15 text-orange-400 border-orange-500/20",
  "local-settings": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "project-file":   "bg-pink-500/15 text-pink-400 border-pink-500/20",
}

const SCOPE_LABEL: Record<string, string> = {
  user:             "user · ~/.claude.json",
  project:          "project · ~/.claude.json",
  "user-settings":  "user · settings.json",
  "local-settings": "user · settings.local.json",
  "project-file":   "project · .mcp.json",
}

const TRANSPORT_BADGE: Record<string, string> = {
  stdio:   "bg-text3/15 text-text3 border-text3/20",
  http:    "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  sse:     "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  unknown: "bg-text3/15 text-text3 border-text3/20",
}

// ── Component ──────────────────────────────────────────

export default function McpPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "mcp"],
    queryFn: () => api<McpResponse>("/api/admin/mcp"),
  })

  const servers = data?.servers ?? []

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Plug className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">MCP Servers</h1>
          <p className="text-sm text-text3 mt-0.5">
            {servers.length} server{servers.length !== 1 ? "s" : ""} configured for the Claude Code CLI on this machine
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && servers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Plug className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No MCP servers found in ~/.claude.json or ~/.claude/settings*.json</p>
        </div>
      )}

      {/* Server cards */}
      {!isLoading && servers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {servers.map(server => (
            <div
              key={`${server.scope}:${server.name}:${server.sourcePath}`}
              className="rounded-xl border border-border bg-surface p-4 hover:border-border/80 transition-colors"
            >
              {/* Header row: name + enabled dot */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`size-2 rounded-full ${server.enabled ? "bg-emerald-400" : "bg-text3/30"}`} />
                <h3 className="text-sm font-semibold text-foreground flex-1 truncate">{server.name}</h3>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <Badge variant="outline" className={`text-2xs ${SCOPE_BADGE[server.scope] ?? SCOPE_BADGE.user}`}>
                  {SCOPE_LABEL[server.scope] ?? server.scope}
                </Badge>
                <Badge variant="outline" className={`text-2xs ${TRANSPORT_BADGE[server.transport] ?? TRANSPORT_BADGE.unknown}`}>
                  {server.transport}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                {server.command && (
                  <div>
                    <p className="text-2xs text-text3 mb-0.5">Command</p>
                    <p className="text-xs text-text2 font-mono truncate">
                      {server.command}{server.args?.length ? ` ${server.args.join(" ")}` : ""}
                    </p>
                  </div>
                )}
                {server.url && (
                  <div>
                    <p className="text-2xs text-text3 mb-0.5">URL</p>
                    <p className="text-xs text-text2 font-mono truncate">{server.url}</p>
                  </div>
                )}
                {server.env && Object.keys(server.env).length > 0 && (
                  <div>
                    <p className="text-2xs text-text3 mb-0.5">Env</p>
                    <div className="space-y-0.5">
                      {Object.entries(server.env).map(([k, v]) => (
                        <p key={k} className="text-2xs text-text2 font-mono truncate">
                          {k}={v}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {server.projectPath && (
                  <div>
                    <p className="text-2xs text-text3 mb-0.5">Project</p>
                    <p className="text-2xs text-text2 font-mono truncate">{server.projectPath}</p>
                  </div>
                )}
                <div>
                  <p className="text-2xs text-text3 mb-0.5">Source</p>
                  <p className="text-2xs text-text3 font-mono truncate">{server.sourcePath}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
