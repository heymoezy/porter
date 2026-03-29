import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Switch } from "~/components/ui/switch"
import { ToggleLeft, Trash2, XCircle } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface WorkspaceOverrideRow {
  id: string
  gateway_id: string
  gateway_type: string
  gateway_name: string
  enabled: number
  reason: string | null
  updated_by: string | null
  updated_at: number | null
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
      <div className="size-2.5 rounded-full bg-muted shrink-0" />
      <div className="h-3.5 w-28 rounded bg-muted" />
      <div className="h-5 w-16 rounded-full bg-muted ml-2" />
      <div className="ml-auto flex gap-2">
        <div className="h-5 w-9 rounded-full bg-muted" />
        <div className="h-7 w-7 rounded bg-muted" />
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────

export function WorkspaceGatewayOverrides() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["bridge", "workspace-overrides"],
    queryFn: () =>
      api<{ overrides: WorkspaceOverrideRow[] }>("/api/admin/bridge/workspace-config", {
        method: "POST",
        json: { action: "list" },
      }),
    
  })

  const setOverride = useMutation({
    mutationFn: ({ gateway_id, enabled }: { gateway_id: string; enabled: boolean }) =>
      api("/api/admin/bridge/workspace-config", {
        method: "POST",
        json: { action: "set", gateway_id, enabled },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "workspace-overrides"] })
    },
  })

  const removeOverride = useMutation({
    mutationFn: (gateway_id: string) =>
      api("/api/admin/bridge/workspace-config", {
        method: "POST",
        json: { action: "remove", gateway_id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "workspace-overrides"] })
    },
  })

  // ── UI state ──

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)

  // ── Render ──

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Overrides</span>
      </div>

      {/* Loading state */}
      {query.isLoading && (
        <div className="rounded-lg border border-border overflow-hidden">
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
              <p className="text-sm font-semibold text-foreground">Failed to load workspace overrides</p>
              <p className="text-xs text-text3 mt-0.5">
                {query.error instanceof Error ? query.error.message : "An unexpected error occurred"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!query.isLoading && !query.isError && (query.data?.overrides ?? []).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
              <ToggleLeft className="size-5 text-text3" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No gateway overrides set.</p>
              <p className="text-xs text-text3 mt-1 max-w-xs">
                All gateways follow default availability.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Override list */}
      {!query.isLoading && !query.isError && (query.data?.overrides ?? []).length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {(query.data?.overrides ?? []).map((row, i) => {
            const isLast = i === (query.data?.overrides ?? []).length - 1

            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-3 py-2.5 bg-background ${!isLast ? "border-b border-border/40" : ""}`}
              >
                {/* Status dot */}
                <div
                  className={`size-2.5 rounded-full shrink-0 ${row.enabled === 1 ? "bg-success" : "bg-text3"}`}
                />

                {/* Gateway name */}
                <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">
                  {row.gateway_name}
                </span>

                {/* Gateway type badge */}
                <Badge className="text-2xs bg-muted text-text2 border-0 shrink-0">
                  {row.gateway_type}
                </Badge>

                {/* Updated by */}
                {row.updated_by && (
                  <span className="text-2xs text-text3 shrink-0">by {row.updated_by}</span>
                )}

                {/* Updated at */}
                <span className="text-2xs text-text3 shrink-0">{fmtTime(row.updated_at)}</span>

                {/* Enabled switch */}
                <Switch
                  size="sm"
                  checked={row.enabled === 1}
                  onCheckedChange={(v) =>
                    setOverride.mutate({ gateway_id: row.gateway_id, enabled: v })
                  }
                />

                {/* Remove override action */}
                <div className="flex items-center gap-1 shrink-0">
                  {removeConfirm === row.gateway_id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-2xs text-text3">Reset to default?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-2xs px-2"
                        onClick={() => {
                          removeOverride.mutate(row.gateway_id)
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
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setRemoveConfirm(row.gateway_id)}
                      title="Remove override"
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
