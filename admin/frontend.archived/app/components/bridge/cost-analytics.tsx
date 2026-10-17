import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { MiniMetric } from "~/components/ui/mini-metric"
import { AreaChart } from "~/components/ui/area-chart"
import { XCircle, TrendingUp, Server, Cpu, Users, FolderOpen, Bot } from "lucide-react"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/table"

// ── Types ──────────────────────────────────────────────

interface CostTotals {
  total_cost_usd: number
  total_input_tokens: number
  total_output_tokens: number
  total_dispatches: number
}

interface GatewayCostRow {
  gateway_type: string
  total_cost_usd: number
  dispatch_count: number
}

interface ModelCostRow {
  model_name: string
  gateway_type: string
  total_cost_usd: number
  dispatch_count: number
  total_input_tokens: number
  total_output_tokens: number
}

interface DailyTrendRow {
  day_ts: number
  total_cost_usd: number
  dispatch_count: number
}

interface CostsData {
  totals: CostTotals
  by_gateway: GatewayCostRow[]
  by_model: ModelCostRow[]
  daily_trend: DailyTrendRow[]
}

interface AttributionRow {
  group_key: string | null
  total_cost_usd: number
  dispatch_count: number
  total_input_tokens: number
  total_output_tokens: number
}

interface AttributionData {
  group_by: string
  rows: AttributionRow[]
}

// ── Helpers ─────────────────────────────────────────────

function fmtCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(6)}`
  return `$${n.toFixed(4)}`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtDate(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function toEpochSec(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

// ── ShareBar ─────────────────────────────────────────────

function ShareBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-border/50 overflow-hidden">
        <div className="h-full rounded-full bg-warning transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-2xs text-text3 tabular-nums w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────

export function CostAnalytics() {
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [groupBy, setGroupBy] = useState<"agent" | "project" | "user">("agent")

  const costsQuery = useQuery({
    queryKey: ["bridge", "costs", fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams()
      if (fromDate) params.set("from_ts", String(toEpochSec(fromDate)))
      if (toDate) params.set("to_ts", String(toEpochSec(toDate)))
      return api<CostsData>(`/api/admin/bridge/costs?${params}`)
    },
    staleTime: 30_000,
  })

  const attrQuery = useQuery({
    queryKey: ["bridge", "attribution", groupBy, fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams({ group_by: groupBy })
      if (fromDate) params.set("from_ts", String(toEpochSec(fromDate)))
      if (toDate) params.set("to_ts", String(toEpochSec(toDate)))
      return api<AttributionData>(`/api/admin/bridge/attribution?${params}`)
    },
    staleTime: 30_000,
  })

  // Loading state
  if (costsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 flex-wrap py-4">
        <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
        <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
        <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  // Error state
  if (costsQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <XCircle className="size-5 text-danger shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Failed to load cost analytics</p>
            <p className="text-xs text-text3 mt-0.5">
              {costsQuery.error instanceof Error ? costsQuery.error.message : "An unexpected error occurred"}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totals = costsQuery.data?.totals ?? {
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_dispatches: 0,
  }
  const byGateway = costsQuery.data?.by_gateway ?? []
  const byModel = costsQuery.data?.by_model ?? []
  const dailyTrend = costsQuery.data?.daily_trend ?? []
  const attrRows = attrQuery.data?.rows ?? []

  const totalGatewayCost = byGateway.reduce((s, r) => s + r.total_cost_usd, 0)
  const totalModelCost = byModel.reduce((s, r) => s + r.total_cost_usd, 0)
  const totalAttrCost = attrRows.reduce((s, r) => s + r.total_cost_usd, 0)

  return (
    <div className="space-y-4">

      {/* ── Date range bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="h-8 w-40"
          placeholder="From"
        />
        <span className="text-xs text-text3">to</span>
        <Input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="h-8 w-40"
          placeholder="To"
        />
        {(fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFromDate(""); setToDate("") }}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto text-2xs text-text3">{totals.total_dispatches} dispatches</span>
      </div>

      {/* ── Summary metrics row ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <MiniMetric label="Est. API-equiv cost" value={fmtCost(totals.total_cost_usd)} colorClass="text-warning" />
        <MiniMetric label="Dispatches" value={totals.total_dispatches} />
        <MiniMetric label="Tokens In" value={fmtTokens(totals.total_input_tokens)} colorClass="text-accent-porter" />
        <MiniMetric label="Tokens Out" value={fmtTokens(totals.total_output_tokens)} colorClass="text-accent-porter" />
      </div>

      {/* ── Daily trend chart ── */}
      {dailyTrend.length >= 2 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-border">
            <TrendingUp className="size-3 text-accent-porter" />
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Daily Spend</span>
          </div>
          <div className="px-3 pt-2 pb-1">
            <AreaChart
              values={dailyTrend.map(r => Number(r.total_cost_usd))}
              color="var(--warning)"
              height={80}
            />
            <div className="flex justify-between mt-1">
              <span className="text-2xs text-text3">{fmtDate(dailyTrend[0].day_ts)}</span>
              <span className="text-2xs text-text3">{fmtDate(dailyTrend[dailyTrend.length - 1].day_ts)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column breakdown grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* By Gateway */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-border">
            <Server className="size-3 text-accent-porter" />
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Cost by Gateway</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead className="text-right">Dispatches</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byGateway.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-xs text-text3">No gateway cost data</TableCell>
                </TableRow>
              ) : (
                byGateway.map((row, idx) => {
                  const pct = totalGatewayCost > 0 ? (row.total_cost_usd / totalGatewayCost * 100) : 0
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <span className="text-xs font-medium text-text">{row.gateway_type}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs tabular-nums text-text2">{row.dispatch_count}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs tabular-nums text-warning">{fmtCost(row.total_cost_usd)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <ShareBar pct={pct} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* By Model */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-border">
            <Cpu className="size-3 text-accent-porter" />
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Cost by Model</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead className="text-right">Dispatches</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byModel.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-xs text-text3">No model cost data</TableCell>
                </TableRow>
              ) : (
                byModel.map((row, idx) => {
                  const pct = totalModelCost > 0 ? (row.total_cost_usd / totalModelCost * 100) : 0
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <span className="text-xs font-medium text-text">{row.model_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-text2">{row.gateway_type}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs tabular-nums text-text2">{row.dispatch_count}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs tabular-nums text-warning">{fmtCost(row.total_cost_usd)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <ShareBar pct={pct} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Attribution section ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border flex-wrap">
          <div className="flex items-center gap-1.5">
            {groupBy === "agent" && <Bot className="size-3 text-accent-porter" />}
            {groupBy === "project" && <FolderOpen className="size-3 text-accent-porter" />}
            {groupBy === "user" && <Users className="size-3 text-accent-porter" />}
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Usage Attribution</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant={groupBy === "agent" ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupBy("agent")}
            >
              Agent
            </Button>
            <Button
              variant={groupBy === "project" ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupBy("project")}
            >
              Project
            </Button>
            <Button
              variant={groupBy === "user" ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupBy("user")}
            >
              User
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {groupBy === "agent" ? "Agent" : groupBy === "project" ? "Project" : "User"}
              </TableHead>
              <TableHead className="text-right">Dispatches</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Tokens In</TableHead>
              <TableHead className="text-right">Tokens Out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attrQuery.isLoading ? (
              <TableRow>
                {[48, 16, 20, 16, 16].map((w, i) => (
                  <TableCell key={i}>
                    <div className={`h-3 w-${w} rounded bg-muted animate-pulse`} />
                  </TableCell>
                ))}
              </TableRow>
            ) : attrRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-xs text-text3">
                  No attribution data — dispatch some requests first
                </TableCell>
              </TableRow>
            ) : (
              attrRows.map((row, idx) => {
                const pct = totalAttrCost > 0 ? (row.total_cost_usd / totalAttrCost * 100) : 0
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      {row.group_key ? (
                        <span className="text-xs font-medium text-text font-mono">{row.group_key}</span>
                      ) : (
                        <span className="text-xs text-text3 italic">unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums text-text2">{row.dispatch_count}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums text-warning">{fmtCost(row.total_cost_usd)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums text-text2">{fmtTokens(row.total_input_tokens)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums text-text2">{fmtTokens(row.total_output_tokens)}</span>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        {!attrQuery.isLoading && attrRows.length > 0 && (
          <div className="px-3 py-1.5 bg-surface border-t border-border flex items-center gap-2">
            <span className="text-2xs text-text3">
              {attrRows.length} {groupBy === "agent" ? "agents" : groupBy === "project" ? "projects" : "users"} shown
            </span>
          </div>
        )}
      </div>

    </div>
  )
}
