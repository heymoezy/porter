import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog"
import { KeyRound, Trash2, RefreshCw, Loader2, XCircle } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface UserApiKeyRow {
  id: string
  username: string
  gateway_type: string
  label: string
  masked_display: string
  created_at: number | null
  rotated_at: number | null
}

// ── Helpers ─────────────────────────────────────────────

function fmtTime(epoch: number | null): string {
  if (epoch === null) return "—"
  const d = Date.now() / 1000 - epoch
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ── Skeleton ────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40 animate-pulse">
      <div className="h-3.5 w-20 rounded bg-muted shrink-0" />
      <div className="h-5 w-16 rounded-full bg-muted" />
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-3 w-16 rounded bg-muted font-mono" />
      <div className="ml-auto flex gap-2">
        <div className="h-7 w-7 rounded bg-muted" />
        <div className="h-7 w-7 rounded bg-muted" />
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────

export function UserKeyManager() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["bridge", "user-keys"],
    queryFn: () => api<{ keys: UserApiKeyRow[] }>("/api/admin/bridge/user-keys"),
    
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api("/api/admin/bridge/user-keys", {
        method: "POST",
        json: { action: "delete", id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "user-keys"] })
    },
  })

  const rotateMutation = useMutation({
    mutationFn: ({ id, api_key }: { id: string; api_key: string }) =>
      api("/api/admin/bridge/user-keys", {
        method: "POST",
        json: { action: "rotate", id, api_key },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "user-keys"] })
      setRotateTarget(null)
      setRotateKey("")
    },
  })

  // ── UI state ──

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [rotateTarget, setRotateTarget] = useState<UserApiKeyRow | null>(null)
  const [rotateKey, setRotateKey] = useState("")

  // ── Render ──

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">API Keys</span>
      </div>

      {/* Loading state */}
      {query.isLoading && (
        <div className="rounded-lg border border-border overflow-hidden">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      )}

      {/* Error state */}
      {query.isError && (
        <Card>
          <CardContent className="flex items-center gap-3 py-5">
            <XCircle className="size-5 text-danger shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Failed to load user API keys</p>
              <p className="text-xs text-text3 mt-0.5">
                {query.error instanceof Error ? query.error.message : "An unexpected error occurred"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!query.isLoading && !query.isError && (query.data?.keys ?? []).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
              <KeyRound className="size-5 text-text3" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No user API keys stored yet.</p>
              <p className="text-xs text-text3 mt-1 max-w-xs">
                Users create their own API keys. They will appear here once set.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key list */}
      {!query.isLoading && !query.isError && (query.data?.keys ?? []).length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {(query.data?.keys ?? []).map((row, i) => {
            const isLast = i === (query.data?.keys ?? []).length - 1

            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-3 py-2.5 bg-background ${!isLast ? "border-b border-border/40" : ""}`}
              >
                {/* Username */}
                <span className="text-xs font-medium text-foreground shrink-0 w-24 truncate">
                  {row.username}
                </span>

                {/* Gateway type badge */}
                <Badge className="text-2xs bg-muted text-text2 border-0 shrink-0">
                  {row.gateway_type}
                </Badge>

                {/* Label (only show if not "primary") */}
                {row.label !== "primary" && (
                  <span className="text-2xs text-text3 shrink-0">{row.label}</span>
                )}

                {/* Masked display */}
                <span className="text-2xs font-mono text-text2 shrink-0">{row.masked_display}</span>

                {/* Created */}
                <span className="text-2xs text-text3 shrink-0">{fmtTime(row.created_at)}</span>

                {/* Rotated */}
                <span className="text-2xs text-text3 shrink-0">
                  {row.rotated_at ? `rotated ${fmtTime(row.rotated_at)}` : "—"}
                </span>

                {/* Actions — spacer then buttons */}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {removeConfirm === row.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs text-text3">Remove?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-2xs px-2"
                        onClick={() => {
                          deleteMutation.mutate(row.id)
                          setRemoveConfirm(null)
                        }}
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-2xs px-2"
                        onClick={() => setRemoveConfirm(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Rotate */}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setRotateTarget(row)
                          setRotateKey("")
                        }}
                        title="Rotate key"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      {/* Delete */}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setRemoveConfirm(row.id)}
                        title="Delete"
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rotate Dialog */}
      <Dialog
        open={rotateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRotateTarget(null)
            setRotateKey("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate API Key</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <p className="text-xs text-text3">
              Rotating key for{" "}
              <span className="font-medium text-foreground">{rotateTarget?.username}</span>{" "}
              ({rotateTarget?.gateway_type} / {rotateTarget?.label})
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="rotate-key">
                New API Key <span className="text-danger">*</span>
              </Label>
              <Input
                id="rotate-key"
                type="password"
                value={rotateKey}
                onChange={(e) => setRotateKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRotateTarget(null)
                setRotateKey("")
              }}
              disabled={rotateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!rotateTarget || !rotateKey.trim()) return
                rotateMutation.mutate({ id: rotateTarget.id, api_key: rotateKey.trim() })
              }}
              disabled={rotateMutation.isPending || !rotateKey.trim()}
            >
              {rotateMutation.isPending && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Rotate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
