import { useState } from "react"
import { AgentPresenceSummary } from "~/components/agent-presence"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { FileTypeIcon } from "~/components/file-type-icon"
import {
  FolderOpen, ChevronRight, Home, Upload, HardDrive, AlertTriangle,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────

function fmtDate(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function fmtRel(ts: number) {
  const s = Date.now() / 1000 - ts
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── Component ────────────────────────────────────────────

export default function FilesPage() {
  const [root, setRoot] = useState("documents")
  const [pathSegments, setPathSegments] = useState<string[]>([])

  const currentPath = pathSegments.join("/")

  // Fetch roots (for potential root switcher)
  const { data: rootsData } = useQuery({
    queryKey: ["files", "roots"],
    queryFn: () => api<RootsResponse>("/api/v1/files"),
  })

  // Fetch directory listing
  const { data, isLoading, error } = useQuery({
    queryKey: ["files", "list", root, currentPath],
    queryFn: () => {
      const params = new URLSearchParams({ root })
      if (currentPath) params.set("path", currentPath)
      return api<FilesResponse>(`/api/v1/files?${params}`)
    },
  })

  function navigateToDir(name: string) {
    setPathSegments(prev => [...prev, name])
  }

  function navigateToBreadcrumb(index: number) {
    // index -1 = root
    if (index < 0) {
      setPathSegments([])
    } else {
      setPathSegments(prev => prev.slice(0, index + 1))
    }
  }

  const entries = data?.entries ?? []
  const roots = rootsData?.roots ?? []

  return (
      <div className="space-y-3 p-4">
        <AgentPresenceSummary surface="files" />
        {/* Header */}
        <div className="flex items-center gap-3">
          <HardDrive className="size-4 text-accent-porter" />
          <h1 className="text-sm font-bold text-text">Files</h1>

          {/* Root selector */}
          {roots.length > 1 && (
            <div className="ml-2 flex gap-1">
              {roots.map(r => (
                <button
                  key={r}
                  onClick={() => { setRoot(r); setPathSegments([]) }}
                  className={`rounded-md px-2 py-1 text-2xs font-medium transition-colors ${
                    root === r ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
                  }`}
                >{r}</button>
              ))}
            </div>
          )}

          <div className="flex-1" />

          <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-50">
            <Upload className="size-3" />
            Upload
          </Button>
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs">
          <button
            onClick={() => navigateToBreadcrumb(-1)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-text3 hover:bg-raised hover:text-text2 transition-colors"
          >
            <Home className="size-3" />
            <span>{root}</span>
          </button>
          {pathSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-2.5 text-text3/50" />
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  i === pathSegments.length - 1
                    ? "font-medium text-text"
                    : "text-text3 hover:bg-raised hover:text-text2"
                }`}
              >{seg}</button>
            </span>
          ))}
        </nav>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 size-5 text-warning" />
            <p className="text-xs font-medium text-text2">File system not connected</p>
            <p className="mt-1 text-2xs text-text3">Porter Brain may be offline or the file API is unavailable.</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && !error && (
          <div className="flex items-center justify-center py-12">
            <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-surface text-left">
                  <th className="w-10 px-3 py-1.5" />
                  <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Name</th>
                  <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right w-24">Size</th>
                  <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right w-40">Modified</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-text3">
                      {currentPath ? "Empty directory" : "No files found"}
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr
                    key={entry.name}
                    className={`border-b border-border/20 last:border-0 transition-colors ${
                      entry.type === "dir" ? "cursor-pointer hover:bg-accent-porter/5" : "hover:bg-surface/60"
                    }`}
                    onClick={entry.type === "dir" ? () => navigateToDir(entry.name) : undefined}
                  >
                    <td className="px-3 py-1.5">
                      {entry.type === "dir" ? (
                        <div className="flex size-8 items-center justify-center rounded-lg bg-accent-porter/10">
                          <FolderOpen className="size-4 text-accent-porter" />
                        </div>
                      ) : (
                        <FileTypeIcon filename={entry.name} size="sm" />
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs ${entry.type === "dir" ? "font-bold text-text" : "text-text2"}`}>
                        {entry.name}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="text-2xs text-text3">{entry.type === "file" ? entry.size : "--"}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="text-2xs text-text3" title={fmtDate(entry.mtime)}>
                        {fmtRel(entry.mtime)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer stats */}
        {!isLoading && !error && entries.length > 0 && (
          <div className="flex items-center gap-3 text-2xs text-text3">
            <span>{entries.filter(e => e.type === "dir").length} folders</span>
            <span className="text-border">|</span>
            <span>{entries.filter(e => e.type === "file").length} files</span>
          </div>
        )}
      </div>
  )
}
