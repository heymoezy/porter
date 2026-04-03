/**
 * SessionPressureChart — Context pressure over time for a chat session
 *
 * Shows context_pct vs turn number as a line chart.
 * Marks compression events as dots on the line.
 * Used in the dispatch detail expansion (bridge tab — routing view).
 *
 * Phase 38 Plan 03 — ACX-05
 */

import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot,
} from "recharts"
import { TrendingUp } from "lucide-react"

// ── Types ─────────────────────────────────────────────────

interface PressureTurn {
  turn: number
  context_pct: number | null
  compression_event: boolean
  dispatch_id: string
  created_at: number | null
}

interface SessionPressureData {
  session_id: string
  chat_id: string | null
  turns: PressureTurn[]
}

// ── Custom dot for compression events ────────────────────

function CompressionDot(props: any) {
  const { cx, cy, payload } = props
  if (!payload?.compression_event) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#22c55e"
      stroke="var(--color-surface, #222a38)"
      strokeWidth={2}
    />
  )
}

// ── Custom tooltip ────────────────────────────────────────

function PressureTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as PressureTurn
  const pct = d.context_pct != null ? Math.round(d.context_pct * 100) : null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-md text-2xs">
      <p className="font-semibold text-text">Turn {d.turn}</p>
      {pct != null && (
        <p className="text-text2">{pct}% context used</p>
      )}
      {d.compression_event && (
        <p className="text-success font-medium">Compression event</p>
      )}
    </div>
  )
}

// ── SessionPressureChart ───────────────────────────────────

export function SessionPressureChart({ chatId }: { chatId: string }) {
  const q = useQuery({
    queryKey: ["bridge", "session-pressure", chatId],
    queryFn: () => api<SessionPressureData>(`/api/admin/bridge/sessions/${chatId}/context-pressure`),
    staleTime: 60_000,
  })

  if (q.isLoading) {
    return (
      <div className="h-24 flex items-center justify-center">
        <div className="h-1 w-32 bg-muted animate-pulse rounded-full" />
      </div>
    )
  }

  if (q.isError || !q.data) {
    return null
  }

  const turns = q.data.turns.filter(t => t.context_pct != null)

  if (turns.length < 2) {
    return null
  }

  // Normalize context_pct to 0-100 for display
  const chartData = turns.map(t => ({
    ...t,
    pct: t.context_pct != null ? Math.round(t.context_pct * 100) : null,
  }))

  // Color for the line based on final context pressure
  const lastPct = chartData[chartData.length - 1]?.pct ?? 0
  const lineColor = lastPct >= 85 ? "#ef4444" : lastPct >= 70 ? "#f59e0b" : "#3b82f6"

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="size-3 text-accent-porter" />
        <span className="text-2xs font-semibold uppercase text-text3">Session Pressure</span>
        <span className="text-2xs text-text3 ml-1">chat: {chatId.slice(0, 8)}…</span>
        <span className="text-2xs text-text3">· {turns.length} turns</span>
        {turns.some(t => t.compression_event) && (
          <span className="text-2xs text-success ml-1">· compression events</span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="turn"
            tick={{ fontSize: 9, fill: "var(--color-text3, #6b7280)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: "var(--color-text3, #6b7280)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip content={<PressureTooltip />} />

          {/* Warning thresholds */}
          <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
          <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />

          <Line
            type="monotone"
            dataKey="pct"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={<CompressionDot />}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 text-2xs text-text3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 bg-warning inline-block" />
          70% mild
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 bg-danger inline-block" />
          85% aggressive
        </span>
        {turns.some(t => t.compression_event) && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />
            compression
          </span>
        )}
      </div>
    </div>
  )
}
