import { AdminShell } from "~/components/layout/admin-shell"
import { useCustomers } from "~/hooks/use-admin-api"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Link } from "react-router"
import {
  Users, DollarSign, TrendingUp, AlertTriangle,
  Heart, Share2, Target, ChevronRight,
} from "lucide-react"

function fmt$(n: number) { return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}` }
function fmtRel(ts: number | null) {
  if (!ts) return "never"
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

function DashboardContent() {
  const { data, isLoading } = useCustomers()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const customers = data?.customers ?? []
  const stats = data?.stats ?? { total: 0, paying: 0, trialing: 0, free: 0 }

  // Aggregate metrics
  const totalMrr = customers.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const totalCost = customers.reduce((s, c) => s + (c.cost ?? 0), 0)
  const totalMargin = totalMrr - totalCost
  const avgHealth = customers.length > 0 ? Math.round(customers.reduce((s, c) => s + (c.health ?? 50), 0) / customers.length) : 0
  const avgChurn = customers.length > 0 ? Math.round(customers.reduce((s, c) => s + (c.churn ?? 50), 0) / customers.length) : 0
  const totalLtv = customers.reduce((s, c) => s + (c.ltv ?? 0), 0)

  // At-risk customers (churn > 60)
  const atRisk = customers.filter(c => (c.churn ?? 0) > 60)
  // Conversion candidates (conversion > 40 and free)
  const conversionCandidates = customers.filter(c => (c.conversion ?? 0) > 40 && c.plan === 'free')
  // Viral leaders
  const viralLeaders = customers.filter(c => (c.viral ?? 0) > 30).sort((a, b) => (b.viral ?? 0) - (a.viral ?? 0))

  return (
    <div className="space-y-3">
      {/* Revenue row */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { icon: Users, label: "Customers", value: String(stats.total), sub: `${stats.paying} paying · ${stats.trialing} trial`, color: "#6366F1" },
          { icon: DollarSign, label: "MRR", value: fmt$(totalMrr), sub: `${stats.paying} subscriptions`, color: "#22C55E" },
          { icon: TrendingUp, label: "Margin", value: fmt$(totalMargin), sub: `Cost ${fmt$(totalCost)}`, color: totalMargin >= 0 ? "#22C55E" : "#EF4444" },
          { icon: Target, label: "12mo LTV", value: fmt$(totalLtv), sub: `Avg ${fmt$(customers.length > 0 ? totalLtv / customers.length : 0)}`, color: "#6366F1" },
          { icon: Heart, label: "Avg Health", value: String(avgHealth), sub: `Churn risk ${avgChurn}%`, color: avgHealth >= 70 ? "#22C55E" : avgHealth >= 40 ? "#F59E0B" : "#EF4444" },
        ].map((m, i) => (
          <Card key={i} className="animate-card-deal-in border-border bg-surface" style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="flex items-center gap-2 p-3">
              <div className="flex size-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${m.color}15` }}>
                <m.icon className="size-3" style={{ color: m.color }} />
              </div>
              <div>
                <p className="text-sm font-bold text-text">{m.value}</p>
                <p className="text-[11px] text-text3">{m.label}</p>
                <p className="text-[10px] text-text3">{m.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action lanes: At-risk + Conversion + Viral */}
      <div className="grid grid-cols-3 gap-2">
        {/* At-risk */}
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-danger" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Churn Risk</h3>
              </div>
              <Badge variant="destructive" className="text-[10px]">{atRisk.length}</Badge>
            </div>
            {atRisk.length === 0 ? (
              <p className="text-xs text-text3">No at-risk customers</p>
            ) : (
              <div className="space-y-1">
                {atRisk.slice(0, 5).map(c => (
                  <Link key={c.username} to={`/users/${c.username}`} className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 hover:bg-raised transition-colors">
                    <div>
                      <p className="text-xs font-medium text-text">{c.display_name || c.username}</p>
                      <p className="text-[11px] text-text3">Last seen {fmtRel(c.last_seen_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-danger">{c.churn}%</span>
                      <ChevronRight className="size-3 text-text3" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion candidates */}
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="size-3.5 text-success" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Ready to Convert</h3>
              </div>
              <Badge className="text-[10px] bg-success/15 text-success border-0">{conversionCandidates.length}</Badge>
            </div>
            {conversionCandidates.length === 0 ? (
              <p className="text-xs text-text3">No conversion candidates</p>
            ) : (
              <div className="space-y-1">
                {conversionCandidates.slice(0, 5).map(c => (
                  <Link key={c.username} to={`/users/${c.username}`} className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 hover:bg-raised transition-colors">
                    <div>
                      <p className="text-xs font-medium text-text">{c.display_name || c.username}</p>
                      <p className="text-[11px] text-text3">{c.project_count} projects · {c.agent_count} agents</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-success">{c.conversion}%</span>
                      <ChevronRight className="size-3 text-text3" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Viral leaders */}
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Share2 className="size-3.5 text-accent-porter" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3">Viral Leaders</h3>
              </div>
              <Badge className="text-[10px] bg-accent-porter/15 text-accent-porter border-0">{viralLeaders.length}</Badge>
            </div>
            {viralLeaders.length === 0 ? (
              <p className="text-xs text-text3">No viral activity yet</p>
            ) : (
              <div className="space-y-1">
                {viralLeaders.slice(0, 5).map(c => (
                  <Link key={c.username} to={`/users/${c.username}`} className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 hover:bg-raised transition-colors">
                    <div>
                      <p className="text-xs font-medium text-text">{c.display_name || c.username}</p>
                      <p className="text-[11px] text-text3">{c.invitesSent ?? 0} invites · {c.invitesConverted ?? 0} converted</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-accent-porter">{c.viral}%</span>
                      <ChevronRight className="size-3 text-text3" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick counts */}
      <div className="flex items-center gap-4 px-1 text-xs text-text3">
        <span>{stats.total} customers</span>
        <span>{atRisk.length} at risk</span>
        <span>{conversionCandidates.length} ready to convert</span>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  )
}
