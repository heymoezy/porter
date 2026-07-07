import { useState, useEffect, Suspense, lazy, useCallback } from "react"
import { useParams, useNavigate, Link, useBlocker } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { SkillQualityBadge, type QualityTier } from "~/components/skill-quality-badge"
import { SkillEffectivenessBar } from "~/components/skill-effectiveness-bar"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { Card } from "~/components/ui/card"
import { FileText, FolderOpen, ChevronLeft, Save, AlertTriangle, Loader2 } from "lucide-react"
import { markdown } from "@codemirror/lang-markdown"
import { json as jsonLang } from "@codemirror/lang-json"
import { oneDark } from "@codemirror/theme-one-dark"

const CodeMirror = lazy(() => import("@uiw/react-codemirror"))

// ── Types ───────────────────────────────────────────────────

interface SkillFile { path: string; name: string; ext: string; size: number; kind: string }
interface PackDiagnostics {
  fileCount: number; nonEmptyCount: number; totalWords: number;
  scaffoldPhraseMatches: number; scaffoldPct: number;
  missingFiles: string[]; emptyFiles: string[];
  exampleCount: number; guideCount: number; promptWordCount: number;
  qualityScore: number; qualityTier: QualityTier;
  components: {
    completeness: number; specificity: number; examples: number;
    richness: number; uniqueness: number; usage: number; effectiveness: number;
  };
}
interface SkillDetail {
  id: string; name: string; description: string; category: string;
  files: SkillFile[]; qualityScore: number; qualityTier: QualityTier; diagnostics: PackDiagnostics;
}

// ── Sub-components ──────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}K`
}

function FileEntry({ file, selected, isEmpty, onClick }: {
  file: SkillFile; selected: boolean; isEmpty: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-left transition-colors ${
        selected ? "bg-accent-porter/15 text-accent-porter" : isEmpty ? "text-text3" : "text-text2 hover:bg-surface"
      }`}
    >
      <FileText className="size-3 shrink-0" />
      <span className="truncate text-xs">{file.name}</span>
      {isEmpty && <Badge className="text-2xs border-0 bg-warning/15 text-warning ml-auto">empty</Badge>}
      {!isEmpty && file.size > 0 && <span className="text-2xs text-text3 ml-auto">{formatSize(file.size)}</span>}
    </button>
  )
}

function MissingFileEntry({ path: filePath, onClick }: { path: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-left text-text3/50 hover:bg-surface transition-colors"
    >
      <AlertTriangle className="size-3 shrink-0" />
      <span className="truncate text-xs">{filePath.split("/").pop()}</span>
      <Badge className="text-2xs border-0 bg-text3/15 text-text3 ml-auto">missing</Badge>
    </button>
  )
}

function FileTree({ files, diagnostics, selectedPath, onSelect }: {
  files: SkillFile[]; diagnostics?: PackDiagnostics;
  selectedPath: string | null; onSelect: (path: string) => void;
}) {
  const roots = files.filter(f => !f.path.includes("/"))
  const byFolder = new Map<string, SkillFile[]>()
  for (const f of files) {
    if (f.path.includes("/")) {
      const folder = f.path.split("/")[0]
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), f])
    }
  }

  const missingPaths = diagnostics?.missingFiles ?? []
  const emptyPaths = new Set(diagnostics?.emptyFiles ?? [])

  return (
    <div className="flex flex-col gap-0.5 p-2">
      {roots.map(f => (
        <FileEntry key={f.path} file={f} selected={f.path === selectedPath}
          isEmpty={emptyPaths.has(f.path)} onClick={() => onSelect(f.path)} />
      ))}
      {missingPaths.filter(p => !p.includes("/")).map(p => (
        <MissingFileEntry key={p} path={p} onClick={() => onSelect(p)} />
      ))}
      {Array.from(byFolder.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => (
        <div key={folder}>
          <div className="flex items-center gap-1 px-1 py-0.5 text-text3 text-2xs uppercase tracking-wide font-semibold mt-2">
            <FolderOpen className="size-3" />{folder}
          </div>
          {items.map(f => (
            <FileEntry key={f.path} file={f} selected={f.path === selectedPath}
              isEmpty={emptyPaths.has(f.path)} onClick={() => onSelect(f.path)} />
          ))}
          {missingPaths.filter(p => p.startsWith(folder + "/")).map(p => (
            <MissingFileEntry key={p} path={p} onClick={() => onSelect(p)} />
          ))}
        </div>
      ))}
    </div>
  )
}

function DiagnosticsSummary({ diagnostics }: { diagnostics?: PackDiagnostics }) {
  if (!diagnostics) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 rounded-lg bg-surface border border-border text-xs">
      <div className="flex items-center gap-2">
        <SkillQualityBadge tier={diagnostics.qualityTier} />
        <span className="font-bold text-text">Score: {diagnostics.qualityScore}/100</span>
      </div>
      <div className="h-4 w-px bg-border hidden sm:block" />
      <span className="text-text3">{diagnostics.fileCount} files</span>
      <span className="text-text3">{diagnostics.exampleCount} examples</span>
      <span className="text-text3">{diagnostics.guideCount} guides</span>
      <span className="text-text3">{diagnostics.totalWords.toLocaleString()} words</span>
      {diagnostics.scaffoldPct > 0 && (
        <span className="text-warning font-medium">{diagnostics.scaffoldPct}% scaffold</span>
      )}
      {diagnostics.missingFiles.length > 0 && (
        <span className="text-danger font-medium">{diagnostics.missingFiles.length} missing</span>
      )}
      <div className="w-full flex gap-2 mt-1 pt-1 border-t border-border/50 text-[10px] text-text3 overflow-x-auto whitespace-nowrap">
        <span>Completeness: {diagnostics.components.completeness}/20</span>
        <span>Specificity: {diagnostics.components.specificity}/20</span>
        <span>Examples: {diagnostics.components.examples}/15</span>
        <span>Richness: {diagnostics.components.richness}/15</span>
        <span>Uniqueness: {diagnostics.components.uniqueness}/10</span>
        <span>Usage: {diagnostics.components.usage}/10</span>
        <span>Effectiveness: {diagnostics.components.effectiveness}/10</span>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────

export default function SkillPackExplorer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [isDirty, setIsDirty] = useState(false)

  const { data: skillData, isLoading } = useQuery({
    queryKey: ["admin", "skill", id],
    queryFn: () => api<{ skill: SkillDetail }>(`/api/admin/skills/${id}`),
    enabled: !!id,
  })
  const skill = skillData?.skill

  const { data: fileData, isFetching: fileFetching, isError: fileError } = useQuery({
    queryKey: ["admin", "skill-file", id, selectedFile],
    queryFn: () => api<{ text: string }>(`/api/admin/skills/${id}/files/${selectedFile}`),
    enabled: !!id && !!selectedFile,
    retry: false,
  })

  const { data: effectivenessData } = useQuery({
    queryKey: ["skill-effectiveness", id],
    queryFn: () => fetch(`/api/admin/skills/${id}/effectiveness`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  })

  useEffect(() => {
    if (fileError) {
      setEditorContent("")
      setSavedContent("")
      setIsDirty(false)
    } else if (fileData?.text != null) {
      setEditorContent(fileData.text)
      setSavedContent(fileData.text)
      setIsDirty(false)
    }
  }, [fileData, fileError])

  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value)
    setIsDirty(value !== savedContent)
  }, [savedContent])

  const saveMutation = useMutation({
    mutationFn: (content: string) =>
      api<{ saved: boolean; path: string }>(`/api/admin/skills/${id}/files/${selectedFile}`, {
        method: "PUT",
        json: { content },
      }),
    onSuccess: () => {
      setSavedContent(editorContent)
      setIsDirty(false)
      qc.invalidateQueries({ queryKey: ["admin", "skill", id] })
    },
  })

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname
  )

  const isJson = selectedFile?.endsWith(".json") ?? false

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-text3" />
      </div>
    )
  }
  if (!skill) return <div className="p-4 text-text3">Skill not found</div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Breadcrumb — fixed */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border text-xs shrink-0">
        <Link to="/skills" className="text-text3 hover:text-text transition-colors">Skills</Link>
        <span className="text-text3">/</span>
        <span className="text-text font-medium">{skill.name}</span>
        <Button size="xs" variant="ghost" onClick={() => navigate("/skills")} className="ml-auto">
          <ChevronLeft className="size-3 mr-1" />Back to Skills
        </Button>
      </div>

      {/* Split pane — fills remaining space */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: file tree + diagnostics + effectiveness (scrollable) */}
        <div className="w-[250px] border-r border-border overflow-y-auto shrink-0">
          {/* Diagnostics summary */}
          <div className="px-3 py-2 border-b border-border">
            <DiagnosticsSummary diagnostics={skill.diagnostics} />
          </div>
          {/* File tree */}
          <FileTree
            files={skill.files}
            diagnostics={skill.diagnostics}
            selectedPath={selectedFile}
            onSelect={(p) => {
              if (isDirty && !confirm("Discard unsaved changes?")) return
              setSelectedFile(p)
              setIsDirty(false)
            }}
          />

          {/* Effectiveness */}
          <div className="px-3 py-2 border-t border-border">
            <h3 className="text-xs font-medium text-text2 mb-1.5">Effectiveness</h3>
            {!effectivenessData?.data?.agents?.length ? (
              <p className="text-2xs text-text3">No data yet</p>
            ) : (
              <div className="space-y-1">
                {effectivenessData.data.agents.map((a: any) => (
                  <div key={a.persona_id} className="flex items-center justify-between py-0.5">
                    <span className="text-2xs text-text2 truncate mr-2">{a.persona_name || a.persona_id}</span>
                    <SkillEffectivenessBar
                      positive={a.positive_count}
                      negative={a.negative_count}
                      score={a.effectiveness_score}
                      timesSelected={a.times_selected}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile ? (
            <>
              {/* Editor toolbar */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface">
                <FileText className="size-3 text-text3" />
                <span className="text-xs font-medium text-text">{selectedFile}</span>
                {isDirty && <Badge className="text-2xs border-0 bg-warning/15 text-warning">unsaved</Badge>}
                <Button
                  size="xs"
                  onClick={() => saveMutation.mutate(editorContent)}
                  disabled={!isDirty || saveMutation.isPending}
                  className="ml-auto"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="size-3 mr-1" />
                  )}
                  Save
                </Button>
              </div>

              {/* CodeMirror */}
              <div className="flex-1 min-h-0 overflow-auto">
                {fileFetching ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="size-5 animate-spin text-text3" />
                  </div>
                ) : (
                  <Suspense fallback={<div className="p-4 text-text3">Loading editor...</div>}>
                    <CodeMirror
                      key={selectedFile}
                      value={editorContent}
                      height="100%"
                      theme={typeof document !== "undefined" && !document.documentElement.classList.contains("light") ? oneDark : "light"}
                      extensions={[isJson ? jsonLang() : markdown()]}
                      onChange={handleEditorChange}
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: false,
                        dropCursor: false,
                        allowMultipleSelections: false,
                        indentOnInput: true,
                      }}
                    />
                  </Suspense>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-text3 text-sm">
              Select a file from the tree to view and edit
            </div>
          )}
        </div>
      </div>

      {/* Blocker dialog */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="p-4 max-w-sm space-y-3">
            <p className="text-sm font-medium">Unsaved changes</p>
            <p className="text-xs text-text3">You have unsaved changes. Leave anyway?</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => blocker.reset?.()}>Stay</Button>
              <Button size="sm" variant="destructive" onClick={() => blocker.proceed?.()}>Leave</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
