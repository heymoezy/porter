import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { api } from "~/lib/api"

// --- Types ---

interface RoutingDecision {
  id: string
  session_id: string
  chat_id: string | null
  message_sequence: number
  gateway_type: string
  model_name: string
  dispatch_log_id: string | null
  created_at: string
  gateway_name: string | null
}

interface FeedbackEntry {
  id: string
  gateway_id: string
  model_name: string
  outcome_score: number
  latency_ms: number | null
  created_at: number
  source_agent: string | null
  intent: string | null
}

interface ConfidenceEntry {
  gateway_id: string
  gateway_name: string | null
  avg_score: number
  total_scored: number
  recent_avg: number | null
}

// --- Helpers ---

function fmtDate(d: string | number | null): string {
  if (!d) return "-"
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d)
  if (isNaN(date.getTime())) return String(d)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtMs(ms: number | null | undefined): string {
  if (!ms) return "-"
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function ScoreDisplay({ score }: { score: number }) {
  const color = score >= 4 ? "text-green-400" : score >= 3 ? "text-yellow-400" : "text-red-400"
  return (
    <span className={`font-mono font-medium ${color}`}>
      {score.toFixed(1)}
      <span className="text-text3 text-2xs ml-0.5">/5</span>
    </span>
  )
}

function TrendIndicator({ current, recent }: { current: number; recent: number | null }) {
  if (recent === null || recent === undefined) return <span className="text-text3 text-xs">-</span>
  const diff = recent - current
  if (Math.abs(diff) < 0.1) return <span className="text-text3 text-xs">Stable</span>
  if (diff > 0) return <span className="text-green-400 text-xs">+{diff.toFixed(1)} (7d)</span>
  return <span className="text-red-400 text-xs">{diff.toFixed(1)} (7d)</span>
}

// --- Tabs ---

const TABS = ["Decisions", "Feedback", "Confidence"] as const
type Tab = (typeof TABS)[number]

// --- Tab Content ---

function DecisionsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "routing", "decisions"],
    queryFn: () => api<{ decisions: RoutingDecision[]; total: number }>("/api/admin/routing"),
  })

  const decisions = data?.decisions ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (!decisions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text3">
        <svg className="size-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <span className="text-sm">No routing decisions recorded</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50 text-left bg-surface">
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Time</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Session</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Gateway</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Model</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Seq #</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.id} className="border-b border-border/30 last:border-0 hover:bg-surface/50">
              <td className="px-3 py-1.5 text-xs text-text2 whitespace-nowrap">{fmtDate(d.created_at)}</td>
              <td className="px-3 py-1.5 text-xs text-text3 font-mono truncate max-w-[120px]">
                {d.session_id?.slice(0, 8) ?? "-"}
              </td>
              <td className="px-3 py-1.5 text-xs">
                <Link to="/bridge" className="text-accent-porter hover:underline">
                  {d.gateway_name ?? d.gateway_type}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-xs font-medium text-text">{d.model_name}</td>
              <td className="px-3 py-1.5 text-xs text-text2 text-right">{d.message_sequence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FeedbackTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "routing", "feedback"],
    queryFn: () => api<{ feedback: FeedbackEntry[]; total: number }>("/api/admin/routing/feedback"),
  })

  const feedback = data?.feedback ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (!feedback.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text3">
        <svg className="size-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
        <span className="text-sm">No dispatch feedback recorded</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50 text-left bg-surface">
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Time</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Model</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Score</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Latency</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Agent</th>
            <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Intent</th>
          </tr>
        </thead>
        <tbody>
          {feedback.map((f) => (
            <tr key={f.id} className="border-b border-border/30 last:border-0 hover:bg-surface/50">
              <td className="px-3 py-1.5 text-xs text-text2 whitespace-nowrap">{fmtDate(f.created_at)}</td>
              <td className="px-3 py-1.5 text-xs font-medium text-text">{f.model_name}</td>
              <td className="px-3 py-1.5 text-xs"><ScoreDisplay score={f.outcome_score} /></td>
              <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtMs(f.latency_ms)}</td>
              <td className="px-3 py-1.5 text-xs text-text3">{f.source_agent ?? "-"}</td>
              <td className="px-3 py-1.5 text-xs text-text3 truncate max-w-[150px]">{f.intent ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConfidenceTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "routing", "confidence"],
    queryFn: () => api<{ confidence: ConfidenceEntry[] }>("/api/admin/routing/confidence"),
  })

  const confidence = data?.confidence ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (!confidence.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text3">
        <svg className="size-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <span className="text-sm">No confidence data available</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {confidence.map((c) => {
        const scoreColor = c.avg_score >= 4 ? "text-green-400" : c.avg_score >= 3 ? "text-yellow-400" : "text-red-400"
        return (
          <div key={c.gateway_id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Link to="/bridge" className="text-sm font-semibold text-accent-porter hover:underline">
                {c.gateway_name ?? c.gateway_id}
              </Link>
              <span className={`text-lg font-bold font-mono ${scoreColor}`}>
                {c.avg_score.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-text3">
              <span>{c.total_scored} scored dispatches</span>
              <TrendIndicator current={c.avg_score} recent={c.recent_avg} />
            </div>
            {/* Score bar */}
            <div className="h-2 bg-raised rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  c.avg_score >= 4 ? "bg-green-500" : c.avg_score >= 3 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${(c.avg_score / 5) * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Main Page ---

export default function RoutingPage() {
  const [tab, setTab] = useState<Tab>("Decisions")

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-text">Routing History</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
              tab === t
                ? "bg-surface border border-border border-b-transparent text-text -mb-px"
                : "text-text3 hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Decisions" && <DecisionsTab />}
      {tab === "Feedback" && <FeedbackTab />}
      {tab === "Confidence" && <ConfidenceTab />}
    </div>
  )
}
