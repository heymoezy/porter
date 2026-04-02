import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
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
import { Loader2, AlertTriangle } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface SkillCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: string[]
}

interface CreateForm {
  id: string
  name: string
  description: string
  category: string
  source: string
}

const SOURCES = ["porter-core", "porter-curated", "porter-internal", "runtime"]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// ── Component ──────────────────────────────────────────

export function SkillCreateDialog({ open, onOpenChange, categories }: SkillCreateDialogProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreateForm>({
    id: "",
    name: "",
    description: "",
    category: categories[0] || "Unknown",
    source: "porter-curated",
  })
  const [idEdited, setIdEdited] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        id: "",
        name: "",
        description: "",
        category: categories[0] || "Unknown",
        source: "porter-curated",
      })
      setIdEdited(false)
      setFormError(null)
    }
  }, [open, categories])

  // Auto-slugify id from name unless manually edited
  function handleNameChange(name: string) {
    setForm(f => ({
      ...f,
      name,
      id: idEdited ? f.id : slugify(name),
    }))
  }

  const createSkill = useMutation({
    mutationFn: (data: CreateForm) =>
      api("/api/admin/skills", { method: "POST", json: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "skills"] })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      setFormError(error.message)
    },
  })

  function handleSave() {
    if (!form.name.trim()) {
      setFormError("Name is required")
      return
    }
    if (!form.id.trim()) {
      setFormError("ID is required")
      return
    }
    setFormError(null)
    createSkill.mutate(form)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Skill</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="skill-name">Name <span className="text-danger">*</span></Label>
            <Input
              id="skill-name"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Code Review"
            />
          </div>

          {/* ID (auto-slugified, editable) */}
          <div className="grid gap-1.5">
            <Label htmlFor="skill-id">ID <span className="text-2xs text-text3 font-normal">(auto-generated)</span></Label>
            <Input
              id="skill-id"
              value={form.id}
              onChange={e => {
                setIdEdited(true)
                setForm(f => ({ ...f, id: e.target.value }))
              }}
              placeholder="code-review"
              className="font-mono text-xs"
            />
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="skill-desc">Description</Label>
            <Textarea
              id="skill-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What this skill enables an agent to do..."
              className="min-h-16 text-sm"
            />
          </div>

          {/* Category */}
          <div className="grid gap-1.5">
            <Label htmlFor="skill-cat">Category</Label>
            <Select
              value={form.category}
              onValueChange={v => setForm(f => ({ ...f, category: v }))}
            >
              <SelectTrigger id="skill-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="grid gap-1.5">
            <Label htmlFor="skill-source">Source</Label>
            <Select
              value={form.source}
              onValueChange={v => setForm(f => ({ ...f, source: v }))}
            >
              <SelectTrigger id="skill-source">
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

        {formError && (
          <p className="flex items-center gap-1.5 text-xs text-danger">
            <AlertTriangle className="size-3.5 shrink-0" />
            {formError}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createSkill.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createSkill.isPending}>
            {createSkill.isPending && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
