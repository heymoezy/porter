import { useState } from "react"
import { Link } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { AgentPresenceSummary } from "~/components/agent-presence"
import { SkillsStudio } from "~/components/studio/skills-studio"
import { Button } from "~/components/ui/button"
import { Check, X, Dna, History, Sparkles } from "lucide-react"
import { StatusBadge } from "~/components/ui/status-badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/table"

// ── Evolution Types ─────────────────────────────────────

interface Proposal {
  id: string; skill_id: string; skill_name: string; persona_id: string
  change_type: string; proposed_change: unknown; reasoning: string
  triggering_feedback_ids: string[]; status: string
  created_at: number; reviewed_at: number | null; reviewed_by: string | null
}

interface EvolutionEvent {
  id: string; skill_id: string; skill_name: string; persona_id: string
  proposal_id: string | null; change_type: string; change_detail: unknown
  triggered_by: string[]; effectiveness_before: number | null
  effectiveness_after: number | null; created_at: number
}

function fmtDate(epoch: number) { return new Date(epoch * 1000).toLocaleString() }

export default function SkillsPage() {
  const [tab, setTab] = useState<"studio" | "proposals" | "history">("studio")
  const qc = useQueryClient()

  const { data: proposalData, isLoading: loadingP } = useQuery({
    queryKey: ["admin", "evolution", "proposals"],
    queryFn: () => api<{ proposals: Proposal[]; count: number }>("/api/admin/evolution/proposals"),
    enabled: tab === "proposals",
  })
  const { data: eventData, isLoading: loadingE } = useQuery({
    queryKey: ["admin", "evolution", "events"],
    queryFn: () => api<{ events: EvolutionEvent[]; count: number }>("/api/admin/evolution/events"),
    enabled: tab === "history",
  })

  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/admin/evolution/proposals/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "evolution", "proposals"] }),
  })
  const reject = useMutation({
    mutationFn: (id: string) => api(`/api/admin/evolution/proposals/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "evolution", "proposals"] }),
  })

  const proposals = proposalData?.proposals ?? []
  const events = eventData?.events ?? []
  const pendingCount = proposals.filter(p => p.status === "pending").length

  return (
    <div className="overflow-y-auto p-4 flex-1">
      <AgentPresenceSummary surface="skills" className="mb-3" />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {([
          { key: "studio" as const, label: "Studio", icon: Sparkles },
          { key: "proposals" as const, label: `Proposals${pendingCount > 0 ? ` (${pendingCount})` : ""}`, icon: Dna },
          { key: "history" as const, label: "History", icon: History },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-accent-porter text-accent-porter"
                : "border-transparent text-text3 hover:text-text"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Studio Tab */}
      {tab === "studio" && <SkillsStudio />}

      {/* Proposals Tab */}
      {tab === "proposals" && (
        <>
          {loadingP && <div className="flex items-center justify-center py-20"><div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" /></div>}
          {!loadingP && proposals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Dna className="size-8 text-text3/30 mb-2" />
              <p className="text-sm text-text3">No evolution proposals</p>
            </div>
          )}
          {!loadingP && proposals.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <Table size="sm">
                  <TableHeader>
                    <TableRow className="bg-surface/50">
                      <TableHead className="px-4 py-2.5">Skill</TableHead>
                      <TableHead className="px-4 py-2.5">Type</TableHead>
                      <TableHead className="px-4 py-2.5">Reasoning</TableHead>
                      <TableHead className="px-4 py-2.5">Status</TableHead>
                      <TableHead className="px-4 py-2.5">Created</TableHead>
                      <TableHead className="text-right px-4 py-2.5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proposals.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="px-4 py-2.5 font-medium text-accent-porter">{p.skill_name}</TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusBadge status={p.change_type} />
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-text2 max-w-sm"><span className="line-clamp-2">{p.reasoning}</span></TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-text3 tabular-nums text-xs">{fmtDate(p.created_at)}</TableCell>
                        <TableCell className="px-4 py-2.5 text-right">
                          {p.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-success hover:bg-success/10"
                                onClick={() => approve.mutate(p.id)} disabled={approve.isPending || reject.isPending}>
                                <Check className="size-3.5 mr-1" />Approve
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-danger hover:bg-danger/10"
                                onClick={() => reject.mutate(p.id)} disabled={approve.isPending || reject.isPending}>
                                <X className="size-3.5 mr-1" />Reject
                              </Button>
                            </div>
                          ) : <span className="text-2xs text-text3">--</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <>
          {loadingE && <div className="flex items-center justify-center py-20"><div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" /></div>}
          {!loadingE && events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <History className="size-8 text-text3/30 mb-2" />
              <p className="text-sm text-text3">No evolution events</p>
            </div>
          )}
          {!loadingE && events.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <Table size="sm">
                  <TableHeader>
                    <TableRow className="bg-surface/50">
                      <TableHead className="px-4 py-2.5">Skill</TableHead>
                      <TableHead className="px-4 py-2.5">Change</TableHead>
                      <TableHead className="px-4 py-2.5">Detail</TableHead>
                      <TableHead className="px-4 py-2.5">Effectiveness</TableHead>
                      <TableHead className="px-4 py-2.5">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map(e => {
                      const delta = e.effectiveness_before != null && e.effectiveness_after != null
                        ? (e.effectiveness_after - e.effectiveness_before).toFixed(2) : null
                      const pos = delta != null && parseFloat(delta) >= 0
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="px-4 py-2.5 font-medium text-accent-porter">{e.skill_name}</TableCell>
                          <TableCell className="px-4 py-2.5">
                            <StatusBadge status={e.change_type} />
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-text2 max-w-sm">
                            <span className="line-clamp-2 text-xs">{typeof e.change_detail === "object" ? JSON.stringify(e.change_detail) : String(e.change_detail)}</span>
                          </TableCell>
                          <TableCell className="px-4 py-2.5 tabular-nums text-xs">
                            {delta != null ? <span className={pos ? "text-success" : "text-danger"}>{pos ? "+" : ""}{delta}</span> : <span className="text-text3">--</span>}
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-text3 tabular-nums text-xs">{fmtDate(e.created_at)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
