import { useState } from "react"
import { AgentPresenceSummary } from "~/components/agent-presence"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Activity, Brain, Search, Filter } from "lucide-react"

interface AuditEntry {
  id: number
  ts: number
  ts_iso: string
  actor: string
  actor_type: string
  action: string
  target: string
  details: string
  project_id: string | null
}

interface Learning {
  sessionId: string
  source: string
  text: string
  backend: string | null
  extractedAt: number
}

function fmtRel(ts: number) {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

const actionColors: Record<string, string> = {
  "auth.login.ok": "bg-success/15 text-success",
  "auth.logout": "bg-text3/15 text-text3",
  "auth.login.fail": "bg-danger/15 text-danger",
  "project.create": "bg-accent-porter/15 text-accent-porter",
  "project.update": "bg-accent-porter/15 text-accent-porter",
  "persona.create": "bg-purple-500/15 text-purple-400",
  "chat.message": "bg-blue-500/15 text-blue-400",
}

function ActivityContent() {
  const [tab, setTab] = useState<"feed" | "learnings">("feed")
  const [actionFilter, setActionFilter] = useState("")

  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ["admin", "activity", actionFilter],
    queryFn: () => {
      const params = actionFilter ? `?action=${actionFilter}&limit=100` : "?limit=100"
      return api<{ entries: AuditEntry[]; actionCounts: Array<{ action: string; cnt: number }>; total: number }>(`/api/admin/activity${params}`)
    },
  })

  const { data: learnData, isLoading: learnLoading } = useQuery({
    queryKey: ["admin", "activity", "learnings"],
    queryFn: () => api<{ learnings: Learning[]; count: number }>("/api/admin/activity/learnings"),
    enabled: tab === "learnings",
  })

  const isLoading = tab === "feed" ? feedLoading : learnLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Tabs + filter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("feed")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            tab === "feed" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2"
          }`}
        >
          <Activity className="size-3" /> Feed
        </button>
        <button
          onClick={() => setTab("learnings")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            tab === "learnings" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2"
          }`}
        >
          <Brain className="size-3" /> Learnings ({learnData?.count ?? "..."})
        </button>

        {tab === "feed" && (
          <div className="ml-auto flex items-center gap-1.5">
            {actionFilter && (
              <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0 cursor-pointer" onClick={() => setActionFilter("")}>
                {actionFilter} ×
              </Badge>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
              <Input
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                placeholder="Filter actions..."
                className="h-7 w-[160px] bg-raised border-border pl-7 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {tab === "feed" ? (
        <>
          {/* Action type chips */}
          {feedData?.actionCounts && feedData.actionCounts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {feedData.actionCounts.slice(0, 12).map(ac => (
                <button
                  key={ac.action}
                  onClick={() => setActionFilter(ac.action === actionFilter ? "" : ac.action)}
                  className={`rounded-md px-2 py-0.5 text-2xs transition-colors ${
                    ac.action === actionFilter
                      ? "bg-accent-porter/15 text-accent-porter"
                      : "bg-raised text-text3 hover:text-text2"
                  }`}
                >
                  {ac.action} ({ac.cnt})
                </button>
              ))}
            </div>
          )}

          {/* Activity table */}
          <div className="rounded-xl border border-border overflow-hidden">
            {!feedData?.entries?.length ? (
              <div className="px-3 py-6 text-center text-xs text-text3">No activity</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 text-left">
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Time</th>
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Actor</th>
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Action</th>
                    <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {feedData.entries.map(e => (
                    <tr key={e.id} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-1 text-2xs text-text3 whitespace-nowrap">{fmtRel(e.ts)}</td>
                      <td className="px-3 py-1 text-xs font-medium text-text">{e.actor}</td>
                      <td className="px-3 py-1">
                        <Badge className={`text-2xs border-0 ${actionColors[e.action] || "bg-text3/15 text-text3"}`}>
                          {e.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-1 text-xs text-text2 truncate max-w-[200px]">{e.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        /* Learnings */
        <div className="rounded-xl border border-border overflow-hidden">
          {!learnData?.learnings?.length ? (
            <div className="px-3 py-6 text-center text-xs text-text3">No learnings extracted yet</div>
          ) : (
            <div className="divide-y divide-border/30">
              {learnData.learnings.map(l => (
                <div key={l.sessionId} className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-2xs bg-accent-porter/15 text-accent-porter border-0">{l.source}</Badge>
                    <span className="text-2xs text-text3">{fmtRel(l.extractedAt)}</span>
                  </div>
                  <p className="text-xs text-text2 leading-relaxed whitespace-pre-wrap">{l.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ActivityPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <AgentPresenceSummary surface="activity" className="mb-3" />
        <ActivityContent />
      </div>
  )
}
