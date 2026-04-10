import { Link } from "react-router"
import { Plus, FolderKanban } from "lucide-react"
import { AppShell } from "~/components/layout/app-shell"
import { useProjects } from "~/hooks/use-api"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"

/* ── Helpers ── */

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-success/15 text-success",
  paused:    "bg-warning/15 text-warning",
  completed: "bg-accent-porter/15 text-accent-porter",
  archived:  "bg-text3/15 text-text3",
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/* ── Skeleton Card ── */

function ProjectSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 rounded bg-raised" />
          <div className="h-5 w-14 rounded-full bg-raised" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-raised" />
          <div className="h-3 w-2/3 rounded bg-raised" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-4 w-16 rounded-full bg-raised" />
          <div className="h-3 w-12 rounded bg-raised" />
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Empty State ── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-text3">
      <FolderKanban className="h-10 w-10 mb-3 opacity-40" />
      <p className="text-sm font-medium">No projects yet</p>
      <p className="text-xs mt-1">Create your first project to get started.</p>
    </div>
  )
}

/* ── Page ── */

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects()

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ProjectSkeleton />
            <ProjectSkeleton />
            <ProjectSkeleton />
          </div>
        )}

        {/* Empty */}
        {!isLoading && (!projects || projects.length === 0) && <EmptyState />}

        {/* Grid */}
        {!isLoading && projects && projects.length > 0 && (
          <div className="animated-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p: any) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block group">
                <Card className="transition-all duration-150 hover:ring-accent-porter/30 hover:ring-1 hover:-translate-y-px cursor-pointer h-full">
                  <CardContent className="space-y-2.5">
                    {/* Title + status */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate flex-1 min-w-0 group-hover:text-accent-porter transition-colors">
                        {p.name}
                      </h3>
                      <Badge className={`text-[10px] shrink-0 ${STATUS_STYLES[p.status] ?? STATUS_STYLES.archived}`}>
                        {p.status}
                      </Badge>
                    </div>

                    {/* Description */}
                    {p.description && (
                      <p className="text-xs text-text3 line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    )}

                    {/* Footer: type + date */}
                    <div className="flex items-center justify-between pt-1">
                      {p.type && (
                        <Badge variant="outline" className="text-[10px] text-text3 border-border">
                          {p.type}
                        </Badge>
                      )}
                      <span className="text-[10px] text-text3 tabular-nums ml-auto">
                        {relativeDate(p.created_at)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
