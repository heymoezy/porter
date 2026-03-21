import { useState } from "react"
import { Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Bot, Search, ChevronRight, Shield, Sparkles, FolderKanban } from "lucide-react"

interface Agent {
  id: string
  name: string
  role: string
  agent_group: string
  is_system: number
  is_locked: number
  is_master: number
  owner: string
  status: string
  dispatch_mode: string
  appearance_spec: string
  skillCount: number
  deployments: number
  fileCount: number
}

function AgentsContent() {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api<{ agents: Agent[]; total: number; system: number; user: number }>("/api/admin/agents"),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const allAgents = data?.agents ?? []
  const agents = search
    ? allAgents.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.role.toLowerCase().includes(search.toLowerCase()) ||
        a.agent_group.toLowerCase().includes(search.toLowerCase())
      )
    : allAgents

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="size-3 text-accent-porter" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">
          {data?.total ?? 0} agents · {data?.system ?? 0} system · {data?.user ?? 0} user
        </span>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter agents..."
            className="h-7 w-[180px] bg-raised border-border pl-7 text-xs"
          />
        </div>
      </div>

      {/* Agent table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-surface text-left">
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Agent</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Role</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">Group</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Skills</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Projects</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Files</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody>
            {agents.map(a => {
              let spec: Record<string, string> = {}
              try { spec = typeof a.appearance_spec === 'string' ? JSON.parse(a.appearance_spec) : a.appearance_spec || {} } catch {}
              const palette = spec.palette ?? spec
              return (
                <tr key={a.id} className="border-b border-border/20 last:border-0 hover:bg-surface/60 transition-colors">
                  <td className="px-3 py-1.5">
                    <Link to={`/agents/${a.id}`} className="flex items-center gap-2">
                      <PixelPortrait
                        hair={palette.hair || "#2c1b18"}
                        skin={palette.skin || "#f1c27d"}
                        eyes={palette.eyes || "#1a1a2e"}
                        shirt={palette.shirt || "#64748b"}
                        hairStyle="short"
                        size="xs"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-text">{a.name}</span>
                          {a.is_system ? <Shield className="size-2.5 text-accent-porter" /> : null}
                          {a.is_locked ? <span className="text-[9px] text-text3">locked</span> : null}
                        </div>
                        <span className="text-[10px] text-text3">{a.dispatch_mode}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text3 max-w-[250px] truncate">{a.role}</td>
                  <td className="px-3 py-1.5">
                    {a.agent_group && (
                      <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">{a.agent_group}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="flex items-center justify-end gap-1 text-xs text-text2">
                      <Sparkles className="size-2.5 text-text3" />{a.skillCount}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="flex items-center justify-end gap-1 text-xs text-text2">
                      <FolderKanban className="size-2.5 text-text3" />{a.deployments}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{a.fileCount}</td>
                  <td className="px-1 py-1.5">
                    <Link to={`/agents/${a.id}`}>
                      <ChevronRight className="size-3 text-text3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {agents.length === 0 && (
        <div className="py-6 text-center text-xs text-text3">
          {search ? "No agents match" : "No agents found"}
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  return (
    <AdminShell>
      <AgentsContent />
    </AdminShell>
  )
}
