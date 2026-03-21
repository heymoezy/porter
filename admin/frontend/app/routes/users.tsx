import { useState } from "react"
import { Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useCustomers, type Customer } from "~/hooks/use-admin-api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Users, CreditCard, Clock, UserX,
  Search, ChevronRight, Shield,
} from "lucide-react"

function formatRelative(ts: number | null) {
  if (!ts) return "never"
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function planBadge(plan: string, status: string) {
  if (plan === "cloud" && status === "active")
    return <Badge variant="default" className="bg-success/15 text-success border-0">Cloud</Badge>
  if (status === "trialing")
    return <Badge variant="default" className="bg-warning/15 text-warning border-0">Trial</Badge>
  return <Badge variant="outline" className="text-text3 border-text3/20">Free</Badge>
}

function activityIndicator(lastSeen: number | null) {
  if (!lastSeen) return "text-text3"
  const diff = Date.now() / 1000 - lastSeen
  if (diff < 3600) return "text-success"      // active in last hour
  if (diff < 86400) return "text-warning"      // active today
  return "text-text3"                           // inactive
}

type Filter = "all" | "paying" | "trial" | "free"

function CustomersContent() {
  const { data, isLoading } = useCustomers()
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const stats = data?.stats ?? { total: 0, paying: 0, trialing: 0, free: 0 }
  const allCustomers = data?.customers ?? []

  // Filter
  let customers = allCustomers
  if (filter === "paying") customers = customers.filter(c => c.plan === "cloud" && c.sub_status === "active")
  if (filter === "trial") customers = customers.filter(c => c.sub_status === "trialing")
  if (filter === "free") customers = customers.filter(c => c.plan === "free" || c.sub_status === "none")

  // Search
  if (search) {
    const q = search.toLowerCase()
    customers = customers.filter(c =>
      c.username.toLowerCase().includes(q) ||
      (c.display_name ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    )
  }

  const filters: { key: Filter; label: string; count: number; icon: React.ElementType }[] = [
    { key: "all", label: "All", count: stats.total, icon: Users },
    { key: "paying", label: "Paying", count: stats.paying, icon: CreditCard },
    { key: "trial", label: "Trial", count: stats.trialing, icon: Clock },
    { key: "free", label: "Free", count: stats.free, icon: UserX },
  ]

  return (
    <div className="space-y-3">
      {/* Stat pills + search */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.key)}
              className="gap-1.5"
            >
              <f.icon className="size-3.5" />
              {f.label}
              <span className="ml-0.5 text-xs opacity-70">{f.count}</span>
            </Button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="h-8 w-[220px] bg-raised border-border2 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Customer table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[2fr_80px_80px_70px_70px_70px_70px_28px] gap-2 border-b border-border bg-surface px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Customer</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Plan</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Seen</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Health</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">Churn</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">MRR</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3 text-right">LTV</span>
          <span />
        </div>

        {customers.length === 0 ? (
          <div className="py-8 text-center text-sm text-text3">No customers match</div>
        ) : (
          customers.map((c, i) => (
            <Link
              key={c.username}
              to={`/users/${c.username}`}
              className="grid grid-cols-[2fr_80px_80px_70px_70px_70px_70px_28px] gap-2 items-center border-b border-border/50 px-3 py-2 last:border-0 transition-colors hover:bg-surface/60 animate-list-stagger-in"
              style={{ animationDelay: `${i * 20}ms` }}
            >
              {/* Customer */}
              <div className="flex items-center gap-2 min-w-0">
                {c.role === "platform_admin" && <Shield className="size-3 text-accent-porter shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text truncate">{c.display_name || c.username}</p>
                  <p className="text-[10px] text-text3 truncate">{c.email ?? `@${c.username}`}</p>
                </div>
              </div>

              {/* Plan */}
              <div>{planBadge(c.plan, c.sub_status)}</div>

              {/* Last seen */}
              <div className="flex items-center gap-1">
                <div className={`size-1.5 rounded-full ${activityIndicator(c.last_seen_at).replace("text-", "bg-")}`} />
                <span className="text-[11px] text-text2">{formatRelative(c.last_seen_at)}</span>
              </div>

              {/* Health */}
              <div className="text-right">
                <span className={`text-xs font-bold ${c.health >= 70 ? "text-success" : c.health >= 40 ? "text-warning" : "text-danger"}`}>
                  {c.health}
                </span>
              </div>

              {/* Churn */}
              <div className="text-right">
                <span className={`text-xs font-bold ${c.churn <= 30 ? "text-success" : c.churn <= 60 ? "text-warning" : "text-danger"}`}>
                  {c.churn}%
                </span>
              </div>

              {/* MRR */}
              <div className="text-right">
                <span className={`text-xs font-medium ${c.mrr > 0 ? "text-success" : "text-text3"}`}>
                  {c.mrr > 0 ? `$${c.mrr.toFixed(0)}` : "—"}
                </span>
              </div>

              {/* LTV */}
              <div className="text-right">
                <span className="text-xs font-medium text-text2">
                  {c.ltv > 0 ? `$${c.ltv.toFixed(0)}` : "—"}
                </span>
              </div>

              <ChevronRight className="size-3.5 text-text3" />
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

export default function UsersPage() {
  return (
    <AdminShell>
      <CustomersContent />
    </AdminShell>
  )
}
