import { useState, useMemo } from "react"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Badge } from "~/components/ui/badge"
import { api, ApiError } from "~/lib/api"
import { ProposalKindBadge } from "~/components/ProposalKindBadge"
import { DiffBlock } from "~/components/DiffBlock"

// ──────────────────────────────────────────────────────────────────────────
// Types — mirror raw pg snake_case shape from /api/admin/dreams/proposals.
// api() helper auto-unwraps the { data: T } envelope (api.ts:62-66).
// ──────────────────────────────────────────────────────────────────────────
export interface MemoryProposal {
  id: string
  dream_run_id: string
  silo_id: string
  proposal_kind: "merge" | "supersede" | "delete" | "new_directive"
  target_directive_ids: string[]
  proposed_content: string
  proposed_metadata: Record<string, unknown>
  source_evidence: Record<string, unknown>
  sort_order: number
  status: "pending" | "accepted" | "rejected" | "expired"
  created_at: number
  expires_at: number | null
  reviewed_at: number | null
  reviewed_by: string | null
}

interface DirectiveRow {
  id: string
  content: string
  priority?: number
  source_type?: string
  status?: string
}

interface ProposalDetailDrawerProps {
  proposalId: string | null
  proposals: MemoryProposal[]
  onClose: () => void
}

interface AcceptResponse {
  proposal_id: string
  status: string
  directive_ids_touched: string[]
  intellect_event_id: string
}

interface RejectResponse {
  proposal_id: string
  status: string
  intellect_event_id: string
}

// ──────────────────────────────────────────────────────────────────────────
// Failure-code → toast mapping. SEALED_SEED / SILO_MISMATCH / TARGET_GONE /
// INVALID_STATE / NOT_FOUND / ACCEPT_FAILED. Toast text is grepped by
// Playwright RVS-12 ("sealed|seed|protected") — keep keywords stable.
// ──────────────────────────────────────────────────────────────────────────
function toastAcceptError(code: string, message: string) {
  switch (code) {
    case "NOT_FOUND":
      toast.error("Proposal not found")
      break
    case "INVALID_STATE":
      toast.error("Proposal status changed — list refreshed")
      break
    case "TARGET_GONE":
      toast.error("Target directive no longer exists — proposal removed")
      break
    case "SEALED_SEED":
      toast.error("Seed directives are protected — cannot accept this proposal")
      break
    case "SILO_MISMATCH":
      toast.error("Proposal targets wrong silo — review needed")
      break
    case "ACCEPT_FAILED":
      toast.error(`Accept failed: ${message}`)
      break
    default:
      toast.error(`Accept failed: ${message || code}`)
  }
}

function toastRejectError(code: string, message: string) {
  switch (code) {
    case "NOT_FOUND":
      toast.error("Proposal not found")
      break
    case "INVALID_STATE":
      toast.error("Proposal status changed — list refreshed")
      break
    default:
      toast.error(`Reject failed: ${message || code}`)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────
export function ProposalDetailDrawer({
  proposalId,
  proposals,
  onClose,
}: ProposalDetailDrawerProps) {
  const qc = useQueryClient()
  const [rejectReason, setRejectReason] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const proposal = useMemo(
    () => proposals.find((p) => p.id === proposalId) ?? null,
    [proposalId, proposals],
  )

  // Optional target fetch — graceful degradation if endpoint missing.
  // GET /api/admin/intelligence/directives/:id may not exist; useQuery
  // returns null on any error so the diff block simply doesn't render.
  const firstTargetId = proposal?.target_directive_ids?.[0]
  const targetQ = useQuery<DirectiveRow | null>({
    queryKey: ["admin", "intelligence", "directives", firstTargetId],
    queryFn: async () => {
      if (!firstTargetId) return null
      try {
        return await api<DirectiveRow>(
          `/api/admin/intelligence/directives/${firstTargetId}`,
        )
      } catch {
        return null // endpoint may not exist; degrade silently
      }
    },
    enabled: !!firstTargetId,
    retry: false,
  })

  // Accept mutation — POST with no body. api() helper rejects `body:` at the
  // type level (ApiOptions extends Omit<RequestInit, "body">), so we must use
  // either no body or { json: {...} }. POST /accept takes no body.
  const accept = useMutation({
    mutationFn: async (id: string) =>
      api<AcceptResponse>(
        `/api/admin/dreams/proposals/${id}/accept`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Proposal accepted — directive landed")
      qc.invalidateQueries({ queryKey: ["admin", "dreams"] })
      onClose()
    },
    onError: (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "UNKNOWN"
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown error")
      toastAcceptError(code, message)
      // Refresh list so stale rows clear (NOT_FOUND / INVALID_STATE / TARGET_GONE)
      qc.invalidateQueries({ queryKey: ["admin", "dreams", "proposals"] })
    },
  })

  // Reject mutation — POST with JSON body via api()'s `json:` option.
  // The helper sets Content-Type and stringifies; never pass `body:` manually.
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      api<RejectResponse>(
        `/api/admin/dreams/proposals/${id}/reject`,
        { method: "POST", json: { reason: reason || null } },
      ),
    onSuccess: () => {
      toast.success("Proposal rejected")
      qc.invalidateQueries({ queryKey: ["admin", "dreams"] })
      setRejectReason("")
      onClose()
    },
    onError: (err: unknown) => {
      const code = err instanceof ApiError ? err.code : "UNKNOWN"
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown error")
      toastRejectError(code, message)
      qc.invalidateQueries({ queryKey: ["admin", "dreams", "proposals"] })
    },
  })

  const handleAccept = () => {
    if (!proposal) return
    if (proposal.proposal_kind === "delete") {
      setConfirmDelete(true)
    } else {
      accept.mutate(proposal.id)
    }
  }

  const isOpen = !!proposalId && !!proposal

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <SheetContent
          side="right"
          className="w-[640px] sm:max-w-[640px] overflow-y-auto"
        >
          {proposal && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <ProposalKindBadge kind={proposal.proposal_kind} />
                  <span className="font-mono text-sm">{proposal.id}</span>
                </SheetTitle>
                <SheetDescription>
                  <span className="text-2xs">
                    silo={proposal.silo_id} · status={proposal.status} ·
                    area=
                    {String(
                      (proposal.proposed_metadata as Record<string, unknown>)
                        ?.conceptual_area ?? "—",
                    )}
                  </span>
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 mt-2 px-4 pb-4">
                {/* Proposed content */}
                <section>
                  <h3 className="text-2xs uppercase tracking-wide text-text3 mb-2">
                    Proposed content
                  </h3>
                  <div className="rounded border border-border p-3 text-sm whitespace-pre-wrap">
                    {proposal.proposed_content}
                  </div>
                </section>

                {/* Target preview / diff */}
                {proposal.target_directive_ids.length > 0 && (
                  <section>
                    <h3 className="text-2xs uppercase tracking-wide text-text3 mb-2">
                      Target
                      {proposal.target_directive_ids.length > 1 ? "s" : ""} (
                      {proposal.target_directive_ids.length})
                    </h3>
                    <ul className="space-y-1 mb-3">
                      {proposal.target_directive_ids.map((tid) => (
                        <li
                          key={tid}
                          className="font-mono text-2xs text-text3"
                        >
                          {tid}
                        </li>
                      ))}
                    </ul>
                    {/* Diff renders for supersede only when we have a live target. */}
                    {proposal.proposal_kind === "supersede" && targetQ.data && (
                      <DiffBlock
                        before={targetQ.data.content}
                        after={proposal.proposed_content}
                      />
                    )}
                  </section>
                )}

                {/* Metadata */}
                <section>
                  <h3 className="text-2xs uppercase tracking-wide text-text3 mb-2">
                    Metadata
                  </h3>
                  <pre className="rounded border border-border p-2 text-2xs overflow-auto bg-surface/30">
                    {JSON.stringify(proposal.proposed_metadata, null, 2)}
                  </pre>
                </section>

                {/* Source evidence */}
                <section>
                  <h3 className="text-2xs uppercase tracking-wide text-text3 mb-2">
                    Source evidence
                  </h3>
                  <pre className="rounded border border-border p-2 text-2xs overflow-auto bg-surface/30 max-h-[260px]">
                    {JSON.stringify(proposal.source_evidence, null, 2)}
                  </pre>
                </section>

                {/* Reject reason (optional, pending only) */}
                {proposal.status === "pending" && (
                  <section>
                    <h3 className="text-2xs uppercase tracking-wide text-text3 mb-2">
                      Reject reason (optional)
                    </h3>
                    <Input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Why is this proposal being rejected?"
                      maxLength={200}
                    />
                  </section>
                )}

                {/* Action buttons */}
                {proposal.status === "pending" ? (
                  <div className="flex gap-2 pt-3 border-t border-border">
                    <Button
                      variant="default"
                      onClick={handleAccept}
                      disabled={accept.isPending || reject.isPending}
                    >
                      {accept.isPending ? "Accepting…" : "Accept"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        reject.mutate({
                          id: proposal.id,
                          reason: rejectReason,
                        })
                      }
                      disabled={accept.isPending || reject.isPending}
                    >
                      {reject.isPending ? "Rejecting…" : "Reject"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-2xs text-text3 border-t border-border pt-3">
                    Already <Badge variant="outline">{proposal.status}</Badge>{" "}
                    {proposal.reviewed_by ? `by ${proposal.reviewed_by}` : ""}.
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete-kind confirmation modal — fires only when proposal_kind === 'delete'. */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this directive?</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>
              This will archive directive{" "}
              <code className="font-mono text-2xs">
                {proposal?.target_directive_ids[0]}
              </code>
              . It will no longer be injected into CLI sessions.
            </p>
            <p className="text-2xs text-text3">
              You can restore it later from the Intellect tab.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (proposal) accept.mutate(proposal.id)
                setConfirmDelete(false)
              }}
              disabled={accept.isPending}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
