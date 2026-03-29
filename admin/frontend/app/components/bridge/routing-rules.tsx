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
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  XCircle,
  AlertTriangle,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface RuleRow {
  id: string
  scope: "global" | "agent" | "project" | "gateway"
  scope_id: string | null
  action: string
  action_value: string | null
  enabled: number
  priority: number
  description: string | null
  created_by: string | null
  created_at: number
  updated_at: number
}

interface RuleFormState {
  scope: string
  scope_id: string
  action_type: string
  action_value: string
  priority: number
  description: string
  enabled: boolean
}

const defaultForm: RuleFormState = {
  scope: "global",
  scope_id: "",
  action_type: "force_model",
  action_value: "",
  priority: 50,
  description: "",
  enabled: true,
}

// ── Helpers ─────────────────────────────────────────────

function scopeBadgeClass(scope: string): string {
  if (scope === "global") return "bg-accent-porter/15 text-accent-porter border-0"
  if (scope === "agent") return "bg-success/15 text-success border-0"
  if (scope === "project") return "bg-warning/15 text-warning border-0"
  return "bg-text3/15 text-text3 border-0"
}

function actionLabel(action: string): string {
  if (action === "force_model") return "Force Model"
  if (action === "block_gateway") return "Block Gateway"
  if (action === "cap_cost_usd") return "Cap Cost (USD)"
  if (action === "prefer_local") return "Prefer Local"
  return action
}

function actionValuePlaceholder(actionType: string): string {
  if (actionType === "force_model") return "model name"
  if (actionType === "block_gateway") return "gateway type"
  if (actionType === "cap_cost_usd") return "max USD"
  return ""
}

// ── Skeleton ────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40 animate-pulse">
      <div className="h-5 w-14 rounded-full bg-muted" />
      <div className="h-5 w-20 rounded-full bg-muted" />
      <div className="h-3 w-24 rounded bg-muted ml-2" />
      <div className="ml-auto flex gap-2">
        <div className="h-7 w-7 rounded bg-muted" />
        <div className="h-7 w-7 rounded bg-muted" />
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────

export function RoutingRules() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["bridge", "routing-rules"],
    queryFn: () =>
      api<{ rules: RuleRow[] }>("/api/admin/bridge/routing-rules", {
        method: "POST",
        json: { action: "list" },
      }),
    
  })

  const createRule = useMutation({
    mutationFn: (form: RuleFormState) =>
      api("/api/admin/bridge/routing-rules", {
        method: "POST",
        json: {
          action: "create",
          scope: form.scope,
          scope_id: form.scope_id || undefined,
          action_type: form.action_type,
          action_value: form.action_value || undefined,
          enabled: form.enabled ? 1 : 0,
          priority: form.priority,
          description: form.description || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "routing-rules"] })
    },
  })

  const updateRule = useMutation({
    mutationFn: ({ id, form }: { id: string; form: RuleFormState }) =>
      api("/api/admin/bridge/routing-rules", {
        method: "POST",
        json: {
          action: "update",
          id,
          scope: form.scope,
          scope_id: form.scope_id || undefined,
          action_type: form.action_type,
          action_value: form.action_value || undefined,
          enabled: form.enabled ? 1 : 0,
          priority: form.priority,
          description: form.description || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "routing-rules"] })
    },
  })

  const deleteRule = useMutation({
    mutationFn: (id: string) =>
      api("/api/admin/bridge/routing-rules", {
        method: "POST",
        json: { action: "delete", id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bridge", "routing-rules"] })
    },
  })

  // ── UI state ──

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null)
  const [editTarget, setEditTarget] = useState<RuleRow | null>(null)
  const [form, setForm] = useState<RuleFormState>(defaultForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function openCreate() {
    setForm(defaultForm)
    setFormError(null)
    setDialogMode("create")
  }

  function openEdit(rule: RuleRow) {
    setEditTarget(rule)
    setForm({
      scope: rule.scope,
      scope_id: rule.scope_id ?? "",
      action_type: rule.action,
      action_value: rule.action_value ?? "",
      priority: rule.priority,
      description: rule.description ?? "",
      enabled: rule.enabled === 1,
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
    if (!form.scope) {
      setFormError("Scope is required.")
      return
    }
    if (!form.action_type) {
      setFormError("Action type is required.")
      return
    }
    setFormError(null)
    if (dialogMode === "create") {
      await createRule.mutateAsync(form)
    } else if (dialogMode === "edit" && editTarget) {
      await updateRule.mutateAsync({ id: editTarget.id, form })
    }
    closeDialog()
  }

  function handleToggleEnabled(rule: RuleRow, enabled: boolean) {
    updateRule.mutate({
      id: rule.id,
      form: {
        scope: rule.scope,
        scope_id: rule.scope_id ?? "",
        action_type: rule.action,
        action_value: rule.action_value ?? "",
        priority: rule.priority,
        description: rule.description ?? "",
        enabled,
      },
    })
  }

  const isSaving = createRule.isPending || updateRule.isPending
  const rules = query.data?.rules ?? []

  // ── Render ──

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Rules</span>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5 mr-1" /> Add Rule
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
              <p className="text-sm font-semibold text-foreground">Failed to load routing rules</p>
              <p className="text-xs text-text3 mt-0.5">
                {query.error instanceof Error ? query.error.message : "An unexpected error occurred"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!query.isLoading && !query.isError && rules.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
              <GitBranch className="size-5 text-text3" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No routing rules</p>
              <p className="text-xs text-text3 mt-1 max-w-xs">
                Porter uses defaults. Add rules to customize dispatch.
              </p>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-3.5 mr-1" /> Add Rule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rule list */}
      {!query.isLoading && !query.isError && rules.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {rules.map((rule, i) => {
            const isLast = i === rules.length - 1
            return (
              <div
                key={rule.id}
                className={`flex items-center gap-2 px-3 py-2.5 bg-background ${!isLast ? "border-b border-border/40" : ""}`}
              >
                {/* Scope badge */}
                <Badge className={`text-2xs shrink-0 ${scopeBadgeClass(rule.scope)}`}>
                  {rule.scope}
                </Badge>

                {/* Action badge */}
                <Badge className="text-2xs bg-muted text-text2 border-0 shrink-0">
                  {actionLabel(rule.action)}
                </Badge>

                {/* scope_id */}
                {rule.scope_id && (
                  <span className="text-2xs text-text3 truncate max-w-[80px]" title={rule.scope_id}>
                    {rule.scope_id}
                  </span>
                )}

                {/* action_value */}
                {rule.action_value && (
                  <span className="text-2xs text-text2 truncate max-w-[80px]" title={rule.action_value}>
                    → {rule.action_value}
                  </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Priority */}
                <span className="text-2xs text-text3 shrink-0">p{rule.priority}</span>

                {/* Enabled toggle */}
                <Switch
                  size="sm"
                  checked={rule.enabled === 1}
                  onCheckedChange={(v) => handleToggleEnabled(rule, v)}
                />

                {/* Actions — confirm or buttons */}
                {deleteConfirm === rule.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-2xs text-text3">Delete?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 text-2xs px-2"
                      onClick={() => {
                        deleteRule.mutate(rule.id)
                        setDeleteConfirm(null)
                      }}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-2xs px-2"
                      onClick={() => setDeleteConfirm(null)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openEdit(rule)}
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirm(rule.id)}
                      title="Delete"
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add Rule" : "Edit Rule"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            {/* Scope */}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-scope">Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}
              >
                <SelectTrigger id="rule-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">global</SelectItem>
                  <SelectItem value="agent">agent</SelectItem>
                  <SelectItem value="project">project</SelectItem>
                  <SelectItem value="gateway">gateway</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scope ID */}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-scope-id">Scope ID <span className="text-text3">(optional)</span></Label>
              <Input
                id="rule-scope-id"
                value={form.scope_id}
                onChange={(e) => setForm((f) => ({ ...f, scope_id: e.target.value }))}
                placeholder="Agent ID, Project ID, or Gateway ID"
              />
            </div>

            {/* Action type */}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-action">Action Type</Label>
              <Select
                value={form.action_type}
                onValueChange={(v) => setForm((f) => ({ ...f, action_type: v }))}
              >
                <SelectTrigger id="rule-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="force_model">Force Model</SelectItem>
                  <SelectItem value="block_gateway">Block Gateway</SelectItem>
                  <SelectItem value="cap_cost_usd">Cap Cost (USD)</SelectItem>
                  <SelectItem value="prefer_local">Prefer Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action value */}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-action-value">Action Value <span className="text-text3">(optional)</span></Label>
              <Input
                id="rule-action-value"
                value={form.action_value}
                onChange={(e) => setForm((f) => ({ ...f, action_value: e.target.value }))}
                placeholder={actionValuePlaceholder(form.action_type)}
              />
            </div>

            {/* Priority */}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                min={0}
                max={100}
              />
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-description">Description <span className="text-text3">(optional)</span></Label>
              <Input
                id="rule-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-enabled">Enabled</Label>
              <Switch
                id="rule-enabled"
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
