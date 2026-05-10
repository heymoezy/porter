import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Button } from "~/components/ui/button"

interface CliEntry {
  id: string
  gateway_type: string
  model_name: string | null
  tool_name: string | null
  intent: string | null
  chat_id: string | null
  username: string | null
  source_agent: string | null
  input_bytes: number | null
  output_bytes: number | null
  created_at: number | null
}

interface ToolStat {
  tool_name: string
  dispatch_count: number
  total_input_bytes: number
  total_output_bytes: number
}

interface CliData {
  entries: CliEntry[]
  by_tool_24h: ToolStat[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

function fmtBytes(n: number | null): string {
  if (n === null || n === 0) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}KB`
  return `${n}B`
}

function fmtTime(epoch: number | null): string {
  if (epoch === null) return "—"
  const d = Date.now() / 1000 - epoch
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

export function CliActivity() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery<CliData>({
    queryKey: ["bridge", "cli-activity", page],
    queryFn: () => api(`/api/admin/bridge/cli-activity?page=${page}&limit=50`),
    refetchInterval: 10_000,
  })

  if (isLoading) return <div className="text-sm text-text3">Loading…</div>
  if (!data) return <div className="text-sm text-text3">No CLI activity</div>

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-2xs uppercase tracking-wider text-text3">Tool usage — 24h</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {data.by_tool_24h.map(t => (
            <Card key={t.tool_name}>
              <CardContent className="p-3">
                <div className="font-mono text-xs text-text2">{t.tool_name}</div>
                <div className="mt-1 text-base font-semibold text-text">{t.dispatch_count.toLocaleString()}</div>
                <div className="text-2xs text-text3">in {fmtBytes(t.total_input_bytes)} · out {fmtBytes(t.total_output_bytes)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-surface text-left text-2xs uppercase tracking-wider text-text3">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2 text-right">Input</th>
                <th className="px-3 py-2 text-right">Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.entries.map(e => (
                <tr key={e.id} className="hover:bg-surface/50">
                  <td className="px-3 py-2 text-text3">{fmtTime(e.created_at)}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-2xs font-mono">{e.tool_name ?? e.intent ?? "—"}</Badge></td>
                  <td className="px-3 py-2 text-text2">{e.source_agent ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-text3">{e.chat_id ? e.chat_id.slice(0, 8) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text2">{fmtBytes(e.input_bytes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text2">{fmtBytes(e.output_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-text3">
        <span>{data.pagination.total.toLocaleString()} total</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <span className="self-center">page {page} / {data.pagination.pages || 1}</span>
          <Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  )
}
