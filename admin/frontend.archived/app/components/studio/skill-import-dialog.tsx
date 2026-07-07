import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Badge } from "~/components/ui/badge"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog"
import {
  Loader2,
  AlertTriangle,
  Download,
  Search,
  CheckCircle,
  XCircle,
  GitBranch,
  Globe,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface ImportCandidate {
  id: string
  name: string
  description: string
  category: string
  source: string
  dirPath: string
  files: string[]
  conflict: boolean
}

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

interface ScanResponse {
  candidates: ImportCandidate[]
  repoUrl: string
}

interface SkillImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Pre-configured sources ─────────────────────────────

const SOURCES = [
  { label: "VoltAgent", url: "github.com/VoltAgent/awesome-agent-skills", icon: "VA" },
  { label: "Anthropic", url: "github.com/anthropics/skills", icon: "AN" },
  { label: "Supabase", url: "github.com/supabase/agent-skills", icon: "SB" },
]

type Step = "source" | "preview" | "import"

// ── Component ──────────────────────────────────────────

export function SkillImportDialog({ open, onOpenChange }: SkillImportDialogProps) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>("source")
  const [customUrl, setCustomUrl] = useState("")
  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ImportResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Reset state when dialog closes/opens
  function handleOpenChange(open: boolean) {
    if (!open) {
      setStep("source")
      setCustomUrl("")
      setCandidates([])
      setSelected(new Set())
      setResult(null)
      setScanError(null)
    }
    onOpenChange(open)
  }

  // ── Scan mutation ──────────────────────────────────────

  const scanMutation = useMutation({
    mutationFn: (repoUrl: string) =>
      api<ScanResponse>("/api/admin/skills/import/scan", {
        method: "POST",
        json: { repoUrl },
      }),
    onSuccess: (data) => {
      setScanError(null)
      const found = data.candidates ?? []
      setCandidates(found)
      // Pre-select non-conflicting candidates
      setSelected(new Set(found.filter(c => !c.conflict).map(c => c.id)))
      setStep("preview")
    },
    onError: (err: Error) => {
      setScanError(err.message)
    },
  })

  // ── Import mutation ────────────────────────────────────

  const importMutation = useMutation({
    mutationFn: (payload: { candidates: ImportCandidate[]; overwrite: boolean }) =>
      api<ImportResult>("/api/admin/skills/import/execute", {
        method: "POST",
        json: payload,
      }),
    onSuccess: (data) => {
      setResult(data)
      setStep("import")
      qc.invalidateQueries({ queryKey: ["admin", "skills"] })
    },
    onError: (err: Error) => {
      setResult({ imported: 0, skipped: 0, errors: [err.message] })
      setStep("import")
    },
  })

  // ── Handlers ───────────────────────────────────────────

  function handleScan(url: string) {
    setScanError(null)
    scanMutation.mutate(url)
  }

  function toggleCandidate(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(candidates.map(c => c.id)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function handleImport() {
    const toImport = candidates.filter(c => selected.has(c.id))
    if (toImport.length === 0) return
    importMutation.mutate({ candidates: toImport, overwrite: false })
  }

  const isScanning = scanMutation.isPending
  const isImporting = importMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4" />
            Import Skills
            {step !== "source" && (
              <Badge className="text-2xs border-0 bg-accent-porter/15 text-accent-porter ml-2">
                {step === "preview" ? "Preview" : "Complete"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Source ───────────────────────────────── */}
        {step === "source" && (
          <div className="space-y-3">
            <p className="text-xs text-text3">
              Import skills from a GitHub repository containing SKILL.md files.
            </p>

            {/* Pre-configured sources */}
            <div className="grid grid-cols-3 gap-2">
              {SOURCES.map(src => (
                <button
                  key={src.label}
                  onClick={() => handleScan(`https://${src.url}`)}
                  disabled={isScanning}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center transition-colors hover:bg-surface hover:border-accent-porter/40 disabled:opacity-50"
                >
                  <span className="flex size-8 items-center justify-center rounded-md bg-surface text-xs font-bold text-accent-porter">
                    {src.icon}
                  </span>
                  <span className="text-xs font-medium text-text">{src.label}</span>
                  <span className="text-2xs text-text3 truncate w-full">{src.url.split("/").slice(-1)}</span>
                </button>
              ))}
            </div>

            {/* Custom URL */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-text3" />
                <Input
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="github.com/user/repo"
                  className="h-8 bg-raised border-border pl-8 text-xs"
                  onKeyDown={e => {
                    if (e.key === "Enter" && customUrl.trim()) handleScan(customUrl.trim())
                  }}
                />
              </div>
              <Button
                size="sm"
                onClick={() => handleScan(customUrl.trim())}
                disabled={!customUrl.trim() || isScanning}
              >
                {isScanning ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Search className="size-3 mr-1" />}
                Scan
              </Button>
            </div>

            {isScanning && (
              <div className="flex items-center gap-2 rounded-md bg-surface p-3">
                <Loader2 className="size-4 animate-spin text-accent-porter" />
                <span className="text-xs text-text3">Cloning repository and scanning for skills...</span>
              </div>
            )}

            {scanError && (
              <p className="flex items-center gap-1.5 text-xs text-danger">
                <AlertTriangle className="size-3.5 shrink-0" />
                {scanError}
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Preview ─────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text3">
                Found {candidates.length} skill{candidates.length !== 1 ? "s" : ""} · {selected.size} selected
              </span>
              <div className="flex gap-1">
                <Button size="xs" variant="ghost" onClick={selectAll}>Select All</Button>
                <Button size="xs" variant="ghost" onClick={deselectAll}>Deselect All</Button>
              </div>
            </div>

            {candidates.length === 0 ? (
              <div className="rounded-lg border border-border p-6 text-center">
                <p className="text-xs text-text3">No SKILL.md files found in this repository.</p>
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-surface text-left">
                      <th className="w-8 px-2 py-1.5" />
                      <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Skill</th>
                      <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Category</th>
                      <th className="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => toggleCandidate(c.id)}
                        className="border-b border-border/20 last:border-0 cursor-pointer hover:bg-surface/60 transition-colors"
                      >
                        <td className="px-2 py-1.5">
                          <Checkbox
                            checked={selected.has(c.id)}
                            onCheckedChange={() => toggleCandidate(c.id)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-text">{c.name}</span>
                            {c.conflict && (
                              <Badge className="text-2xs border-0 bg-warning/15 text-warning">exists</Badge>
                            )}
                          </div>
                          {c.description && (
                            <p className="text-2xs text-text3 truncate max-w-[250px]">{c.description}</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge className="text-2xs border-0 bg-text3/15 text-text3">{c.category}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-xs text-text3">{c.files.length}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Import Result ───────────────────────── */}
        {step === "import" && result && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border p-3 text-center">
                <CheckCircle className="mx-auto mb-1 size-5 text-success" />
                <div className="text-lg font-bold text-text">{result.imported}</div>
                <div className="text-2xs text-text3">Imported</div>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <GitBranch className="mx-auto mb-1 size-5 text-text3" />
                <div className="text-lg font-bold text-text">{result.skipped}</div>
                <div className="text-2xs text-text3">Skipped</div>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <XCircle className="mx-auto mb-1 size-5 text-danger" />
                <div className="text-lg font-bold text-text">{result.errors.length}</div>
                <div className="text-2xs text-text3">Errors</div>
              </div>
            </div>

            {/* Error list */}
            {result.errors.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-danger/30 bg-danger/5 p-3">
                <p className="mb-1 text-xs font-medium text-danger">Errors:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className="text-2xs text-text3">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────── */}
        <DialogFooter>
          {step === "source" && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("source")}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={selected.size === 0 || isImporting}
              >
                {isImporting ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Download className="size-3 mr-1" />
                )}
                Import {selected.size} Skill{selected.size !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "import" && (
            <Button onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
