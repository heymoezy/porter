import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FolderOpen, Upload, ChevronRight, FileText,
  Folder, Loader2, X, Download, Search,
  MoreVertical, Pencil, Trash2, Check, Maximize2, Minimize2, Rows3,
  Home, AlertTriangle,
} from "lucide-react"
import { AgentPresenceSummary } from "~/components/agent-presence"
import { api } from "~/lib/api"
import { FileTypeIcon } from "~/components/file-type-icon"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { ScrollArea } from "~/components/ui/scroll-area"

/* ── Types ── */

interface FileEntry {
  name: string
  type: "dir" | "file"
  size: string
  size_bytes: number
  mtime: number
  writable: boolean
}

interface FilesResponse {
  entries: FileEntry[]
  writable: boolean
}

interface RootsResponse {
  roots: string[]
}

/* ── Helpers ── */

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatSize(bytes: number | string): string {
  if (typeof bytes === "string") return bytes
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "ts", "tsx", "js", "jsx", "py", "html", "css",
  "yaml", "yml", "toml", "sh", "bash", "env", "ini", "cfg", "conf",
  "xml", "csv", "sql", "log", "gitignore", "dockerfile", "makefile",
])
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"])
const PDF_EXTENSIONS = new Set(["pdf"])

function getFileExt(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

function getPreviewType(name: string): "text" | "image" | "pdf" | "none" {
  const ext = getFileExt(name)
  if (TEXT_EXTENSIONS.has(ext)) return "text"
  if (IMAGE_EXTENSIONS.has(ext)) return "image"
  if (PDF_EXTENSIONS.has(ext)) return "pdf"
  return "none"
}

/* ── File Preview Panel ── */

function FilePreviewPanel({
  root,
  filePath,
  fileName,
  expanded,
  onClose,
  onExpand,
}: {
  root: string
  filePath: string
  fileName: string
  expanded?: boolean
  onClose: () => void
  onExpand?: () => void
}) {
  const previewType = getPreviewType(fileName)
  const contentUrl = `/api/v1/files/content?root=${encodeURIComponent(root)}&path=${encodeURIComponent(filePath)}`

  const { data: textContent, isLoading } = useQuery({
    queryKey: ["file-content", root, filePath],
    queryFn: async () => {
      const res = await fetch(contentUrl, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      return res.text()
    },
    enabled: previewType === "text",
  })

  return (
    <div className="flex flex-col h-full border-l border-border bg-surface">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <FileTypeIcon filename={fileName} size="sm" />
        <p className="text-xs font-medium text-text truncate flex-1">{fileName}</p>
        <a
          href={contentUrl}
          download={fileName}
          className="flex items-center justify-center size-6 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors"
          title="Download"
        >
          <Download className="size-3" />
        </a>
        {onExpand && (
          <button onClick={onExpand} className="flex items-center justify-center size-6 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors" title={expanded ? "Shrink" : "Expand"}>
            {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
        )}
        <button onClick={onClose} className="flex items-center justify-center size-6 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors" title="Close">
          <X className="size-3" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {previewType === "text" && (
          isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="size-4 animate-spin text-text3" />
            </div>
          ) : (
            <pre className="p-4 text-xs leading-relaxed text-text2 font-mono whitespace-pre-wrap break-words">
              {textContent}
            </pre>
          )
        )}
        {previewType === "image" && (
          <div className="flex items-center justify-center p-4">
            <img src={contentUrl} alt={fileName} className="max-w-full max-h-[70vh] rounded-lg object-contain" />
          </div>
        )}
        {previewType === "pdf" && (
          <iframe src={contentUrl} className="w-full h-full border-0" title={fileName} />
        )}
        {previewType === "none" && (
          <div className="flex flex-col items-center justify-center h-full text-text3 p-6">
            <FileText className="size-8 opacity-30 mb-3" />
            <p className="text-xs">Preview not available</p>
            <a href={contentUrl} download={fileName} className="mt-2 text-xs text-accent-porter hover:underline">
              Download file
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page ── */

export default function FilesPage() {
  const qc = useQueryClient()
  const [pathSegments, setPathSegments] = useState<string[]>([])
  const [previewFile, setPreviewFile] = useState<{ name: string; path: string } | null>(null)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [compact, setCompact] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("porter_files_compact") === "true"
  })
  const [search, setSearch] = useState("")
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const currentPath = pathSegments.join("/")

  // Fetch available roots
  const { data: rootsData, isLoading: rootsLoading } = useQuery({
    queryKey: ["files", "roots"],
    queryFn: () => api<RootsResponse>("/api/v1/files"),
  })
  const roots = rootsData?.roots ?? []
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)
  const activeRoot = selectedRoot ?? roots[0] ?? ""

  // Fetch directory listing
  const { data: dirData, isLoading: dirLoading, error } = useQuery({
    queryKey: ["files", "list", activeRoot, currentPath],
    queryFn: () => {
      const params = new URLSearchParams({ root: activeRoot })
      if (currentPath) params.set("path", currentPath)
      return api<FilesResponse>(`/api/v1/files?${params}`)
    },
    enabled: !!activeRoot,
  })
  const rawEntries = dirData?.entries ?? []
  const dirWritable = dirData?.writable ?? false

  const entries = search
    ? rawEntries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : rawEntries

  // Action menu + inline rename/delete state
  const [actionMenu, setActionMenu] = useState<{ name: string; x: number; y: number; writable: boolean } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Mutations
  const deleteMut = useMutation({
    mutationFn: async (name: string) => {
      return api("/api/v1/files/delete", { method: "POST", json: { root: activeRoot, path: currentPath, name } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", "list", activeRoot, currentPath] })
      if (previewFile?.name === confirmDelete) setPreviewFile(null)
      setConfirmDelete(null)
      setActionMenu(null)
    },
  })

  const renameMut = useMutation({
    mutationFn: async ({ name, newName }: { name: string; newName: string }) => {
      return api("/api/v1/files/rename", { method: "POST", json: { root: activeRoot, path: currentPath, name, newName } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", "list", activeRoot, currentPath] })
      setRenaming(null)
    },
  })

  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      form.append("root", activeRoot)
      form.append("path", currentPath)
      const res = await fetch("/api/v1/files/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || `Upload failed (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", "list", activeRoot, currentPath] })
    },
    onError: (e) => {
      setUploadError((e as Error).message)
    },
  })

  async function uploadFiles(fileList: FileList | File[]) {
    setUploadError(null)
    const files = Array.from(fileList)
    setUploadProgress({ current: 0, total: files.length })
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length })
      try {
        await uploadMut.mutateAsync(files[i])
      } catch { /* error handled by onError */ break }
    }
    setUploadProgress(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) uploadFiles(files)
    e.target.value = ""
  }

  function navigateInto(folderName: string) {
    setPathSegments(prev => [...prev, folderName])
    setPreviewFile(null)
  }

  function navigateTo(segments: string[]) {
    setPathSegments(segments)
    setPreviewFile(null)
  }

  function switchRoot(r: string) {
    setSelectedRoot(r)
    setPathSegments([])
    setPreviewFile(null)
  }

  function openFile(name: string) {
    const filePath = currentPath ? `${currentPath}/${name}` : name
    setPreviewFile({ name, path: filePath })
  }

  // Drag and drop handlers
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes("Files")) setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0 && activeRoot && dirWritable) {
      uploadFiles(files)
    }
  }

  const isLoading = rootsLoading || dirLoading

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden min-h-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/80 backdrop-blur-sm border-2 border-dashed border-accent-porter rounded-xl m-2 pointer-events-none">
          <div className="text-center">
            <Upload className="size-10 text-accent-porter mx-auto mb-2" />
            <p className="text-sm font-medium text-text">Drop files to upload</p>
            <p className="text-xs text-text3 mt-1">{activeRoot} / {currentPath || "root"}</p>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
        <AgentPresenceSummary surface="files" />

        {/* Title + root selector + actions */}
        <div className="flex items-center gap-3">
          <FolderOpen className="size-4 text-accent-porter shrink-0" />
          <h1 className="text-sm font-bold text-text">Files</h1>

          {/* Root selector */}
          {roots.length > 1 && (
            <div className="ml-1 flex gap-1">
              {roots.map(r => (
                <button
                  key={r}
                  onClick={() => switchRoot(r)}
                  className={`rounded-md px-2 py-0.5 text-2xs font-medium transition-colors ${
                    activeRoot === r ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
                  }`}
                >{r}</button>
              ))}
            </div>
          )}

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter..."
              className="h-7 w-[160px] bg-raised border-border pl-7 text-xs"
            />
          </div>

          {/* Compact toggle */}
          <button
            onClick={() => {
              const next = !compact
              setCompact(next)
              localStorage.setItem("porter_files_compact", String(next))
            }}
            className={`flex items-center justify-center size-7 rounded-md transition-colors ${
              compact ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
            }`}
            title={compact ? "Comfortable view" : "Compact view"}
          >
            <Rows3 className="size-3.5" />
          </button>

          {/* Upload progress + error */}
          {(uploadMut.isPending || uploadProgress) && (
            <span className="flex items-center gap-1.5 text-xs text-text3">
              <Loader2 className="size-3.5 animate-spin" />
              {uploadProgress && uploadProgress.total > 1 && (
                <span className="tabular-nums">{uploadProgress.current}/{uploadProgress.total}</span>
              )}
              <span>Uploading...</span>
            </span>
          )}
          {uploadError && (
            <span className="text-xs text-danger">{uploadError}</span>
          )}

          {/* Upload button */}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeRoot || !dirWritable || uploadMut.isPending}
            className="gap-1.5"
          >
            <Upload className="size-3.5" />
            Upload
          </Button>
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs">
          <button
            onClick={() => navigateTo([])}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-text3 hover:bg-raised hover:text-text2 transition-colors"
          >
            <Home className="size-3" />
            <span>{activeRoot || "Files"}</span>
          </button>
          {pathSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-2.5 text-text3/50" />
              <button
                onClick={() => navigateTo(pathSegments.slice(0, i + 1))}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  i === pathSegments.length - 1
                    ? "font-medium text-text"
                    : "text-text3 hover:bg-raised hover:text-text2"
                }`}
              >{seg}</button>
            </span>
          ))}
        </nav>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* File list — hidden when preview is expanded */}
        {!previewExpanded && (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Column headers */}
            {activeRoot && !error && (
              <div className="shrink-0 grid grid-cols-[1fr_80px_120px_36px] gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text3 border-y border-border/50">
                <span>Name</span>
                <span className="text-right">Size</span>
                <span className="text-right">Modified</span>
                <span />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-center max-w-sm">
                  <AlertTriangle className="mx-auto mb-2 size-5 text-warning" />
                  <p className="text-xs font-medium text-text2">File system not connected</p>
                  <p className="mt-1 text-2xs text-text3">Porter Brain may be offline or the file API is unavailable.</p>
                </div>
              </div>
            )}

            {/* File list */}
            <ScrollArea className="flex-1">
              <div className="py-0.5">
                {/* Loading skeleton */}
                {isLoading && !error && (
                  <div className="space-y-0.5 px-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                        <div className="h-8 w-8 rounded-lg bg-raised" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-40 rounded bg-raised" />
                          <div className="h-2.5 w-24 rounded bg-raised" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No roots configured */}
                {!isLoading && !error && !activeRoot && (
                  <div className="flex flex-col items-center justify-center py-24 text-text3">
                    <FolderOpen className="size-10 opacity-30 mb-3" />
                    <p className="text-sm font-medium">No storage roots</p>
                    <p className="text-xs mt-1">Configure storage in porter_config.json</p>
                  </div>
                )}

                {/* Empty folder */}
                {!isLoading && !error && activeRoot && entries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-24 text-text3">
                    <FileText className="size-10 opacity-30 mb-3" />
                    <p className="text-sm font-medium">{search ? "No matches" : "Empty folder"}</p>
                  </div>
                )}

                {/* File entries */}
                {!isLoading && !error && entries.map((entry) => {
                  const isDir = entry.type === "dir"
                  const isActive = previewFile?.name === entry.name
                  const isRenaming = renaming === entry.name
                  const isConfirmingDelete = confirmDelete === entry.name

                  return (
                    <div
                      key={entry.name}
                      onClick={() => !isRenaming && (isDir ? navigateInto(entry.name) : openFile(entry.name))}
                      className={`grid grid-cols-[1fr_80px_120px_36px] gap-2 items-center px-5 text-left transition-colors duration-100 group cursor-pointer ${
                        compact ? "py-1" : "py-2"
                      } ${
                        isActive
                          ? "bg-accent-porter/8"
                          : "hover:bg-raised/50"
                      } border-b border-border/20 last:border-0`}
                    >
                      {/* Name column */}
                      <div className={`flex items-center min-w-0 ${compact ? "gap-2" : "gap-3"}`}>
                        {compact ? (
                          isDir
                            ? <Folder className="size-3 text-accent-porter shrink-0" />
                            : <FileText className="size-3 text-text3 shrink-0" />
                        ) : (
                          isDir ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-porter/10 text-accent-porter shrink-0">
                              <Folder className="size-4" />
                            </div>
                          ) : (
                            <FileTypeIcon filename={entry.name} size="sm" />
                          )
                        )}
                        {isRenaming ? (
                          <form
                            className="flex items-center gap-1 flex-1 min-w-0"
                            onSubmit={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (renameValue.trim() && renameValue !== entry.name) {
                                renameMut.mutate({ name: entry.name, newName: renameValue.trim() })
                              } else {
                                setRenaming(null)
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="h-6 text-xs bg-bg border-border flex-1"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null) }}
                            />
                            <button type="submit" className="size-6 flex items-center justify-center rounded text-success hover:bg-raised">
                              <Check className="size-3" />
                            </button>
                            <button type="button" onClick={() => setRenaming(null)} className="size-6 flex items-center justify-center rounded text-text3 hover:bg-raised">
                              <X className="size-3" />
                            </button>
                          </form>
                        ) : (
                          <span className={`truncate text-xs ${
                            isDir ? "font-medium text-text" : "text-text2 group-hover:text-text transition-colors"
                          }`}>
                            {entry.name}
                          </span>
                        )}
                      </div>

                      {/* Size column */}
                      <span className="text-[11px] text-text3 text-right tabular-nums font-mono">
                        {isDir ? "\u2014" : formatSize(entry.size_bytes)}
                      </span>

                      {/* Modified column */}
                      <span className="text-[11px] text-text3 text-right tabular-nums">
                        {formatDate(entry.mtime)}
                      </span>

                      {/* Actions column */}
                      <div className="flex justify-center relative">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => deleteMut.mutate(entry.name)}
                              className="size-6 flex items-center justify-center rounded text-danger hover:bg-danger/10"
                              title="Confirm delete"
                            >
                              <Trash2 className="size-3" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="size-6 flex items-center justify-center rounded text-text3 hover:bg-raised"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setActionMenu(
                                actionMenu?.name === entry.name
                                  ? null
                                  : { name: entry.name, x: e.clientX, y: e.clientY, writable: entry.writable ?? false }
                              )
                            }}
                            className="size-6 flex items-center justify-center rounded text-text3 opacity-0 group-hover:opacity-100 hover:bg-raised transition-all"
                          >
                            <MoreVertical className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Context menu dropdown */}
                {actionMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setActionMenu(null)} />
                    <div
                      className="fixed z-30 rounded-lg border border-border bg-surface shadow-lg py-1 min-w-[140px]"
                      style={{ top: actionMenu.y, left: Math.min(actionMenu.x, window.innerWidth - 180) }}
                    >
                      {actionMenu.writable && (
                        <button
                          onClick={() => {
                            setRenaming(actionMenu.name)
                            setRenameValue(actionMenu.name)
                            setActionMenu(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text2 hover:bg-raised transition-colors"
                        >
                          <Pencil className="size-3" /> Rename
                        </button>
                      )}
                      {!entries.find((e) => e.name === actionMenu.name && e.type === "dir") && (
                        <a
                          href={`/api/v1/files/content?root=${encodeURIComponent(activeRoot)}&path=${encodeURIComponent(currentPath ? `${currentPath}/${actionMenu.name}` : actionMenu.name)}`}
                          download={actionMenu.name}
                          onClick={() => setActionMenu(null)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text2 hover:bg-raised transition-colors"
                        >
                          <Download className="size-3" /> Download
                        </a>
                      )}
                      {actionMenu.writable && (
                        <button
                          onClick={() => {
                            setConfirmDelete(actionMenu.name)
                            setActionMenu(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-raised transition-colors"
                        >
                          <Trash2 className="size-3" /> Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Footer stats */}
            {!isLoading && !error && entries.length > 0 && (
              <div className="shrink-0 flex items-center gap-3 px-5 py-1.5 text-2xs text-text3 border-t border-border/50">
                <span>{entries.filter(e => e.type === "dir").length} folders</span>
                <span className="text-border">|</span>
                <span>{entries.filter(e => e.type === "file").length} files</span>
                {dirWritable && <span className="text-border">|</span>}
                {dirWritable && <span className="text-success/70">writable</span>}
              </div>
            )}
          </div>
        )}

        {/* Preview panel */}
        {previewFile && activeRoot && (
          <div className={previewExpanded ? "flex-1" : "w-[380px] shrink-0"}>
            <FilePreviewPanel
              root={activeRoot}
              filePath={previewFile.path}
              fileName={previewFile.name}
              expanded={previewExpanded}
              onClose={() => { setPreviewFile(null); setPreviewExpanded(false) }}
              onExpand={() => setPreviewExpanded(prev => !prev)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
