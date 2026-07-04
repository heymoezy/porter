import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Badge } from "~/components/ui/badge"
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
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
import { Loader2, AlertTriangle, Trash2, Package, X } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface SkillAgent { id: string; name: string; role: string; enabled: boolean }

interface Skill {
  id: string; name: string; description: string; category: string; source: string
  enabled: boolean; visible: boolean; featured: boolean
  icon: string; color: string; short_label: string
  sort_order: number; featured_order: number
  packStatus: "ready" | "partial" | "missing"
  tags: string[]
  agents: SkillAgent[]
}

interface SkillEditSheetProps {
  skill: Skill | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: string[]
}

interface EditForm {
  name: string
  description: string
  category: string
  source: string
  enabled: boolean
  visible: boolean
  featured: boolean
  sort_order: number
  featured_order: number
  icon: string
  color: string
  short_label: string
  tags: string[]
}

const SOURCES = ["porter-core", "porter-curated", "porter-internal", "runtime"]

const packStatusStyles: Record<string, string> = {
  ready: "bg-success/15 text-success",
  partial: "bg-warning/15 text-warning",
  missing: "bg-text3/15 text-text3",
}

// ── Component ──────────────────────────────────────────

export function SkillEditSheet({ skill, open, onOpenChange, categories }: SkillEditSheetProps) {
  const qc = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const [form, setForm] = useState<EditForm>({
    name: "", description: "", category: "", source: "porter-curated",
    enabled: true, visible: true, featured: false,
    sort_order: 50, featured_order: 0,
    icon: "", color: "", short_label: "", tags: [],
  })
  const [tagInput, setTagInput] = useState("")

  // Populate form when skill changes
  useEffect(() => {
    if (skill && open) {
      setForm({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        source: skill.source,
        enabled: skill.enabled,
        visible: skill.visible,
        featured: skill.featured,
        sort_order: skill.sort_order,
        featured_order: skill.featured_order,
        icon: skill.icon || "",
        color: skill.color || "",
        short_label: skill.short_label || "",
        tags: skill.tags || [],
      })
      setTagInput("")
      setFormError(null)
      setDeleteConfirm(false)
    }
  }, [skill, open])

  const updateSkill = useMutation({
    mutationFn: (data: EditForm) =>
      api(`/api/admin/skills/${skill!.id}`, { method: "PUT", json: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "skills"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      setFormError(error.message)
    },
  })

  const deleteSkill = useMutation({
    mutationFn: () =>
      api(`/api/admin/skills/${skill!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "skills"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      setFormError(error.message)
    },
  })

  const generatePack = useMutation({
    mutationFn: () =>
      api("/api/admin/skills/builder/generate", {
        method: "POST",
        json: {
          id: skill!.id,
          name: skill!.name,
          description: skill!.description,
          category: skill!.category,
          source: skill!.source,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "skills"] })
    },
  })

  function handleSave() {
    if (!form.name.trim()) {
      setFormError("Name is required")
      return
    }
    setFormError(null)
    updateSkill.mutate(form)
  }

  if (!skill) return null

  const isSaving = updateSkill.isPending || deleteSkill.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="flex-1">{skill.name}</DialogTitle>
            <Badge className={`text-2xs border-0 ${packStatusStyles[skill.packStatus] || "bg-text3/15 text-text3"}`}>
              {skill.packStatus}
            </Badge>
          </div>
          <p className="text-2xs text-text3 font-mono">{skill.id}</p>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Name <span className="text-danger">*</span></Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="min-h-16 text-sm"
            />
          </div>

          {/* Category + Source row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-cat">Category</Label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger id="edit-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-source">Source</Label>
              <Select
                value={form.source}
                onValueChange={v => setForm(f => ({ ...f, source: v }))}
              >
                <SelectTrigger id="edit-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map(src => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggle switches */}
          <div className="grid gap-2 rounded-lg border border-border/50 p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-enabled">Enabled</Label>
              <Switch
                id="edit-enabled"
                checked={form.enabled}
                onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-visible">Visible</Label>
              <Switch
                id="edit-visible"
                checked={form.visible}
                onCheckedChange={v => setForm(f => ({ ...f, visible: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-featured">Featured</Label>
              <Switch
                id="edit-featured"
                checked={form.featured}
                onCheckedChange={v => setForm(f => ({ ...f, featured: v }))}
              />
            </div>
          </div>

          {/* Ordering */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-sort">Sort Order</Label>
              <Input
                id="edit-sort"
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-feat-order">Featured Order</Label>
              <Input
                id="edit-feat-order"
                type="number"
                value={form.featured_order}
                onChange={e => setForm(f => ({ ...f, featured_order: Number(e.target.value) }))}
              />
            </div>
          </div>

          {/* Visual customization */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-icon">Icon</Label>
              <Input
                id="edit-icon"
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="sparkles"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-color">Color</Label>
              <Input
                id="edit-color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                placeholder="#8B5CF6"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-label">Short Label</Label>
              <Input
                id="edit-label"
                value={form.short_label}
                onChange={e => setForm(f => ({ ...f, short_label: e.target.value }))}
                placeholder="review"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="grid gap-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1 min-h-[28px] rounded-lg border border-border/50 p-2">
              {form.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded-full bg-raised px-2 py-0.5 text-2xs text-text2"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))}
                    className="rounded-full p-0.5 text-text3 hover:text-text hover:bg-surface transition-colors"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault()
                    const tag = tagInput.trim().toLowerCase()
                    if (!form.tags.includes(tag)) {
                      setForm(f => ({ ...f, tags: [...f.tags, tag] }))
                    }
                    setTagInput("")
                  }
                  if (e.key === "Backspace" && !tagInput && form.tags.length > 0) {
                    setForm(f => ({ ...f, tags: f.tags.slice(0, -1) }))
                  }
                }}
                placeholder="Type + Enter"
                className="h-6 min-w-[80px] flex-1 border-0 bg-transparent px-1 text-2xs shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* Pack generation */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div>
              <p className="text-xs font-medium text-text">Skill Pack</p>
              <p className="text-2xs text-text3">
                {skill.packStatus === "ready"
                  ? "All pack files present"
                  : skill.packStatus === "partial"
                    ? "Some pack files missing"
                    : "No pack generated yet"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generatePack.mutate()}
              disabled={generatePack.isPending}
            >
              {generatePack.isPending ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Package className="size-3.5 mr-1" />
              )}
              Generate Pack
            </Button>
          </div>
        </div>

        {formError && (
          <p className="flex items-center gap-1.5 text-xs text-danger">
            <AlertTriangle className="size-3.5 shrink-0" />
            {formError}
          </p>
        )}

        <DialogFooter>
          {/* Delete with confirmation */}
          <div className="mr-auto">
            {deleteConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-2xs text-text3">Delete?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 text-2xs px-2"
                  onClick={() => deleteSkill.mutate()}
                  disabled={isSaving}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-2xs px-2"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={isSaving}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteConfirm(true)}
                disabled={isSaving}
              >
                <Trash2 className="size-3.5 mr-1 text-danger" />
                Delete
              </Button>
            )}
          </div>

          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {updateSkill.isPending && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
