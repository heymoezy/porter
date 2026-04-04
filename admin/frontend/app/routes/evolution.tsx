import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Check, X, Dna, History } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface Proposal {
  id: string
  skill_id: string
  skill_name: string
  persona_id: string
  change_type: string
  proposed_change: unknown
  reasoning: string
  triggering_feedback_ids: string[]
  status: string
  created_at: number
  reviewed_at: number | null
  reviewed_by: string | null
}

interface EvolutionEvent {
  id: string
  skill_id: string
  skill_name: string
  persona_id: string
  proposal_id: string | null
  change_type: string
  change_detail: unknown
  triggered_by: string[]
  effectiveness_before: number | null
  effectiveness_after: number | null
  created_at: number
}

// ── Helpers ────────────────────────────────────────────

function fmtDate(epoch: number) {
  return new Date(epoch * 1000).toLocaleString()
}

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  rejected: "bg-red-500/15 text-red-400 border-red-500/20",
  applied:  "bg-blue-500/15 text-blue-400 border-blue-500/20",
}

const TYPE_BADGE: Record<string, string> = {
  enhance:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  specialize: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  merge:      "bg-orange-500/15 text-orange-400 border-orange-500/20",
  deprecate:  "bg-red-500/15 text-red-400 border-red-500/20",
}

// ── Component ──────────────────────────────────────────

export default function EvolutionPage() {
  const [tab, setTab] = useState<"proposals" | "events">("proposals")
  const qc = useQueryClient()

  const { data: proposalData, isLoading: loadingP } = useQuery({
    queryKey: ["admin", "evolution", "proposals"],
    queryFn: () => api<{ proposals: Proposal[]; count: number }>("/api/admin/evolution/proposals"),
  })

  const { data: eventData, isLoading: loadingE } = useQuery({
    queryKey: ["admin", "evolution", "events"],
    queryFn: () => api<{ events: EvolutionEvent[]; count: number }>("/api/admin/evolution/events"),
  })

  const approve = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/evolution/proposals/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "evolution", "proposals"] }),
  })

  const reject = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/evolution/proposals/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "evolution", "proposals"] }),
  })

  const proposals = proposalData?.proposals ?? []
  const events = eventData?.events ?? []
  const pendingCount = proposals.filter(p => p.status === "pending").length

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Dna className="size-5 text-accent-porter" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Skill Evolution</h1>
          <p className="text-sm text-text3 mt-0.5">
            {pendingCount} pending proposal{pendingCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTab("proposals")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "proposals"
              ? "border-accent-porter text-accent-porter"
              : "border-transparent text-text3 hover:text-text"
          }`}
        >
          Proposals
        </button>
        <button
          onClick={() => setTab("events")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "events"
              ? "border-accent-porter text-accent-porter"
              : "border-transparent text-text3 hover:text-text"
          }`}
        >
          Events
        </button>
      </div>

      {/* Proposals Tab */}
      {tab === "proposals" && (
        <>
          {loadingP && (
            <div className="flex items-center justify-center py-20">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          )}

          {!loadingP && proposals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Dna className="size-8 text-text3/30 mb-2" />
              <p className="text-sm text-text3">No evolution proposals</p>
            </div>
          )}

          {!loadingP && proposals.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Skill</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Type</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Reasoning</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Created</th>
                      <th className="text-right font-medium text-text3 px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map(p => {
                      const isPending = p.status === "pending"
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                          <td className="px-4 py-2.5 text-foreground font-medium">{p.skill_name}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={`text-2xs ${TYPE_BADGE[p.change_type] ?? "bg-text3/15 text-text3"}`}>
                              {p.change_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-text2 max-w-sm">
                            <span className="line-clamp-2">{p.reasoning}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={`text-2xs ${STATUS_BADGE[p.status] ?? "bg-text3/15 text-text3"}`}>
                              {p.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-text3 tabular-nums text-xs">{fmtDate(p.created_at)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                  onClick={() => approve.mutate(p.id)}
                                  disabled={approve.isPending || reject.isPending}
                                >
                                  <Check className="size-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  onClick={() => reject.mutate(p.id)}
                                  disabled={approve.isPending || reject.isPending}
                                >
                                  <X className="size-3.5 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-2xs text-text3">--</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Events Tab */}
      {tab === "events" && (
        <>
          {loadingE && (
            <div className="flex items-center justify-center py-20">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          )}

          {!loadingE && events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <History className="size-8 text-text3/30 mb-2" />
              <p className="text-sm text-text3">No evolution events</p>
            </div>
          )}

          {!loadingE && events.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Skill</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Change Type</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Detail</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Effectiveness</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(e => {
                      const delta =
                        e.effectiveness_before != null && e.effectiveness_after != null
                          ? (e.effectiveness_after - e.effectiveness_before).toFixed(2)
                          : null
                      const deltaPositive = delta != null && parseFloat(delta) >= 0
                      return (
                        <tr key={e.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                          <td className="px-4 py-2.5 text-foreground font-medium">{e.skill_name}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={`text-2xs ${TYPE_BADGE[e.change_type] ?? "bg-text3/15 text-text3"}`}>
                              {e.change_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-text2 max-w-sm">
                            <span className="line-clamp-2 text-xs">
                              {typeof e.change_detail === "object"
                                ? JSON.stringify(e.change_detail)
                                : String(e.change_detail)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-xs">
                            {delta != null ? (
                              <span className={deltaPositive ? "text-emerald-400" : "text-red-400"}>
                                {deltaPositive ? "+" : ""}{delta}
                              </span>
                            ) : (
                              <span className="text-text3">--</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-text3 tabular-nums text-xs">{fmtDate(e.created_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
