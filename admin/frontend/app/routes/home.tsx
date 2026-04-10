import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Link } from "react-router"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import { VerdictBar } from "~/components/dashboard/verdict-bar"
import { ApprovalsPanel } from "~/components/dashboard/approvals-panel"
import { ActiveWorkPanel } from "~/components/dashboard/active-work-panel"
import { DispatchFeed } from "~/components/dashboard/dispatch-feed"
import { OpsPanel } from "~/components/dashboard/ops-panels"
import { IntelPanel } from "~/components/dashboard/intel-panel"
import { FolderKanban } from "lucide-react"

/* ── Types ── */

interface Project {
  id: string
  name: string
  status: string
  updated_at?: number
}

/* ── Helpers ── */

function relativeTime(ts: number): string {
  const secs = Math.floor(Date.now() / 1000 - ts)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  paused: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-blue-500/15 text-blue-400",
  archived: "bg-[var(--text3,#8a95a8)]/15 text-[var(--text3,#8a95a8)]",
}

/* ── Projects Compact ── */

function ProjectsCompact() {
  const { data } = useQuery({
    queryKey: ["v1", "projects"],
    queryFn: () => api<Project[]>("/api/v1/projects").catch(() => []),
    refetchInterval: 60_000,
  })

  const projects = (Array.isArray(data) ? data : []).slice(0, 6)

  return (
    <Card className="bg-[var(--surface,#222a38)] border-[var(--border,#3d4758)]">
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground,#f6f8fb)]">
          <FolderKanban className="size-3.5" />
          Projects
          {projects.length > 0 && (
            <Badge className="bg-[var(--accent-porter,#6366f1)]/15 text-[var(--accent-porter,#6366f1)] text-2xs px-1.5 py-0">
              {projects.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-[var(--text3,#8a95a8)]">
            <FolderKanban className="size-5 mb-1 opacity-30" />
            <span className="text-xs">No projects</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {projects.map((p) => (
              <Link
                key={p.id}
                to="/files"
                className="flex items-center gap-2 rounded-md py-1.5 px-2 hover:bg-[var(--raised,#2b3444)]/50 transition-colors"
              >
                <span className="text-2xs font-semibold text-[var(--foreground,#f6f8fb)] truncate flex-1 min-w-0">
                  {p.name}
                </span>
                <Badge className={`text-2xs px-1.5 py-0 ${STATUS_BADGE[p.status] ?? STATUS_BADGE.active}`}>
                  {p.status}
                </Badge>
                {p.updated_at && (
                  <span className="text-2xs text-[var(--text3,#8a95a8)] shrink-0">{relativeTime(p.updated_at)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Dashboard Page ── */

export default function DashboardPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <VerdictBar />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ApprovalsPanel />
        <ActiveWorkPanel />
        <DispatchFeed />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <IntelPanel />
        <OpsPanel />
        <ProjectsCompact />
      </div>
    </div>
  )
}
