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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface GatewayRow {
  id: string
  type: string
  name: string
  url: string | null
  auth_method: string
  status: string
  source: string
  priority: number
  enabled: number
  circuit_state: string
  last_health_at: number | null
  model_count: number
  created_at: number
  updated_at: number
}

interface GatewayFormState {
  type: string
  name: string
  url: string
  auth_method: string
  priority: number
  enabled: boolean
}

const defaultForm: GatewayFormState = {
  type: "ollama",
  name: "",
  url: "",
  auth_method: "none",
  priority: 50,
  enabled: true,
}

// ── Helpers ─────────────────────────────────────────────

function statusDotClass(status: string): string {
  if (status === "active") return "bg-success"
  if (status === "degraded") return "bg-warning animate-pulse"
  if (status === "unavailable") return "bg-danger animate-pulse"
  return "bg-text3"
}

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
        <div className="h-7 w-7 rounded bg-muted" />
        <div className="h-7 w-7 rounded bg-muted" />
        <div className="h-7 w-7 rounded bg-muted" />
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────

export function GatewayConfig() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["bridge", "gateway-config"],
    queryFn: () =>
      api<{ gateways: GatewayRow[] }>("/api/admin/bridge/gateways", {
        method: "POST",
        json: { action: "list" },
      }),
    
  })

  const addGateway = useMutation({
    mutationFn: (form: GatewayFormState) =>
      api("/api/admin/bridge/gateways", {
        method: "POST",
        json: { action: "add", ...form, enabled: form.enabled ? 1 : 0 },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "gateway-config"] })
    },
  })

  const updateGateway = useMutation({
    mutationFn: ({ id, form }: { id: string; form: GatewayFormState }) =>
      api("/api/admin/bridge/gateways", {
        method: "POST",
        json: {
          action: "update",
          id,
          name: form.name,
          url: form.url,
          auth_method: form.auth_method,
          priority: form.priority,
          enabled: form.enabled ? 1 : 0,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "gateway-config"] })
    },
  })

  const removeGateway = useMutation({
    mutationFn: (id: string) =>
      api("/api/admin/bridge/gateways", {
        method: "POST",
        json: { action: "remove", id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "gateway-config"] })
    },
  })

  const validateGateway = useMutation({
    mutationFn: (id: string) =>
      api<{ valid: boolean; status: string; last_health_at: number | null; name: string }>(
        "/api/admin/bridge/gateways",
        { method: "POST", json: { action: "validate", id } }
      ),
    onSuccess: (data, id) => {
      setValidateResults((prev) => ({
        ...prev,
        [id]: { valid: data.valid, status: data.status },
      }))
    },
  })

  // ── UI state ──

  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null)
  const [editTarget, setEditTarget] = useState<GatewayRow | null>(null)
  const [form, setForm] = useState<GatewayFormState>(defaultForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [validateResults, setValidateResults] = useState<
    Record<string, { valid: boolean; status: string }>
  >({})

  function openAdd() {
    setForm(defaultForm)
    setFormError(null)
    setDialogMode("add")
  }

  function openEdit(gw: GatewayRow) {
    setEditTarget(gw)
    setForm({
      type: gw.type,
      name: gw.name,
      url: gw.url ?? "",
      auth_method: gw.auth_method,
      priority: gw.priority,
      enabled: gw.enabled === 1,
    })
    setFormError(null)
    setDialogMode("edit")
  }

  function closeDialog() {
    setDialogMode(null)
    setEditTarget(null)
    setFormError(null)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Name is required.")
      return
    }
    setFormError(null)
    if (dialogMode === "add") {
      await addGateway.mutateAsync(form)
    } else if (dialogMode === "edit" && editTarget) {
      await updateGateway.mutateAsync({ id: editTarget.id, form })
    }
    closeDialog()
  }

  function handleToggleEnabled(gw: GatewayRow, enabled: boolean) {
    updateGateway.mutate({
      id: gw.id,
      form: {
        type: gw.type,
        name: gw.name,
        url: gw.url ?? "",
        auth_method: gw.auth_method,
        priority: gw.priority,
        enabled,
      },
    })
  }

  const isSaving = addGateway.isPending || updateGateway.isPending

  // ── Render ──

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Gateways</span>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-3.5 mr-1" /> Add Gateway
        </Button>
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
              <p className="text-sm font-semibold text-foreground">Failed to load gateways</p>
              <p className="text-xs text-text3 mt-0.5">
                {query.error instanceof Error ? query.error.message : "An unexpected error occurred"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!query.isLoading && !query.isError && (query.data?.gateways ?? []).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
              <Server className="size-5 text-text3" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No gateways configured</p>
              <p className="text-xs text-text3 mt-1 max-w-xs">
                Add your first gateway to get started.
              </p>
            </div>
            <Button size="sm" onClick={openAdd}>
              <Plus className="size-3.5 mr-1" /> Add Gateway
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Gateway list */}
      {!query.isLoading && !query.isError && (query.data?.gateways ?? []).length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {(query.data?.gateways ?? []).map((gw, i) => {
            const isLast = i === (query.data?.gateways ?? []).length - 1
            const vr = validateResults[gw.id]

            return (
              <div
                key={gw.id}
                className={`flex items-center gap-2 px-3 py-2.5 bg-background ${!isLast ? "border-b border-border/40" : ""}`}
              >
                {/* Status dot */}
                <div className={`size-2.5 rounded-full shrink-0 ${statusDotClass(gw.status)}`} />

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate block">{gw.name}</span>
                  <span className="text-2xs text-text3">{fmtTime(gw.last_health_at)}</span>
                </div>

                {/* Type badge */}
                <Badge className="text-2xs bg-muted text-text2 border-0 shrink-0">{gw.type}</Badge>

                {/* Priority */}
                <span className="text-2xs text-text3 shrink-0 w-8 text-right">p{gw.priority}</span>

                {/* Model count */}
                <span className="text-2xs text-text3 shrink-0 w-10 text-right">{gw.model_count}m</span>

                {/* Validate result */}
                {vr && (
                  <Badge
                    className={`text-2xs border-0 shrink-0 ${
                      vr.valid ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                    }`}
                  >
                    {vr.valid ? <CheckCircle2 className="size-3 mr-0.5" /> : <XCircle className="size-3 mr-0.5" />}
                    {vr.status}
                  </Badge>
                )}

                {/* Enabled toggle */}
                <Switch
                  size="sm"
                  checked={gw.enabled === 1}
                  onCheckedChange={(v) => handleToggleEnabled(gw, v)}
                />

                {/* Actions — confirm or buttons */}
                {removeConfirm === gw.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-2xs text-text3">Remove?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 text-2xs px-2"
                      onClick={() => {
                        removeGateway.mutate(gw.id)
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
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Edit */}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openEdit(gw)}
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    {/* Validate */}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => validateGateway.mutate(gw.id)}
                      title="Validate connection"
                      disabled={validateGateway.isPending}
                    >
                      {validateGateway.isPending && validateGateway.variables === gw.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                    </Button>
                    {/* Remove */}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setRemoveConfirm(gw.id)}
                      title="Remove"
                    >
                      <Trash2 className="size-3.5 text-danger" />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "add" ? "Add Gateway" : "Edit Gateway"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            {/* Type — only editable on add */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                disabled={dialogMode === "edit"}
              >
                <SelectTrigger id="gw-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">ollama</SelectItem>
                  <SelectItem value="openclaw">openclaw</SelectItem>
                  <SelectItem value="codex_cli">codex_cli</SelectItem>
                  <SelectItem value="claude_cli">claude_cli</SelectItem>
                  <SelectItem value="gemini_cli">gemini_cli</SelectItem>
                  <SelectItem value="openai_compat">openai_compat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-name">Name <span className="text-danger">*</span></Label>
              <Input
                id="gw-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Gateway"
              />
            </div>

            {/* URL */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-url">URL</Label>
              <Input
                id="gw-url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="http://localhost:11434"
              />
            </div>

            {/* Auth method */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-auth">Auth Method</Label>
              <Select
                value={form.auth_method}
                onValueChange={(v) => setForm((f) => ({ ...f, auth_method: v }))}
              >
                <SelectTrigger id="gw-auth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="bearer">bearer</SelectItem>
                  <SelectItem value="basic">basic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="grid gap-1.5">
              <Label htmlFor="gw-priority">Priority</Label>
              <Input
                id="gw-priority"
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                min={0}
                max={100}
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <Label htmlFor="gw-enabled">Enabled</Label>
              <Switch
                id="gw-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>

          {/* Inline error */}
          {formError && (
            <p className="flex items-center gap-1.5 text-xs text-danger">
              <AlertTriangle className="size-3.5 shrink-0" />
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
