import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { HeartPulse } from "lucide-react"

// -- Types --

interface Score {
  username: string
  health: number
  conversion_score: number
  churn_risk: number
  viral_score: number
  ltv_predicted: number
  next_action: string
  computed_at: number
  email: string | null
  display_name: string | null
}

interface Stats {
  avg_health: number
  avg_churn: number
  avg_ltv: number
  total: number
}

// -- Helpers --

type SortField = "health" | "conversion_score" | "churn_risk" | "viral_score" | "ltv_predicted" | "computed_at"

function fmtDate(epoch: number) {
  if (!epoch) return "--"
  return new Date(epoch * 1000).toLocaleString()
}

function healthColor(v: number) {
  if (v >= 70) return "text-emerald-400"
  if (v >= 40) return "text-yellow-400"
  return "text-red-400"
}

function churnColor(v: number) {
  if (v <= 30) return "text-emerald-400"
  if (v <= 60) return "text-yellow-400"
  return "text-red-400"
}

// -- Component --

export default function CustomerScoresPage() {
  const [sortField, setSortField] = useState<SortField>("health")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin", "customer-scores", "stats"],
    queryFn: () => api<Stats>("/api/admin/customer-scores/stats"),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "customer-scores"],
    queryFn: () => api<{ scores: Score[] }>("/api/admin/customer-scores"),
  })

  const scores = data?.scores ?? []

  const sorted = [...scores].sort((a, b) => {
    const av = a[sortField] ?? 0
    const bv = b[sortField] ?? 0
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return ""
    return sortDir === "asc" ? " \u2191" : " \u2193"
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HeartPulse className="size-5 text-accent-porter" />
        <div>
          <h1 className="text-xl font-semibold text-text">Customer Scores</h1>
          <p className="text-sm text-text3 mt-0.5">Health, conversion, churn risk, and LTV</p>
        </div>
      </div>

      {/* Stats Row */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Avg Health</span>
            <p className={`text-2xl font-bold mt-1 ${healthColor(stats.avg_health)}`}>
              {stats.avg_health}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Avg Churn Risk</span>
            <p className={`text-2xl font-bold mt-1 ${churnColor(stats.avg_churn)}`}>
              {stats.avg_churn}%
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Avg LTV</span>
            <p className="text-2xl font-bold mt-1 text-text">
              ${stats.avg_ltv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <span className="text-xs text-text3 uppercase">Scored Users</span>
            <p className="text-2xl font-bold mt-1 text-text">{stats.total}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <HeartPulse className="size-8 text-text3/30 mb-2" />
          <p className="text-sm text-text3">No customer scores yet</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left font-medium text-text3 text-xs px-4 py-2.5">User</th>
                  <th
                    className="text-left font-medium text-text3 text-xs px-4 py-2.5 cursor-pointer select-none hover:text-text"
                    onClick={() => toggleSort("health")}
                  >
                    Health{sortIcon("health")}
                  </th>
                  <th
                    className="text-left font-medium text-text3 text-xs px-4 py-2.5 cursor-pointer select-none hover:text-text"
                    onClick={() => toggleSort("conversion_score")}
                  >
                    Conversion{sortIcon("conversion_score")}
                  </th>
                  <th
                    className="text-left font-medium text-text3 text-xs px-4 py-2.5 cursor-pointer select-none hover:text-text"
                    onClick={() => toggleSort("churn_risk")}
                  >
                    Churn Risk{sortIcon("churn_risk")}
                  </th>
                  <th
                    className="text-left font-medium text-text3 text-xs px-4 py-2.5 cursor-pointer select-none hover:text-text"
                    onClick={() => toggleSort("viral_score")}
                  >
                    Viral{sortIcon("viral_score")}
                  </th>
                  <th
                    className="text-left font-medium text-text3 text-xs px-4 py-2.5 cursor-pointer select-none hover:text-text"
                    onClick={() => toggleSort("ltv_predicted")}
                  >
                    LTV{sortIcon("ltv_predicted")}
                  </th>
                  <th
                    className="text-left font-medium text-text3 text-xs px-4 py-2.5 cursor-pointer select-none hover:text-text"
                    onClick={() => toggleSort("computed_at")}
                  >
                    Updated{sortIcon("computed_at")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.username} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link to={`/users/${s.username}`} className="text-accent-porter hover:underline text-xs font-medium">
                        {s.display_name || s.username}
                      </Link>
                      {s.email && (
                        <span className="block text-2xs text-text3">{s.email}</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 font-bold tabular-nums ${healthColor(s.health)}`}>
                      {s.health}
                    </td>
                    <td className="px-4 py-2.5 text-text2 tabular-nums">{s.conversion_score}</td>
                    <td className={`px-4 py-2.5 font-bold tabular-nums ${churnColor(s.churn_risk)}`}>
                      {s.churn_risk}%
                    </td>
                    <td className="px-4 py-2.5 text-text2 tabular-nums">{s.viral_score}</td>
                    <td className="px-4 py-2.5 text-text2 tabular-nums">
                      ${s.ltv_predicted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-text3 text-xs tabular-nums whitespace-nowrap">
                      {fmtDate(s.computed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
