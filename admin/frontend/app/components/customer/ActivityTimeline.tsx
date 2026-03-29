import { useCustomerTimeline, type TimelineEvent } from "~/hooks/use-admin-api"
import { Card, CardContent } from "~/components/ui/card"
import {
  FileText,
  CheckSquare,
  LogIn,
  MessageSquare,
  Bot,
  Activity,
} from "lucide-react"

// ── Helpers ──────────────────────────────────────────────

function fmtRelTs(ts: number): string {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtDateLabel(ts: number): string {
  const d = new Date(ts * 1000)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

// ── Source config ─────────────────────────────────────────
const SOURCE_CONFIG: Record<TimelineEvent['source_type'], {
  icon: React.ElementType
  color: string
  bg: string
  dot: string
}> = {
  note:  { icon: FileText,      color: "text-accent-porter", bg: "bg-accent-porter/15", dot: "bg-accent-porter" },
  task:  { icon: CheckSquare,   color: "text-success",       bg: "bg-success/15",       dot: "bg-success" },
  login: { icon: LogIn,         color: "text-text3",         bg: "bg-border/30",        dot: "bg-text3/60" },
  chat:  { icon: MessageSquare, color: "text-chart-2",       bg: "bg-chart-2/15",       dot: "bg-chart-2" },
  agent: { icon: Bot,           color: "text-warning",       bg: "bg-warning/15",       dot: "bg-warning" },
}

// ── Main Component ────────────────────────────────────────
export function ActivityTimeline({ username }: { username: string }) {
  const { data, isLoading, isError } = useCustomerTimeline(username)
  const events: TimelineEvent[] = data?.events ?? []

  return (
    <Card className="ring-0 border border-border">
      <CardContent className="p-4 space-y-1">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Activity className="size-3.5 text-text3/50" />
          <p className="text-xs font-bold uppercase tracking-wider text-text3">Activity Timeline</p>
        </div>

        {/* Loading — 5 skeleton rows */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 size-6 rounded-full bg-border/20 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-border/20 rounded animate-pulse w-1/4" />
                  <div className="h-3 bg-border/20 rounded animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-2xs text-danger">
            Failed to load timeline
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && events.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 py-8 text-text3">
            <Activity className="size-5 opacity-30" />
            <p className="text-2xs">No activity yet</p>
          </div>
        )}

        {/* Event list with date separators */}
        {!isLoading && !isError && events.length > 0 && (() => {
          const rows: React.ReactNode[] = []
          let lastDateLabel = ""

          events.forEach((event, i) => {
            const dateLabel = fmtDateLabel(event.ts)
            const cfg = SOURCE_CONFIG[event.source_type] ?? SOURCE_CONFIG.login
            const Icon = cfg.icon

            // Date separator
            if (dateLabel !== lastDateLabel) {
              lastDateLabel = dateLabel
              rows.push(
                <div key={`sep-${i}`} className="flex items-center gap-2 py-1.5">
                  <div className="h-px flex-1 bg-border/30" />
                  <span className="text-2xs font-semibold text-text3/40 uppercase tracking-wider">{dateLabel}</span>
                  <div className="h-px flex-1 bg-border/30" />
                </div>
              )
            }

            // Event row
            rows.push(
              <div key={event.id} className="flex items-start gap-3 py-1.5 group">
                {/* Icon bubble */}
                <div className={`mt-0.5 flex size-6 items-center justify-center rounded-full ${cfg.bg} shrink-0`}>
                  <Icon className={`size-3 ${cfg.color}`} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className={`text-2xs font-semibold ${cfg.color}`}>{event.source_label}</span>
                    <span className="text-2xs text-text3/40 tabular-nums">{fmtRelTs(event.ts)}</span>
                  </div>
                  <p className="text-xs text-text leading-snug mt-0.5 break-words">{event.content}</p>
                </div>
              </div>
            )
          })

          return <>{rows}</>
        })()}
      </CardContent>
    </Card>
  )
}
