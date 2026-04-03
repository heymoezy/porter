import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Check, X, Clock, ArrowRight, Plus, Minus, Pencil, BookOpen } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────

interface Proposal {
  id: string
  persona_id: string
  skill_id: string
  persona_name: string
  skill_name: string
  skill_description: string
  change_type: string
  proposed_change: Record<string, unknown>
  reasoning: string
  triggering_feedback_ids: string[]
  status: string
  created_at: number
  reviewed_at: number | null
  reviewed_by: string | null
}

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(epoch: number): string {
  const diff = Date.now() / 1000 - epoch
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const changeTypeLabel: Record<string, string> = {
  add_skill: "Add Skill",
  remove_skill: "Remove Skill",
  rewrite_prompt: "Rewrite Prompt",
  enrich_examples: "Enrich Examples",
  rejected: "Rejected",
}

const changeTypeColor: Record<string, string> = {
  add_skill: "bg-success/15 text-success",
  remove_skill: "bg-danger/15 text-danger",
  rewrite_prompt: "bg-warning/15 text-warning",
  enrich_examples: "bg-blue-500/15 text-blue-400",
  rejected: "bg-slate-500/15 text-slate-400",
}

const changeTypeIcon: Record<string, React.ElementType> = {
  add_skill: Plus,
  remove_skill: Minus,
  rewrite_prompt: Pencil,
  enrich_examples: BookOpen,
}

// ── Component ─────────────────────────────────────────────────

export function EvolutionPanel() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<"pending" | "history">("pending")

  const pendingQuery = useQuery({
    queryKey: ["admin", "skills", "proposals", "pending"],
    queryFn: () => api<{ proposals: Proposal[] }>("/api/admin/skills/proposals?status=pending"),
  })

  const historyQuery = useQuery({
    queryKey: ["admin", "skills", "evolution-events"],
    queryFn: () => api<{ proposals: Proposal[] }>("/api/admin/skills/proposals"),
  })

  const approveMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/skills/proposals/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "skills", "proposals"] })
      qc.invalidateQueries({ queryKey: ["admin", "skills"] })
    },
  })

  const rejectMut = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/skills/proposals/${id}/reject`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "skills", "proposals"] })
    },
  })

  const pendingProposals = pendingQuery.data?.proposals ?? []
  const allProposals = historyQuery.data?.proposals ?? []
  const historyProposals = allProposals
    .filter((p) => p.status !== "pending")
    .sort((a, b) => (b.reviewed_at ?? 0) - (a.reviewed_at ?? 0))

  const isMutating = approveMut.isPending || rejectMut.isPending

  return (
    <div className="space-y-3">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-border pb-2">
        <button
          onClick={() => setTab("pending")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            tab === "pending" ? "bg-surface text-text" : "text-text3 hover:text-text"
          }`}
        >
          Pending ({pendingProposals.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            tab === "history" ? "bg-surface text-text" : "text-text3 hover:text-text"
          }`}
        >
          History
        </button>
      </div>

      {/* Pending tab */}
      {tab === "pending" && (
        <>
          {pendingQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          ) : pendingProposals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Clock className="size-5 text-text3" />
              <p className="text-xs text-text3">
                No pending proposals. The analyzer runs every 6 hours.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingProposals.map((proposal) => {
                const Icon = changeTypeIcon[proposal.change_type] ?? Pencil
                return (
                  <div
                    key={proposal.id}
                    className="border border-border rounded-lg p-3 space-y-2"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={`text-2xs border-0 flex items-center gap-1 ${
                          changeTypeColor[proposal.change_type] ?? "bg-text3/15 text-text3"
                        }`}
                      >
                        <Icon className="size-2.5" />
                        {changeTypeLabel[proposal.change_type] ?? proposal.change_type}
                      </Badge>
                      <span className="text-xs font-bold text-text">{proposal.persona_name}</span>
                      <ArrowRight className="size-3 text-text3" />
                      <span className="text-xs font-medium text-text2">{proposal.skill_name}</span>
                      <span className="ml-auto text-2xs text-text3">{timeAgo(proposal.created_at)}</span>
                    </div>

                    {/* Reasoning */}
                    <p className="text-xs text-text3">{proposal.reasoning}</p>

                    {/* Proposed change diff */}
                    <pre className="bg-bg/50 rounded p-2 text-[10px] font-mono max-h-32 overflow-auto text-text2">
                      {JSON.stringify(proposal.proposed_change, null, 2)}
                    </pre>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={isMutating}
                        onClick={() => approveMut.mutate(proposal.id)}
                        className="text-success border-success/30 hover:bg-success/10"
                      >
                        <Check className="size-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={isMutating}
                        onClick={() => rejectMut.mutate(proposal.id)}
                        className="text-danger border-danger/30 hover:bg-danger/10"
                      >
                        <X className="size-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === "history" && (
        <>
          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          ) : historyProposals.length === 0 ? (
            <div className="py-10 text-center text-xs text-text3">
              No reviewed proposals yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {historyProposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className="flex items-center gap-2 border border-border/60 rounded-lg px-3 py-2 text-xs flex-wrap"
                >
                  <Badge
                    className={`text-2xs border-0 ${
                      proposal.status === "approved"
                        ? "bg-success/15 text-success"
                        : "bg-danger/15 text-danger"
                    }`}
                  >
                    {proposal.status}
                  </Badge>
                  <span className="font-medium text-text">{proposal.persona_name}</span>
                  <ArrowRight className="size-3 text-text3" />
                  <span className="text-text2">{proposal.skill_name}</span>
                  <span className="text-text3">
                    {changeTypeLabel[proposal.change_type] ?? proposal.change_type}
                  </span>
                  {proposal.reviewed_by && (
                    <span className="text-text3">by {proposal.reviewed_by}</span>
                  )}
                  <span className="ml-auto text-2xs text-text3">
                    {proposal.reviewed_at ? timeAgo(proposal.reviewed_at) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
