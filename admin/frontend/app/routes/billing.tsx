import { AgentPresenceSummary } from "~/components/agent-presence"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { DollarSign, TrendingUp, Users, Zap, Target } from "lucide-react"

interface RevenueData {
  mrr: number
  costBase: number
  costMarkup: number
  margin: number
  ltv: number
  markup: number
  funnel: { total: number; active: number; paying: number }
  tokenUsage: Array<{ model: string; input_tokens: number; output_tokens: number; requests: number }>
}

interface SubData {
  subscriptions: Array<{ username: string; plan: string; status: string }>
}

function fmt$(n: number) { return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}` }
function fmtTokens(n: number) {
  if (!n) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function BillingContent() {
  const { data: rev, isLoading } = useQuery({
    queryKey: ["admin", "billing", "revenue"],
    queryFn: () => api<RevenueData>("/api/admin/billing/revenue"),
  })
  const { data: subs } = useQuery({
    queryKey: ["admin", "billing", "subscriptions"],
    queryFn: () => api<SubData>("/api/admin/billing/subscriptions"),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const r = rev ?? { mrr: 0, costBase: 0, costMarkup: 0, margin: 0, ltv: 0, markup: 10, funnel: { total: 0, active: 0, paying: 0 }, tokenUsage: [] }

  const metrics = [
    { icon: DollarSign, label: "MRR", value: fmt$(r.mrr), color: "text-success" },
    { icon: Zap, label: "Cost (base)", value: fmt$(r.costBase), color: "text-warning" },
    { icon: TrendingUp, label: "Margin", value: fmt$(r.margin), color: r.margin >= 0 ? "text-success" : "text-danger" },
    { icon: Target, label: "LTV (12mo)", value: fmt$(r.ltv), color: "text-accent-porter" },
    { icon: Users, label: "Paying", value: `${r.funnel.paying}/${r.funnel.total}`, color: "text-text" },
  ]

  return (
    <div className="space-y-3">
      {/* Metrics row */}
      <div className="grid grid-cols-5 gap-2">
        {metrics.map((m, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-2.5 animate-card-deal-in" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center gap-2">
              <m.icon className={`size-3 ${m.color}`} />
              <span className="text-2xs text-text3 uppercase">{m.label}</span>
            </div>
            <p className={`text-sm font-bold mt-0.5 ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Customer Funnel</span>
        <div className="flex items-center gap-2 mt-2">
          {[
            { label: "Registered", value: r.funnel.total, pct: 100 },
            { label: "Active (7d)", value: r.funnel.active, pct: r.funnel.total ? Math.round(r.funnel.active / r.funnel.total * 100) : 0 },
            { label: "Paying", value: r.funnel.paying, pct: r.funnel.total ? Math.round(r.funnel.paying / r.funnel.total * 100) : 0 },
          ].map((step, i) => (
            <div key={i} className="flex-1 rounded-lg bg-background p-2 text-center">
              <p className="text-sm font-bold text-text">{step.value}</p>
              <p className="text-2xs text-text3">{step.label}</p>
              <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-accent-porter transition-all" style={{ width: `${step.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-2xs text-text3 mt-1.5">{r.markup}x markup on all costs</p>
      </div>

      {/* Token cost breakdown */}
      {r.tokenUsage.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-surface border-b border-border">
            <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Token Cost Breakdown</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3">Model</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Input</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Output</th>
                <th className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text3 text-right">Requests</th>
              </tr>
            </thead>
            <tbody>
              {r.tokenUsage.map(t => (
                <tr key={t.model} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5 text-xs font-medium text-text">{t.model}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtTokens(t.input_tokens)}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{fmtTokens(t.output_tokens)}</td>
                  <td className="px-3 py-1.5 text-xs text-text2 text-right">{t.requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subscriptions */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 bg-surface border-b border-border">
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Subscriptions</span>
        </div>
        {!subs?.subscriptions?.length ? (
          <div className="px-3 py-4 text-center text-xs text-text3">No subscriptions</div>
        ) : (
          <table className="w-full">
            <tbody>
              {subs.subscriptions.map((s, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-1.5 text-xs font-medium text-text">{s.username}</td>
                  <td className="px-3 py-1.5 text-xs text-text2">{s.plan}</td>
                  <td className="px-3 py-1.5">
                    <Badge className={`text-2xs border-0 ${
                      s.status === "active" ? "bg-success/15 text-success" :
                      s.status === "trialing" ? "bg-warning/15 text-warning" :
                      "bg-text3/15 text-text3"
                    }`}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <AgentPresenceSummary surface="billing" className="mb-3" />
        <BillingContent />
      </div>
  )
}
