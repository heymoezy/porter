import { useState, useRef, useEffect } from "react"
import { useLocation } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FolderOpen, Upload, ChevronRight, FileText,
  Folder, FolderPlus, Loader2, X, Download, Search,
  MoreVertical, Pencil, Trash2, Check, Maximize2, Minimize2, Rows3,
  Home, AlertTriangle,
} from "lucide-react"
import { Link } from "react-router"
import { PixelPortrait } from "~/components/pixel-portrait"
import { api } from "~/lib/api"
import { FileTypeIcon } from "~/components/file-type-icon"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog"
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
  const location = useLocation()
  const resetToken = (location.state as any)?.reset
  const [pathSegments, setPathSegments] = useState<string[]>([])
  const [previewFile, setPreviewFile] = useState<{ name: string; path: string } | null>(null)

  // Reset to root when nav link is clicked (passes state.reset timestamp)
  const lastReset = useRef(resetToken)
  useEffect(() => {
    if (resetToken && resetToken !== lastReset.current) {
      lastReset.current = resetToken
      setPathSegments([])
      setPreviewFile(null)
    }
  }, [resetToken])
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

  // Refs that ALWAYS hold the latest root + path — immune to re-renders/effects
  const activeRootRef = useRef("")
  const currentPathRef = useRef("")

  // Fetch agents assigned to projects (agent_group = 'system' or specific personas)
  const { data: agentsData } = useQuery({
    queryKey: ["admin", "agents", "projects"],
    queryFn: () => api<{ agents: Array<{ id: string; name: string; role: string; template_id: string | null; appearance_spec: unknown; status: string }> }>("/api/admin/agents"),
    staleTime: 60000,
  })
  const projectAgents = (agentsData?.agents ?? []).filter(a =>
    a.id === "projects-curator"
  )

  // Fetch available roots
  const { data: rootsData, isLoading: rootsLoading } = useQuery({
    queryKey: ["files", "roots"],
    queryFn: () => api<RootsResponse>("/api/v1/files"),
  })
  const roots = rootsData?.roots ?? []
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)
  const activeRoot = selectedRoot ?? roots[0] ?? ""

  // Keep refs in sync — these are what upload functions read
  activeRootRef.current = activeRoot
  currentPathRef.current = currentPath

  // Fetch directory listing — short staleTime so mutations trigger fresh refetch
  const { data: dirData, isLoading: dirLoading, error } = useQuery({
    queryKey: ["files", "list", activeRoot, currentPath],
    queryFn: () => {
      const params = new URLSearchParams({ root: activeRoot })
      if (currentPath) params.set("path", currentPath)
      return api<FilesResponse>(`/api/v1/files?${params}`)
    },
    enabled: !!activeRoot,
    staleTime: 2000,
    refetchOnWindowFocus: true,
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

  const moveMut = useMutation({
    mutationFn: async ({ name, destPath }: { name: string; destPath: string }) => {
      return api("/api/v1/files/move", { method: "POST", json: { root: activeRoot, sourcePath: currentPath, name, destPath } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", "list"] })
    },
  })

  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadQueue, setUploadQueue] = useState<Array<{ name: string; status: "pending" | "uploading" | "done" | "error"; pct: number }>>([])

  function uploadOneFile(file: File, root: string, path: string, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", "/api/v1/files/upload")
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else {
          try { const body = JSON.parse(xhr.responseText); reject(new Error(body?.error?.message || `Upload failed (${xhr.status})`)) }
          catch { reject(new Error(`Upload failed (${xhr.status})`)) }
        }
      }
      xhr.onerror = () => reject(new Error("Network error"))
      const form = new FormData()
      form.append("root", root)
      form.append("path", path)
      form.append("file", file)
      xhr.send(form)
    })
  }

  const [newFolderName, setNewFolderName] = useState<string | null>(null)
  const mkdirMut = useMutation({
    mutationFn: (name: string) =>
      api("/api/v1/files/mkdir", { method: "POST", json: { root: activeRoot, path: currentPath, name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", "list", activeRoot, currentPath] })
      setNewFolderName(null)
    },
  })

  async function uploadFiles(fileList: FileList | File[]) {
    setUploadError(null)
    const files = Array.from(fileList)
    // Read from refs — guaranteed latest values, immune to re-renders
    const root = activeRootRef.current
    const path = currentPathRef.current
    const queue = files.map(f => ({ name: f.name, status: "pending" as const, pct: 0 }))
    setUploadQueue(queue)
    for (let i = 0; i < files.length; i++) {
      setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "uploading", pct: 0 } : item))
      try {
        await uploadOneFile(files[i], root, path, (pct) => {
          setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, pct } : item))
        })
        setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "done", pct: 100 } : item))
        qc.invalidateQueries({ queryKey: ["files", "list"] })
      } catch (e) {
        setUploadError((e as Error).message)
        setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "error" } : item))
        break
      }
    }
    setTimeout(() => setUploadQueue(prev => prev.filter(item => item.status !== "done")), 1500)
  }

  async function uploadFilesWithPaths(files: File[]) {
    setUploadError(null)
    const root = activeRootRef.current
    const basePath = currentPathRef.current
    const queue = files.map(f => ({ name: (f as any)._relativePath || f.name, status: "pending" as const, pct: 0 }))
    setUploadQueue(queue)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relPath = (file as any)._relativePath || file.name
      // Compute the upload directory (everything except the filename)
      const parts = relPath.split("/")
      const fileName = parts.pop()!
      const subDir = parts.length > 0 ? (basePath ? `${basePath}/${parts.join("/")}` : parts.join("/")) : basePath

      setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "uploading", pct: 0 } : item))
      try {
        // Upload with the subdirectory path — backend will auto-create dirs
        await uploadOneFile(file, root, subDir, (pct) => {
          setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, pct } : item))
        })
        setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "done", pct: 100 } : item))
      } catch (e) {
        setUploadError((e as Error).message)
        setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: "error" } : item))
        break
      }
    }
    qc.invalidateQueries({ queryKey: ["files", "list"] })
    setTimeout(() => setUploadQueue(prev => prev.filter(item => item.status !== "done")), 1500)
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

  async function readEntryRecursive(entry: FileSystemEntry, basePath: string): Promise<File[]> {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file(f => {
          // Attach relative path so uploadFiles can place it correctly
          Object.defineProperty(f, '_relativePath', { value: basePath ? `${basePath}/${f.name}` : f.name })
          resolve([f])
        }, () => resolve([]))
      })
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve) => {
        const all: FileSystemEntry[] = []
        const readBatch = () => {
          reader.readEntries(batch => {
            if (batch.length === 0) { resolve(all); return }
            all.push(...batch)
            readBatch()
          }, () => resolve(all))
        }
        readBatch()
      })
      const subPath = basePath ? `${basePath}/${entry.name}` : entry.name
      const files: File[] = []
      for (const sub of entries) {
        files.push(...await readEntryRecursive(sub, subPath))
      }
      return files
    }
    return []
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    if (!activeRoot || !dirWritable) return

    // Collect all entries SYNCHRONOUSLY before any await — the
    // dataTransfer object is cleared by the browser after the
    // event handler yields.
    const entries: FileSystemEntry[] = []
    const items = e.dataTransfer.items
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) entries.push(entry)
      }
    }

    if (entries.length > 0) {
      const allFiles: File[] = []
      for (const entry of entries) {
        allFiles.push(...await readEntryRecursive(entry, ""))
      }
      if (allFiles.length > 0) {
        uploadFilesWithPaths(allFiles)
        return
      }
    }

    // Fallback for browsers without webkitGetAsEntry
    const files = e.dataTransfer.files
    if (files.length > 0) uploadFiles(files)
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
      {/* Drop overlay — receives drop events directly */}
      {dragging && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-bg/80 backdrop-blur-sm border-2 border-dashed border-accent-porter rounded-xl m-2"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            // Only dismiss if leaving the overlay entirely (not entering a child)
            if (e.currentTarget === e.target) {
              dragCounter.current = 0
              setDragging(false)
            }
          }}
          onDrop={handleDrop}
        >
          <div className="text-center pointer-events-none">
            <Upload className="size-10 text-accent-porter mx-auto mb-2" />
            <p className="text-sm font-medium text-text">Drop files to upload</p>
            <p className="text-xs text-text3 mt-1">/home/lobster/projects{currentPath ? `/${currentPath}` : ""}</p>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
        {/* Agents + actions */}
        <div className="flex items-center gap-3">
          {/* Assigned agents — from DB, link to template */}
          {projectAgents.map(a => {
            const spec = a.appearance_spec ? (typeof a.appearance_spec === 'string' ? JSON.parse(a.appearance_spec) : a.appearance_spec) : {}
            const palette = spec.palette ?? spec
            const isBorn = !!(a as any).soul_hash
            return (
              <Link
                key={a.id}
                to={a.template_id ? `/agents/${a.template_id}` : `/agents/${a.id}`}
                className="flex items-center gap-2 rounded-lg border border-border/40 bg-surface/50 px-2.5 py-1.5 hover:border-accent-porter/40 transition-colors"
              >
                <div className={isBorn ? "" : "grayscale opacity-60"}>
                  <PixelPortrait
                    skin={palette.skin || "#f1c27d"}
                    hair={palette.hair || "#2c1b18"}
                    eyes={palette.eyes || "#1a1a2e"}
                    shirt={palette.shirt || "#64748b"}
                    hairStyle={palette.hairStyle || "short"}
                    size="sm"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight text-text2">{a.name}</p>
                  <p className="text-2xs text-text3 leading-tight">{a.role}</p>
                </div>
              </Link>
            )
          })}

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

          {uploadError && (
            <span className="text-xs text-danger">{uploadError}</span>
          )}

          {/* New Folder button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setNewFolderName("")}
            disabled={!activeRoot || !dirWritable || newFolderName !== null}
            className="gap-1.5"
          >
            <FolderPlus className="size-3.5" />
            New Folder
          </Button>

          {/* Upload button */}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeRoot || !dirWritable || uploadQueue.length > 0}
            className="gap-1.5"
          >
            <Upload className="size-3.5" />
            Upload
          </Button>
        </div>

        {/* Breadcrumb */}
        {pathSegments.length > 0 && (
          <nav className="flex items-center gap-1 text-xs">
            <button
              onClick={() => navigateTo([])}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-text3 hover:bg-raised hover:text-text2 transition-colors"
            >
              <Home className="size-3" />
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
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* File list — hidden when preview is expanded */}
        {!previewExpanded && (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Column headers */}
            {activeRoot && !error && (
              <div className="shrink-0 grid grid-cols-[1fr_80px_120px_36px] gap-2 px-5 py-2 text-[10px] font-semibold tracking-[0.06em] text-text3 border-y border-border/50">
                <span className="font-mono">/home/lobster/projects{currentPath ? `/${currentPath}` : ""}</span>
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
            <div className="flex-1 overflow-y-auto min-h-0">
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

                {/* New folder inline input */}
                {newFolderName !== null && (
                  <div className={`flex items-center gap-3 px-3 ${compact ? "py-1" : "py-2"} bg-accent-porter/5 border-b border-border/30`}>
                    <FolderPlus className="size-4 text-accent-porter shrink-0" />
                    <form
                      className="flex items-center gap-2 flex-1"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const name = newFolderName.trim()
                        if (name) mkdirMut.mutate(name)
                      }}
                    >
                      <input
                        autoFocus
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder name..."
                        className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text3"
                        onKeyDown={(e) => { if (e.key === "Escape") setNewFolderName(null) }}
                      />
                      <button type="submit" disabled={!newFolderName.trim() || mkdirMut.isPending} className="flex items-center justify-center size-6 rounded text-success hover:bg-success/10 disabled:opacity-30">
                        <Check className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => setNewFolderName(null)} className="flex items-center justify-center size-6 rounded text-text3 hover:bg-raised">
                        <X className="size-3.5" />
                      </button>
                    </form>
                  </div>
                )}

                {/* Upload queue — inline progress rows */}
                {uploadQueue.map((item) => (
                  <div key={`upload-${item.name}`} className={`grid grid-cols-[1fr_80px_120px_36px] gap-2 items-center px-5 ${compact ? "py-1" : "py-2"} bg-accent-porter/5 border-b border-border/30`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Upload className="size-3.5 text-accent-porter shrink-0" />
                      <span className="text-sm text-foreground truncate">{item.name}</span>
                    </div>
                    <div />
                    <div className="flex items-center gap-2">
                      {item.status === "uploading" && (
                        <>
                          <div className="flex-1 h-2 bg-raised rounded-full overflow-hidden">
                            <div className="h-full bg-accent-porter rounded-full transition-all duration-200" style={{ width: `${item.pct}%` }} />
                          </div>
                          <span className="text-2xs text-accent-porter tabular-nums w-8 text-right">{item.pct}%</span>
                        </>
                      )}
                      {item.status === "pending" && <span className="text-2xs text-text3">Waiting...</span>}
                      {item.status === "done" && <Check className="size-3.5 text-success" />}
                      {item.status === "error" && <span className="text-2xs text-danger">Failed</span>}
                    </div>
                    <div />
                  </div>
                ))}

                {/* File entries */}
                {!isLoading && !error && entries.map((entry) => {
                  const isDir = entry.type === "dir"
                  const isActive = previewFile?.name === entry.name
                  const isRenaming = renaming === entry.name
                  const isDragTarget = isDir && dragOverFolder === entry.name

                  return (
                    <div
                      key={entry.name}
                      draggable={!isRenaming}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-porter-file", entry.name)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onDragOver={(e) => {
                        if (isDir && e.dataTransfer.types.includes("text/x-porter-file")) {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = "move"
                          setDragOverFolder(entry.name)
                        }
                      }}
                      onDragLeave={() => { if (isDragTarget) setDragOverFolder(null) }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDragOverFolder(null)
                        const fileName = e.dataTransfer.getData("text/x-porter-file")
                        if (isDir && fileName && fileName !== entry.name) {
                          const destPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
                          moveMut.mutate({ name: fileName, destPath })
                        }
                      }}
                      onClick={() => !isRenaming && (isDir ? navigateInto(entry.name) : openFile(entry.name))}
                      className={`grid grid-cols-[1fr_80px_120px_36px] gap-2 items-center px-5 text-left transition-colors duration-100 group cursor-pointer ${
                        compact ? "py-1" : "py-2"
                      } ${
                        isDragTarget
                          ? "bg-accent-porter/15 ring-1 ring-accent-porter/30"
                          : isActive
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
            </div>

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

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text2">This will permanently delete <span className="font-medium text-foreground">{confirmDelete}</span>. This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={deleteMut.isPending}
              onClick={() => { if (confirmDelete) deleteMut.mutate(confirmDelete) }}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {deleteMut.isPending ? <Loader2 className="size-3 animate-spin mr-1" /> : <Trash2 className="size-3 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
