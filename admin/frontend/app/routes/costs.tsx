import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"

// --- Types ---

interface CostTotals {
  total_cost: number
  total_dispatches: number
  total_input: number
  total_output: number
  total_cached: number
}

interface GatewayRow {
  gateway_id: string
  gateway_name: string
  dispatches: number
  total_cost: number
  total_input: number
  total_output: number
  avg_latency: number
}

interface ModelRow {
  model_name: string
  dispatches: number
  total_cost: number
  total_input: number
  total_output: number
  avg_latency: number
}

interface DailyRow {
  day: string
  dispatches: number
  cost: number
  input_tokens: number
  output_tokens: number
}

interface TokenDailyRow {
  date: string
  model: string
  input_tokens: number
  output_tokens: number
  request_count: number
}

interface CostSummary {
  totals: CostTotals
  byGateway: GatewayRow[]
  byModel: ModelRow[]
  dailyCosts: DailyRow[]
  tokenDaily: TokenDailyRow[]
}

interface Dispatch {
  id: string
  gateway_id: string
  model_name: string
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  estimated_cost_usd: number
  latency_ms: number
  intent: string
  outcome_score: number
  created_at: number
  source_agent: string
  target_agent: string
  project_id: string
  chat_id: string
  username: string
}

interface AgentRow {
  agent_id: string
  source_agent: string
  dispatches: number
  total_cost: number
  total_input: number
  total_output: number
  avg_latency: number
}

interface ProjectRow {
  project_id: string
  project_name: string
  dispatches: number
  total_cost: number
  total_input: number
  total_output: number
  avg_latency: number
}

// --- Formatting helpers ---

function fmtCost(n: number | null | undefined): string {
  if (!n) return "$0.0000"
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(4)}`
}

function fmtTokens(n: number | null | undefined): string {
  if (!n) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString("en-US", {
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

// --- Tabs ---

const TABS = [
  "Overview",
  "By Gateway",
  "By Model",
  "By Agent",
  "By Project",
  "Recent Dispatches",
] as const
type Tab = (typeof TABS)[number]

// --- Components ---

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-2xs text-text3 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-text mt-1">{value}</div>
      {sub && <div className="text-2xs text-text3 mt-0.5">{sub}</div>}
    </div>
  )
}

function DailyCostChart({ data }: { data: DailyRow[] }) {
  if (!data.length) return <div className="text-xs text-text3 p-4">No daily data</div>

  const maxCost = Math.max(...data.map((d) => d.cost), 0.001)

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">
          Daily Cost (30d)
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-end gap-px h-32">
          {data.map((d) => {
            const pct = (d.cost / maxCost) * 100
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div
                  className="w-full bg-accent-porter rounded-t opacity-80 hover:opacity-100 transition-opacity min-h-[2px]"
                  style={{ height: `${Math.max(pct, 1)}%` }}
                />
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-raised border border-border rounded px-2 py-1 text-2xs text-text whitespace-nowrap z-10">
                  {d.day}: {fmtCost(d.cost)} / {d.dispatches} calls
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-2xs text-text3">{data[0]?.day}</span>
          <span className="text-2xs text-text3">{data[data.length - 1]?.day}</span>
        </div>
      </div>
    </div>
  )
}

function BreakdownTable({
  title,
  columns,
  rows,
}: {
  title: string
  columns: { key: string; label: string; align?: "right" | "left"; format?: (v: unknown) => string }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
}) {
  if (!rows.length) return <div className="text-xs text-text3 p-4">No data</div>

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-3 py-2 bg-surface border-b border-border">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">{title}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/50 text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 ${
                  c.align === "right" ? "text-right" : ""
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/30 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 text-xs ${
                    c.align === "right" ? "text-right text-text2" : "text-text font-medium"
                  }`}
                >
                  {c.format ? c.format(row[c.key]) : String(row[c.key] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Tab Content ---

function OverviewTab({ data }: { data: CostSummary }) {
  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Total Cost" value={fmtCost(data.totals.total_cost)} />
        <MetricCard label="Total Dispatches" value={data.totals.total_dispatches.toLocaleString()} />
        <MetricCard
          label="Input Tokens"
          value={fmtTokens(data.totals.total_input)}
          sub={`${fmtTokens(data.totals.total_cached)} cached`}
        />
        <MetricCard label="Output Tokens" value={fmtTokens(data.totals.total_output)} />
      </div>

      {/* Daily chart */}
      <DailyCostChart data={data.dailyCosts} />

      {/* Gateway summary */}
      <BreakdownTable
        title="Cost by Gateway"
        columns={[
          { key: "gateway_name", label: "Gateway" },
          { key: "dispatches", label: "Dispatches", align: "right", format: (v) => Number(v).toLocaleString() },
          { key: "total_cost", label: "Cost", align: "right", format: (v) => fmtCost(v as number) },
          { key: "avg_latency", label: "Avg Latency", align: "right", format: (v) => fmtMs(v as number) },
        ]}
        rows={data.byGateway}
      />

      {/* Model summary */}
      <BreakdownTable
        title="Cost by Model"
        columns={[
          { key: "model_name", label: "Model" },
          { key: "dispatches", label: "Dispatches", align: "right", format: (v) => Number(v).toLocaleString() },
          { key: "total_cost", label: "Cost", align: "right", format: (v) => fmtCost(v as number) },
          { key: "total_input", label: "Input", align: "right", format: (v) => fmtTokens(v as number) },
          { key: "total_output", label: "Output", align: "right", format: (v) => fmtTokens(v as number) },
        ]}
        rows={data.byModel}
      />
    </div>
  )
}

function GatewayTab({ data }: { data: GatewayRow[] }) {
  return (
    <BreakdownTable
      title="Cost by Gateway"
      columns={[
        { key: "gateway_name", label: "Gateway" },
        { key: "gateway_id", label: "ID" },
        { key: "dispatches", label: "Dispatches", align: "right", format: (v) => Number(v).toLocaleString() },
        { key: "total_cost", label: "Total Cost", align: "right", format: (v) => fmtCost(v as number) },
        { key: "total_input", label: "Input Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "total_output", label: "Output Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "avg_latency", label: "Avg Latency", align: "right", format: (v) => fmtMs(v as number) },
      ]}
      rows={data}
    />
  )
}

function ModelTab({ data }: { data: ModelRow[] }) {
  return (
    <BreakdownTable
      title="Cost by Model"
      columns={[
        { key: "model_name", label: "Model" },
        { key: "dispatches", label: "Dispatches", align: "right", format: (v) => Number(v).toLocaleString() },
        { key: "total_cost", label: "Total Cost", align: "right", format: (v) => fmtCost(v as number) },
        { key: "total_input", label: "Input Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "total_output", label: "Output Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "avg_latency", label: "Avg Latency", align: "right", format: (v) => fmtMs(v as number) },
      ]}
      rows={data}
    />
  )
}

function AgentTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "costs", "by-agent"],
    queryFn: () => api<{ byAgent: AgentRow[] }>("/api/admin/costs/by-agent"),
  })

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )

  return (
    <BreakdownTable
      title="Cost by Agent"
      columns={[
        { key: "agent_id", label: "Agent" },
        { key: "dispatches", label: "Dispatches", align: "right", format: (v) => Number(v).toLocaleString() },
        { key: "total_cost", label: "Total Cost", align: "right", format: (v) => fmtCost(v as number) },
        { key: "total_input", label: "Input Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "total_output", label: "Output Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "avg_latency", label: "Avg Latency", align: "right", format: (v) => fmtMs(v as number) },
      ]}
      rows={data?.byAgent ?? []}
    />
  )
}

function ProjectTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "costs", "by-project"],
    queryFn: () => api<{ byProject: ProjectRow[] }>("/api/admin/costs/by-project"),
  })

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )

  return (
    <BreakdownTable
      title="Cost by Project"
      columns={[
        { key: "project_name", label: "Project" },
        { key: "dispatches", label: "Dispatches", align: "right", format: (v) => Number(v).toLocaleString() },
        { key: "total_cost", label: "Total Cost", align: "right", format: (v) => fmtCost(v as number) },
        { key: "total_input", label: "Input Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "total_output", label: "Output Tokens", align: "right", format: (v) => fmtTokens(v as number) },
        { key: "avg_latency", label: "Avg Latency", align: "right", format: (v) => fmtMs(v as number) },
      ]}
      rows={data?.byProject ?? []}
    />
  )
}

function DispatchesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "costs", "dispatches"],
    queryFn: () => api<{ dispatches: Dispatch[] }>("/api/admin/costs/dispatches"),
  })

  const [sortKey, setSortKey] = useState<"cost" | "time" | "tokens" | "latency">("time")

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )

  const dispatches = [...(data?.dispatches ?? [])]

  switch (sortKey) {
    case "cost":
      dispatches.sort((a, b) => (b.estimated_cost_usd ?? 0) - (a.estimated_cost_usd ?? 0))
      break
    case "tokens":
      dispatches.sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens))
      break
    case "latency":
      dispatches.sort((a, b) => (b.latency_ms ?? 0) - (a.latency_ms ?? 0))
      break
    default:
      dispatches.sort((a, b) => b.created_at - a.created_at)
  }

  return (
    <div className="space-y-2">
      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-text3 uppercase">Sort by:</span>
        {(["time", "cost", "tokens", "latency"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`text-2xs px-2 py-0.5 rounded ${
              sortKey === k ? "bg-accent-porter text-white" : "bg-raised text-text3 hover:text-text"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 text-left bg-surface">
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Time</th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Model</th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Gateway</th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">
                Cost
              </th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">
                In / Out
              </th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">
                Latency
              </th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Intent</th>
              <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">User</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((d) => (
              <tr key={d.id} className="border-b border-border/30 last:border-0 hover:bg-surface/50">
                <td className="px-3 py-1.5 text-xs text-text2 whitespace-nowrap">{fmtDate(d.created_at)}</td>
                <td className="px-3 py-1.5 text-xs font-medium text-text">{d.model_name}</td>
                <td className="px-3 py-1.5 text-xs text-text2">{d.gateway_id}</td>
                <td className="px-3 py-1.5 text-xs text-text2 text-right font-mono">
                  {fmtCost(d.estimated_cost_usd)}
                </td>
                <td className="px-3 py-1.5 text-xs text-text2 text-right">
                  {fmtTokens(d.input_tokens)} / {fmtTokens(d.output_tokens)}
                </td>
                <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtMs(d.latency_ms)}</td>
                <td className="px-3 py-1.5 text-xs text-text3 truncate max-w-[120px]">{d.intent || "-"}</td>
                <td className="px-3 py-1.5 text-xs text-text3">{d.username || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!dispatches.length && (
          <div className="px-3 py-8 text-center text-xs text-text3">No dispatches found</div>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---

export default function CostsPage() {
  const [tab, setTab] = useState<Tab>("Overview")

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "costs"],
    queryFn: () => api<CostSummary>("/api/admin/costs"),
  })

  const summary = data ?? {
    totals: { total_cost: 0, total_dispatches: 0, total_input: 0, total_output: 0, total_cached: 0 },
    byGateway: [],
    byModel: [],
    dailyCosts: [],
    tokenDaily: [],
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold text-text">Cost Analytics</h1>

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

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Tab content */}
      {!isLoading && (
        <>
          {tab === "Overview" && <OverviewTab data={summary} />}
          {tab === "By Gateway" && <GatewayTab data={summary.byGateway} />}
          {tab === "By Model" && <ModelTab data={summary.byModel} />}
          {tab === "By Agent" && <AgentTab />}
          {tab === "By Project" && <ProjectTab />}
          {tab === "Recent Dispatches" && <DispatchesTab />}
        </>
      )}
    </div>
  )
}
