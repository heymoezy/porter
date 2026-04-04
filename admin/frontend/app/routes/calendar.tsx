import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { api } from "~/lib/api"

interface CalendarEvent {
  id: number
  user_id: number
  google_event_id: string | null
  title: string
  start_at: string
  end_at: string | null
  all_day: boolean
  created_at: string
  username: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return "-"
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtTime(d: string | null): string {
  if (!d) return "-"
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function CalendarPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "calendar"],
    queryFn: () => api<{ events: CalendarEvent[]; total: number }>("/api/admin/calendar"),
  })

  const events = data?.events ?? []

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-text">Calendar Events</h1>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-text3">
          <svg className="size-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          <span className="text-sm">No calendar events synced</span>
        </div>
      )}

      {!isLoading && events.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left bg-surface">
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Date</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Title</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Start</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">End</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">All Day</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">User</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-border/30 last:border-0 hover:bg-surface/50">
                  <td className="px-3 py-1.5 text-xs text-text2 whitespace-nowrap">{fmtDate(ev.start_at)}</td>
                  <td className="px-3 py-1.5 text-xs font-medium text-text">{ev.title}</td>
                  <td className="px-3 py-1.5 text-xs text-text2">{fmtTime(ev.start_at)}</td>
                  <td className="px-3 py-1.5 text-xs text-text2">{fmtTime(ev.end_at)}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {ev.all_day ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-accent-porter/10 text-accent-porter">
                        All Day
                      </span>
                    ) : (
                      <span className="text-text3">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {ev.username ? (
                      <Link to={`/users/${ev.username}`} className="text-accent-porter hover:underline">
                        {ev.username}
                      </Link>
                    ) : (
                      <span className="text-text3">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
