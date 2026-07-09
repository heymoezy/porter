import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Library, ChevronRight, Folder, FileText, Boxes, Layers,
  Hash, MapPin, Copy, Check, RefreshCw, AlertTriangle, Home,
} from "lucide-react"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"

/* ── Types (mirror backend/src/routes/admin/files.ts) ── */

interface FilesApp {
  appScope: string
  projectCount: number
  documentCount: number
  locationCount: number
}

interface TreeDocument {
  nodeId: string
  title: string
  contentHash: string | null
  canonicalPath: string | null
  locationCount: number
  sizeBytes: number | null
  hasMarkdown: boolean
}

interface TreeProject {
  nodeId: string
  title: string
  documentCount: number
  locationCount: number
  mirrorCount: number
  documents: TreeDocument[]
}

interface TreeResponse {
  appScope: string
  projects: TreeProject[]
  mirrorCount: number
  documentTotal: number
}

interface DocumentLocation {
  absolutePath: string
  relativePath: string | null
  project: string | null
  present: boolean
  sizeBytes: number | null
}

interface DocumentDetail {
  nodeId: string
  title: string
  contentHash: string | null
  canonicalPath: string | null
  locations: DocumentLocation[]
  projects: Array<{ nodeId: string; title: string }>
  sizeBytes: number | null
  hasMarkdown?: boolean
  markdownPath?: string | null
  mtime: string | null
}

interface SyncResult {
  appScope: string
  triggered: boolean
  message: string
  command?: string
  cwd?: string
  note?: string
}

/* ── Helpers ── */

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function shortHash(hash: string | null): string {
  if (!hash) return "—"
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

/* ── Copy-to-clipboard button ── */

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="flex items-center justify-center size-5 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors shrink-0"
      title={label ?? "Copy"}
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  )
}

/* ── Sync dialog — honest instructions only, never fake success ── */

function SyncDialog({ appScope, onClose }: { appScope: string; onClose: () => void }) {
  const [result, setResult] = useState<SyncResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runCheck() {
    setLoading(true)
    setError(null)
    try {
      const res = await api<SyncResult>("/api/admin/files/sync", {
        method: "POST",
        json: { app_scope: appScope },
      })
      setResult(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync "{appScope}"</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text2">
          Porter does not run app-side file scans itself. Requesting a sync returns the exact
          command to run in that app's own repo — nothing executes here.
        </p>
        {!result && !loading && (
          <Button size="sm" onClick={runCheck}>Get sync command</Button>
        )}
        {loading && <p className="text-xs text-text3">Checking…</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
        {result && (
          <div className="space-y-2">
            <p className="text-xs text-text2">{result.message}</p>
            {result.command && (
              <div className="rounded-lg border border-border bg-raised p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-wide text-text3">cwd</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code className="text-2xs font-mono text-text2 truncate">{result.cwd}</code>
                    {result.cwd && <CopyButton value={result.cwd} />}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-wide text-text3">command</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code className="text-2xs font-mono text-text2 truncate">{result.command}</code>
                    <CopyButton value={result.command} />
                  </div>
                </div>
                {result.note && <p className="text-2xs text-text3 pt-1">{result.note}</p>}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Document detail panel ── */

function DocumentDetailPanel({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["vault-files", "document", nodeId],
    queryFn: () => api<DocumentDetail>(`/api/admin/files/document/${nodeId}`),
  })

  return (
    <div className="flex flex-col h-full border-l border-border bg-surface w-[420px] shrink-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <FileText className="size-4 text-accent-porter shrink-0" />
        <p className="text-xs font-medium text-text truncate flex-1">{data?.title ?? "…"}</p>
        <button onClick={onClose} className="flex items-center justify-center size-6 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors">
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        {isLoading && <p className="text-xs text-text3">Loading…</p>}
        {error && <p className="text-xs text-danger">Failed to load document detail.</p>}

        {data && (
          <>
            {/* Content hash */}
            <div>
              <p className="text-2xs uppercase tracking-wide text-text3 mb-1 flex items-center gap-1">
                <Hash className="size-3" /> Content hash
              </p>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-raised px-2 py-1.5">
                <code className="text-xs font-mono text-text2 truncate flex-1">{shortHash(data.contentHash)}</code>
                {data.contentHash && <CopyButton value={data.contentHash} label="Copy full hash" />}
              </div>
            </div>

            {/* Canonical path */}
            <div>
              <p className="text-2xs uppercase tracking-wide text-text3 mb-1">Canonical path</p>
              <div className="flex items-start gap-1.5 rounded-md border border-border bg-raised px-2 py-1.5">
                <code className="text-2xs font-mono text-text2 break-all flex-1">{data.canonicalPath ?? "—"}</code>
                {data.canonicalPath && <CopyButton value={data.canonicalPath} label="Copy path" />}
              </div>
            </div>

            {/* Size / mtime */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xs uppercase tracking-wide text-text3 mb-1">Size</p>
                <p className="text-xs text-text2 font-mono">{formatSize(data.sizeBytes)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-text3 mb-1">Modified</p>
                <p className="text-xs text-text2 font-mono">{formatDate(data.mtime)}</p>
              </div>
            </div>

            {/* Projects */}
            <div>
              <p className="text-2xs uppercase tracking-wide text-text3 mb-1.5 flex items-center gap-1">
                <Boxes className="size-3" /> Projects ({data.projects.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.projects.map((p) => (
                  <Badge key={p.nodeId} variant="outline" className="text-2xs">{p.title}</Badge>
                ))}
              </div>
            </div>

            {/* All locations */}
            <div>
              <p className="text-2xs uppercase tracking-wide text-text3 mb-1.5 flex items-center gap-1">
                <MapPin className="size-3" /> All locations ({data.locations.length})
              </p>
              <div className="space-y-1.5">
                {data.locations.map((loc, i) => (
                  <div
                    key={i}
                    className={`rounded-md border px-2 py-1.5 ${
                      loc.present ? "border-border bg-raised" : "border-border/40 bg-raised/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-2xs font-medium text-text2">{loc.project ?? "—"}</span>
                      <div className="flex items-center gap-1.5">
                        {!loc.present && (
                          <Badge variant="destructive" className="text-[9px] px-1 h-4">missing</Badge>
                        )}
                        <span className="text-[10px] text-text3 tabular-nums font-mono">{formatSize(loc.sizeBytes)}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-1">
                      <code className="text-2xs font-mono text-text3 break-all flex-1">{loc.absolutePath}</code>
                      <CopyButton value={loc.absolutePath} label="Copy path" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Page ── */

type View =
  | { level: "apps" }
  | { level: "projects"; appScope: string }
  | { level: "documents"; appScope: string; projectId: string }

export default function VaultFilesPage() {
  const [view, setView] = useState<View>({ level: "apps" })
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [syncApp, setSyncApp] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const { data: appsData, isLoading: appsLoading, error: appsError } = useQuery({
    queryKey: ["vault-files", "apps"],
    queryFn: () => api<FilesApp[]>("/api/admin/files/apps"),
  })

  const activeAppScope = view.level === "apps" ? null : view.appScope

  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ["vault-files", "tree", activeAppScope],
    queryFn: () => api<TreeResponse>(`/api/admin/files/tree?app_scope=${encodeURIComponent(activeAppScope!)}`),
    enabled: !!activeAppScope,
  })

  const apps = appsData ?? []
  const projects = treeData?.projects ?? []
  const activeProject = view.level === "documents" ? projects.find((p) => p.nodeId === view.projectId) : undefined

  const documents = activeProject?.documents ?? []
  const filteredDocuments = search
    ? documents.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
    : documents

  const isLoading = view.level === "apps" ? appsLoading : treeLoading

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-3 space-y-2">
          <div className="flex items-center gap-3">
            <Library className="size-5 text-accent-porter" />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Document Library</h1>
              <p className="text-sm text-text3 mt-0.5">
                The vault's graph-organized, content-deduped Files directory — every document ingested
                from an app's declared roots, one node per unique content hash.
              </p>
            </div>
            {view.level !== "apps" && (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter documents…"
                className="h-8 w-[220px] bg-raised border-border text-xs"
              />
            )}
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs">
            <button
              onClick={() => { setView({ level: "apps" }); setSelectedDoc(null); setSearch("") }}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                view.level === "apps" ? "font-medium text-text" : "text-text3 hover:bg-raised hover:text-text2"
              }`}
            >
              <Home className="size-3" /> Documents
            </button>
            {view.level !== "apps" && (
              <>
                <ChevronRight className="size-2.5 text-text3/50" />
                <button
                  onClick={() => { setView({ level: "projects", appScope: view.appScope }); setSelectedDoc(null); setSearch("") }}
                  className={`rounded px-1.5 py-0.5 transition-colors ${
                    view.level === "projects" ? "font-medium text-text" : "text-text3 hover:bg-raised hover:text-text2"
                  }`}
                >
                  {view.appScope}
                </button>
              </>
            )}
            {view.level === "documents" && activeProject && (
              <>
                <ChevronRight className="size-2.5 text-text3/50" />
                <span className="rounded px-1.5 py-0.5 font-medium text-text">{activeProject.title}</span>
              </>
            )}
          </nav>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
          {isLoading && (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-raised animate-pulse" />
              ))}
            </div>
          )}

          {appsError && view.level === "apps" && (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="size-8 text-warning mb-2" />
              <p className="text-sm text-text2">Could not load Files directory apps.</p>
            </div>
          )}

          {/* Level 0 — apps */}
          {!isLoading && view.level === "apps" && (
            apps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-text3">
                <Library className="size-10 opacity-30 mb-3" />
                <p className="text-sm font-medium">No documents in the vault yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {apps.map((app) => (
                  <div
                    key={app.appScope}
                    onClick={() => setView({ level: "projects", appScope: app.appScope })}
                    className="cursor-pointer rounded-xl border border-border bg-surface p-4 hover:border-accent-porter/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-porter/10 text-accent-porter">
                        <Boxes className="size-4" />
                      </div>
                      <p className="text-sm font-semibold text-text">{app.appScope}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-base font-bold text-text tabular-nums">{app.projectCount}</p>
                        <p className="text-[10px] text-text3 uppercase tracking-wide">Projects</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-text tabular-nums">{app.documentCount.toLocaleString()}</p>
                        <p className="text-[10px] text-text3 uppercase tracking-wide">Documents</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-text tabular-nums">{app.locationCount.toLocaleString()}</p>
                        <p className="text-[10px] text-text3 uppercase tracking-wide">Locations</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-3 gap-1.5"
                      onClick={(e) => { e.stopPropagation(); setSyncApp(app.appScope) }}
                    >
                      <RefreshCw className="size-3" /> Sync
                    </Button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Level 1 — projects (documents_root nodes) */}
          {!isLoading && view.level === "projects" && (
            projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-text3">
                <Folder className="size-10 opacity-30 mb-3" />
                <p className="text-sm font-medium">No projects found for {view.appScope}</p>
              </div>
            ) : (
              <div className="space-y-1 pt-2">
                {projects.map((p) => (
                  <div
                    key={p.nodeId}
                    onClick={() => setView({ level: "documents", appScope: view.appScope, projectId: p.nodeId })}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/40 bg-surface hover:border-accent-porter/40 cursor-pointer transition-colors"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-porter/10 text-accent-porter shrink-0">
                      <Folder className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{p.title}</p>
                      <p className="text-2xs text-text3">
                        {p.documentCount.toLocaleString()} documents · {p.locationCount.toLocaleString()} locations
                        {" · "}<span className={p.mirrorCount === p.documentCount && p.documentCount > 0 ? "text-teal-600" : "text-amber-600"}>{p.mirrorCount.toLocaleString()}/{p.documentCount.toLocaleString()} mirrored</span>
                      </p>
                      {/* Grok coverage bar: teal fill = fraction of docs with a .md mirror. */}
                      <div className="mt-1 h-1 w-40 rounded-sm bg-border/60 overflow-hidden">
                        <div className="h-full bg-teal-500" style={{ width: `${p.documentCount > 0 ? Math.round((p.mirrorCount / p.documentCount) * 100) : 0}%` }} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-text3 shrink-0" />
                  </div>
                ))}
              </div>
            )
          )}

          {/* Level 2 — documents within a project */}
          {!isLoading && view.level === "documents" && (
            filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-text3">
                <FileText className="size-10 opacity-30 mb-3" />
                <p className="text-sm font-medium">{search ? "No matches" : "No documents in this project"}</p>
              </div>
            ) : (
              <>
                <div className="shrink-0 grid grid-cols-[1fr_92px_100px_90px] gap-2 px-4 py-2 text-[10px] font-semibold tracking-[0.06em] text-text3 border-b border-border/50">
                  <span>Document</span>
                  <span className="text-right">.md mirror</span>
                  <span className="text-right">Locations</span>
                  <span className="text-right">Size</span>
                </div>
                <div className="divide-y divide-border/20">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.nodeId}
                      onClick={() => setSelectedDoc(doc.nodeId)}
                      className={`grid grid-cols-[1fr_92px_100px_90px] gap-2 items-center px-4 py-2.5 cursor-pointer transition-colors ${
                        selectedDoc === doc.nodeId ? "bg-accent-porter/8" : "hover:bg-raised/50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="size-3.5 text-text3 shrink-0" />
                        <span className="truncate text-xs text-text2">{doc.title}</span>
                      </div>
                      <div className="flex justify-end">
                        {/* .md mirror status — a first-class signal (Grok design): teal chip when it
                            exists, muted "No mirror" when missing. */}
                        {doc.hasMarkdown ? (
                          <Badge className="text-[10px] gap-1 h-5 border-teal-500/30 bg-teal-500/10 text-teal-700">
                            <Check className="size-2.5" /> .md
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] h-5 text-text3 border-border/60">
                            No mirror
                          </Badge>
                        )}
                      </div>
                      <div className="flex justify-end">
                        {doc.locationCount > 1 && (
                          <Badge variant="outline" className="text-[10px] gap-1 h-5">
                            <Layers className="size-2.5" /> {doc.locationCount} locations
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-text3 text-right tabular-nums font-mono">
                        {formatSize(doc.sizeBytes)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 px-4 py-2 text-2xs text-text3 border-t border-border/50">
                  <span>{filteredDocuments.length.toLocaleString()} of {documents.length.toLocaleString()} documents</span>
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDoc && (
        <DocumentDetailPanel nodeId={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}

      {/* Sync dialog */}
      {syncApp && <SyncDialog appScope={syncApp} onClose={() => setSyncApp(null)} />}
    </div>
  )
}
