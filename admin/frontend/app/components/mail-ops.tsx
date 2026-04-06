import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "~/components/ui/select"
import { Plus, RotateCw, Trash2, Pencil, X, Check } from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface MailStats {
  mailboxes: Record<string, number>
  messages: Record<string, number>
  deliveries: Record<string, number>
  newsletterSources: Record<string, number>
  subscriptions: { active: number; cancelled: number }
  learningEvents: Record<string, number>
}

interface QueueItem {
  deliveryId: string
  messageId: string
  from: string
  to: string
  subject: string
  status: string
  queuedAt: number | null
  attempts: number
}

interface BounceItem {
  deliveryId: string
  messageId: string
  recipient: string
  status: string
  smtpResponse: string | null
  remoteMx: string | null
  completedAt: number | null
}

interface DomainRow {
  id: string
  domain: string
  status: string
  is_primary: number
  dns_last_checked_at: number | null
  dns_status_json: unknown
}

interface MailboxRow {
  id: string
  address: string
  display_name: string
  mailbox_type: string
  status: string
  last_sync_at: number | null
  last_error: string | null
}

interface MailboxHealth {
  address: string
  status: string
  lastSyncAt: number | null
  lastError: string | null
  messageCount: number
  queuedDeliveries: number
}

interface DomainHealth {
  domain: string
  status: string
  dnsRecords: unknown[]
  lastChecked: number | null
  issues: string[]
}

// ── Tabs ──────────────────────────────────────────────

type TabId = "overview" | "queue" | "bounces" | "domains" | "mailboxes" | "newsletters"

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Queue" },
  { id: "bounces", label: "Bounces" },
  { id: "domains", label: "Domains" },
  { id: "mailboxes", label: "Mailboxes" },
  { id: "newsletters", label: "Newsletters" },
]

// ── Helpers ──────────────────────────────────────────

function fmtRelative(epoch: number | null): string {
  if (!epoch) return "never"
  const now = Date.now() / 1000
  const diff = now - epoch
  const abs = Math.abs(diff)
  if (abs < 60) return "just now"
  if (abs < 3600) {
    const m = Math.round(abs / 60)
    return diff > 0 ? `${m}m ago` : `in ${m}m`
  }
  if (abs < 86400) {
    const h = Math.round(abs / 3600)
    return diff > 0 ? `${h}h ago` : `in ${h}h`
  }
  const d = Math.round(abs / 86400)
  return diff > 0 ? `${d}d ago` : `in ${d}d`
}

function fmtTimestamp(epoch: number | null): string {
  if (!epoch) return "-"
  return new Date(epoch * 1000).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0)
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  pending_dns: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
  sent: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  queued: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  deferred: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  bounced: "bg-red-500/15 text-red-400 border-red-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
  trusted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  review: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  blocked: "bg-red-500/15 text-red-400 border-red-500/20",
}

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/20"
  return (
    <Badge variant="outline" className={`text-2xs ${cls}`}>
      {status}
    </Badge>
  )
}

// ── Stat Card ──────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-text3 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text3">{sub}</p>}
    </div>
  )
}

// ── Component ──────────────────────────────────────────

export function MailOps() {
  const [tab, setTab] = useState<TabId>("overview")
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; address: string } | null>(null)

  // ── Data Fetches ────────────────────────────────────

  const stats = useQuery({
    queryKey: ["admin", "mail", "stats"],
    queryFn: () => api<MailStats>("/api/v1/mail-admin/stats"),
    refetchInterval: 30_000,
  })

  const queue = useQuery({
    queryKey: ["admin", "mail", "queue"],
    queryFn: () => api<{ queue: QueueItem[] }>("/api/v1/mail-admin/queue"),
    refetchInterval: 15_000,
    enabled: tab === "queue" || tab === "overview",
  })

  const bounces = useQuery({
    queryKey: ["admin", "mail", "bounces"],
    queryFn: () => api<{ bounces: BounceItem[] }>("/api/v1/mail-admin/bounces"),
    refetchInterval: 30_000,
    enabled: tab === "bounces" || tab === "overview",
  })

  const domains = useQuery({
    queryKey: ["admin", "mail", "domains"],
    queryFn: () => api<{ domains: DomainRow[] }>("/api/v1/mail-admin/domains"),
    enabled: tab === "domains" || tab === "overview",
  })

  const mailboxes = useQuery({
    queryKey: ["admin", "mail", "mailboxes"],
    queryFn: () => api<{ mailboxes: MailboxRow[] }>("/api/v1/mail-admin/mailboxes"),
    enabled: tab === "mailboxes" || tab === "overview",
  })

  // Domain health - fetch per-domain when on domains tab
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const domainHealth = useQuery({
    queryKey: ["admin", "mail", "domain-health", selectedDomainId],
    queryFn: () => api<DomainHealth>(`/api/v1/mail-admin/domains/${selectedDomainId}/health`),
    enabled: !!selectedDomainId,
  })

  // Mailbox health - fetch per-mailbox when clicked
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
  const mailboxHealth = useQuery({
    queryKey: ["admin", "mail", "mailbox-health", selectedMailboxId],
    queryFn: () => api<MailboxHealth>(`/api/v1/mail-admin/mailboxes/${selectedMailboxId}/health`),
    enabled: !!selectedMailboxId,
  })

  // ── Mailbox CRUD ────────────────────────────────────
  const qc = useQueryClient()

  // Agents list for bind-to-agent dropdown
  const agentsQuery = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api<{ agents: Array<{ id: string; name: string; role: string; status: string }> }>("/api/admin/agents"),
    enabled: tab === "mailboxes",
  })

  // Mailbox management state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({ localPart: "", displayName: "", mailboxType: "agent", agentId: "" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  // Primary domain ID — use first domain from domains query
  const primaryDomain = useMemo(() => {
    const doms = domains.data?.domains ?? []
    return doms.find(d => d.is_primary) ?? doms[0] ?? null
  }, [domains.data])

  // Agents without mailboxes
  const unboundAgents = useMemo(() => {
    const agents = agentsQuery.data?.agents ?? []
    const boundIds = new Set(
      (mailboxes.data?.mailboxes ?? [])
        .filter(m => m.mailbox_type === "agent")
        .map(m => m.address.split("@")[0]) // rough filter
    )
    // More precise: check agent_mailboxes, but for now just show all agents
    return agents
  }, [agentsQuery.data, mailboxes.data])

  const createMailboxMutation = useMutation({
    mutationFn: (data: { domainId: string; localPart: string; displayName: string; mailboxType: string; agentId?: string }) =>
      api("/api/v1/mail-admin/mailboxes", { method: "POST", json: data }),
    onSuccess: () => {
      setShowCreateForm(false)
      setCreateForm({ localPart: "", displayName: "", mailboxType: "agent", agentId: "" })
      qc.invalidateQueries({ queryKey: ["admin", "mail", "mailboxes"] })
      qc.invalidateQueries({ queryKey: ["admin", "mail", "stats"] })
    },
  })

  const updateMailboxMutation = useMutation({
    mutationFn: (data: { id: string; displayName: string }) =>
      api(`/api/v1/mail-admin/mailboxes/${data.id}`, { method: "PATCH", json: { displayName: data.displayName } }),
    onSuccess: () => {
      setEditingId(null)
      setEditName("")
      qc.invalidateQueries({ queryKey: ["admin", "mail", "mailboxes"] })
    },
  })

  const rotateCredentialMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ password: string }>(`/api/v1/mail-admin/mailboxes/${id}/rotate-credential`, { method: "POST" }),
  })

  const deleteMailboxMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/mail-admin/mailboxes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ["admin", "mail", "mailboxes"] })
      qc.invalidateQueries({ queryKey: ["admin", "mail", "stats"] })
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  const s = stats.data

  // Computed overview values
  const totalMailboxes = s ? sumValues(s.mailboxes) : 0
  const totalMessages = s ? sumValues(s.messages) : 0
  const totalDeliveries = s ? sumValues(s.deliveries) : 0
  const deliveredCount = s?.deliveries?.delivered ?? 0
  const bouncedCount = (s?.deliveries?.bounced ?? 0) + (s?.deliveries?.failed ?? 0)
  const successRate = totalDeliveries > 0 ? ((deliveredCount / totalDeliveries) * 100).toFixed(1) : "-"
  const bounceRate = totalDeliveries > 0 ? ((bouncedCount / totalDeliveries) * 100).toFixed(1) : "-"
  const queueDepth = queue.data?.queue?.length ?? 0

  // ── Render ──────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="rounded-lg border border-red-500/30 bg-surface p-5 w-[400px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center size-8 rounded-full bg-red-500/15">
                <Trash2 className="size-4 text-red-400" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Delete mailbox permanently?</h3>
            </div>
            <p className="text-xs text-text2 mb-1">
              You're about to delete <span className="font-mono font-semibold text-foreground">{deleteTarget.address}</span>
            </p>
            <p className="text-xs text-red-400 mb-4">
              All emails in this mailbox will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white border-0"
                onClick={() => deleteMailboxMutation.mutate(deleteTarget.id)}
                disabled={deleteMailboxMutation.isPending}
              >
                {deleteMailboxMutation.isPending ? "Deleting..." : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Mail Ops</h1>
        <p className="text-sm text-text3 mt-1">
          Deliverability, queue health, and mail infrastructure monitoring
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-accent-porter text-accent-porter"
                : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            {t.label}
            {t.id === "queue" && queueDepth > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-warning text-white text-2xs px-1">
                {queueDepth}
              </span>
            )}
            {t.id === "bounces" && bouncedCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-danger text-white text-2xs px-1">
                {bouncedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {stats.isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {stats.isError && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-sm text-red-400">{(stats.error as Error)?.message || "Failed to load stats"}</p>
          <button onClick={() => stats.refetch()} className="text-sm text-accent-porter hover:underline">Retry</button>
        </div>
      )}

      {/* ── Overview Tab ─────────────────────────────── */}
      {tab === "overview" && s && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Mailboxes" value={totalMailboxes} sub={`${s.mailboxes.active ?? 0} active`} />
            <StatCard label="Messages" value={totalMessages} sub={`${s.messages.inbound ?? 0} in / ${s.messages.outbound ?? 0} out`} />
            <StatCard label="Success Rate" value={`${successRate}%`} sub={`${totalDeliveries} total deliveries`} />
            <StatCard label="Bounce Rate" value={`${bounceRate}%`} sub={`${bouncedCount} bounced/failed`} />
          </div>

          {/* Delivery breakdown */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground mb-3">Delivery Status Breakdown</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(s.deliveries).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  {statusBadge(status)}
                  <span className="text-sm tabular-nums text-foreground">{count}</span>
                </div>
              ))}
              {Object.keys(s.deliveries).length === 0 && (
                <span className="text-sm text-text3">No deliveries recorded yet</span>
              )}
            </div>
          </div>

          {/* Queue summary */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground mb-2">Queue</p>
            {queueDepth === 0 ? (
              <p className="text-sm text-text3">Queue is empty</p>
            ) : (
              <p className="text-sm text-warning">{queueDepth} item{queueDepth !== 1 ? "s" : ""} queued/deferred</p>
            )}
          </div>
        </div>
      )}

      {/* ── Queue Tab ────────────────────────────────── */}
      {tab === "queue" && (
        <div>
          {queue.isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          )}
          {!queue.isLoading && (queue.data?.queue?.length ?? 0) === 0 && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-text3">Queue is empty. All deliveries processed.</p>
            </div>
          )}
          {!queue.isLoading && (queue.data?.queue?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left font-medium text-text3 px-4 py-2.5">From</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">To</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Subject</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Queued</th>
                      <th className="text-right font-medium text-text3 px-4 py-2.5">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.data!.queue.map(item => (
                      <tr key={item.deliveryId} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                        <td className="px-4 py-2.5 text-foreground truncate max-w-[180px]">{item.from || "-"}</td>
                        <td className="px-4 py-2.5 text-foreground truncate max-w-[180px]">{item.to}</td>
                        <td className="px-4 py-2.5 text-text3 truncate max-w-[240px]">{item.subject || "(no subject)"}</td>
                        <td className="px-4 py-2.5">{statusBadge(item.status)}</td>
                        <td className="px-4 py-2.5 text-text3 tabular-nums">{fmtRelative(item.queuedAt)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text3">{item.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-text3 mt-3">Auto-refreshes every 15 seconds</p>
        </div>
      )}

      {/* ── Bounces Tab ──────────────────────────────── */}
      {tab === "bounces" && (
        <div>
          {bounces.isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          )}
          {!bounces.isLoading && (bounces.data?.bounces?.length ?? 0) === 0 && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-text3">No bounces recorded. Clean slate.</p>
            </div>
          )}
          {!bounces.isLoading && (bounces.data?.bounces?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Recipient</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">SMTP Response</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Remote MX</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bounces.data!.bounces.map(b => (
                      <tr key={b.deliveryId} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                        <td className="px-4 py-2.5 text-foreground">{b.recipient}</td>
                        <td className="px-4 py-2.5">{statusBadge(b.status)}</td>
                        <td className="px-4 py-2.5 text-text3 truncate max-w-[300px] font-mono text-xs" title={b.smtpResponse ?? undefined}>
                          {b.smtpResponse || "-"}
                        </td>
                        <td className="px-4 py-2.5 text-text3 font-mono text-xs">{b.remoteMx || "-"}</td>
                        <td className="px-4 py-2.5 text-text3 tabular-nums">{fmtTimestamp(b.completedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Domains Tab ──────────────────────────────── */}
      {tab === "domains" && (
        <div className="space-y-4">
          {domains.isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          )}
          {!domains.isLoading && (domains.data?.domains?.length ?? 0) === 0 && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-text3">No domains configured. Add one via the API.</p>
            </div>
          )}
          {!domains.isLoading && (domains.data?.domains?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Domain</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Primary</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">DNS Checked</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.data!.domains.map(d => (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-foreground">{d.domain}</td>
                        <td className="px-4 py-2.5">{statusBadge(d.status)}</td>
                        <td className="px-4 py-2.5 text-text3">{d.is_primary ? "Yes" : "-"}</td>
                        <td className="px-4 py-2.5 text-text3 tabular-nums">{fmtRelative(d.dns_last_checked_at)}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setSelectedDomainId(d.id === selectedDomainId ? null : d.id)}
                            className="text-xs text-accent-porter hover:underline"
                          >
                            {selectedDomainId === d.id ? "Hide" : "Check"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Domain health detail */}
          {selectedDomainId && (
            <div className="rounded-lg border border-border p-4">
              {domainHealth.isLoading && (
                <div className="flex items-center gap-2">
                  <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
                  <span className="text-sm text-text3">Checking DNS...</span>
                </div>
              )}
              {domainHealth.data && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{domainHealth.data.domain}</p>
                    {statusBadge(domainHealth.data.status)}
                  </div>
                  {domainHealth.data.issues.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-red-400">Issues found:</p>
                      {domainHealth.data.issues.map((issue, i) => (
                        <p key={i} className="text-xs text-red-400 pl-3">- {issue}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-400">No issues detected</p>
                  )}
                  {domainHealth.data.lastChecked && (
                    <p className="text-xs text-text3">Last checked: {fmtTimestamp(domainHealth.data.lastChecked)}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Mailboxes Tab ────────────────────────────── */}
      {tab === "mailboxes" && (
        <div className="space-y-4">
          {/* Create button + inline form */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {(mailboxes.data?.mailboxes?.length ?? 0)} mailbox{(mailboxes.data?.mailboxes?.length ?? 0) !== 1 ? "es" : ""}
            </p>
            {!showCreateForm && (
              <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => setShowCreateForm(true)} disabled={!primaryDomain}>
                <Plus className="size-3" /> Create Mailbox
              </Button>
            )}
          </div>

          {/* Create form */}
          {showCreateForm && primaryDomain && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-text3">New Mailbox</p>
                <button onClick={() => setShowCreateForm(false)} className="text-text3 hover:text-text2">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-2xs text-text3">Local part</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      className="h-7 text-xs"
                      value={createForm.localPart}
                      onChange={e => setCreateForm(f => ({ ...f, localPart: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") }))}
                      placeholder="name"
                    />
                    <span className="text-xs text-text3 shrink-0">@{primaryDomain.domain}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-2xs text-text3">Display name</Label>
                  <Input
                    className="h-7 text-xs mt-1"
                    value={createForm.displayName}
                    onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                    placeholder="Display Name"
                  />
                </div>
                <div>
                  <Label className="text-2xs text-text3">Type</Label>
                  <Select value={createForm.mailboxType} onValueChange={v => setCreateForm(f => ({ ...f, mailboxType: v }))}>
                    <SelectTrigger className="h-7 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="human">Human</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-2xs text-text3">Bind to agent</Label>
                  <Select value={createForm.agentId || "__none__"} onValueChange={v => setCreateForm(f => ({ ...f, agentId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-7 text-xs mt-1">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(agentsQuery.data?.agents ?? []).map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!createForm.localPart || !createForm.displayName || createMailboxMutation.isPending}
                  onClick={() => {
                    createMailboxMutation.mutate({
                      domainId: primaryDomain.id,
                      localPart: createForm.localPart,
                      displayName: createForm.displayName,
                      mailboxType: createForm.mailboxType,
                      agentId: createForm.agentId || undefined,
                    })
                  }}
                >
                  {createMailboxMutation.isPending ? "Creating..." : "Create"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                {createMailboxMutation.isError && (
                  <span className="text-2xs text-red-400">{(createMailboxMutation.error as Error)?.message || "Failed"}</span>
                )}
              </div>
            </div>
          )}

          {/* Rotate credential result */}
          {rotateCredentialMutation.isSuccess && rotateCredentialMutation.data && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check className="size-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-emerald-400">SMTP credential rotated</span>
              </div>
              <p className="text-2xs text-text3 mb-2">This is the new SMTP password for this mailbox. Copy it now — Porter won't show it again.</p>
              <code className="text-xs font-mono text-foreground bg-raised px-3 py-1.5 rounded block select-all">
                {rotateCredentialMutation.data.password}
              </code>
            </div>
          )}

          {mailboxes.isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
            </div>
          )}
          {!mailboxes.isLoading && (mailboxes.data?.mailboxes?.length ?? 0) === 0 && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-text3">No mailboxes provisioned yet.</p>
            </div>
          )}
          {!mailboxes.isLoading && (mailboxes.data?.mailboxes?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Address</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Name</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Type</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Status</th>
                      <th className="text-left font-medium text-text3 px-4 py-2.5">Last Sync</th>
                      <th className="text-right font-medium text-text3 px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailboxes.data!.mailboxes.map(mb => (
                      <tr key={mb.id} className="border-b border-border/50 hover:bg-surface/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-foreground font-mono text-xs">{mb.address}</td>
                        <td className="px-4 py-2.5">
                          {editingId === mb.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-6 text-xs w-32"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") updateMailboxMutation.mutate({ id: mb.id, displayName: editName }) }}
                                autoFocus
                              />
                              <button
                                onClick={() => updateMailboxMutation.mutate({ id: mb.id, displayName: editName })}
                                className="text-emerald-400 hover:text-emerald-300"
                                disabled={updateMailboxMutation.isPending}
                              >
                                <Check className="size-3" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="text-text3 hover:text-text2">
                                <X className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-foreground">{mb.display_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-2xs bg-zinc-500/15 text-zinc-400 border-zinc-500/20">
                            {mb.mailbox_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">{statusBadge(mb.status)}</td>
                        <td className="px-4 py-2.5 text-text3 tabular-nums">{fmtRelative(mb.last_sync_at)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit name */}
                            <button
                              onClick={() => { setEditingId(mb.id); setEditName(mb.display_name) }}
                              className="flex items-center justify-center size-6 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors"
                              title="Edit name"
                            >
                              <Pencil className="size-3" />
                            </button>
                            {/* Rotate credential */}
                            <button
                              onClick={() => rotateCredentialMutation.mutate(mb.id)}
                              className="flex items-center justify-center size-6 rounded text-text3 hover:text-text2 hover:bg-raised transition-colors"
                              title="Rotate credential"
                              disabled={rotateCredentialMutation.isPending}
                            >
                              <RotateCw className={`size-3 ${rotateCredentialMutation.isPending ? "animate-spin" : ""}`} />
                            </button>
                            {/* Health check */}
                            <button
                              onClick={() => setSelectedMailboxId(mb.id === selectedMailboxId ? null : mb.id)}
                              className="text-xs text-accent-porter hover:underline px-1"
                            >
                              {selectedMailboxId === mb.id ? "Hide" : "Health"}
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => setDeleteTarget({ id: mb.id, address: mb.address })}
                              className="flex items-center justify-center size-6 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Delete mailbox"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mailbox health detail */}
          {selectedMailboxId && (
            <div className="rounded-lg border border-border p-4">
              {mailboxHealth.isLoading && (
                <div className="flex items-center gap-2">
                  <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
                  <span className="text-sm text-text3">Checking health...</span>
                </div>
              )}
              {mailboxHealth.data && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium font-mono text-foreground">{mailboxHealth.data.address}</p>
                    {statusBadge(mailboxHealth.data.status)}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-text3">Messages</p>
                      <p className="font-medium tabular-nums text-foreground">{mailboxHealth.data.messageCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text3">Queued Deliveries</p>
                      <p className={`font-medium tabular-nums ${mailboxHealth.data.queuedDeliveries > 0 ? "text-warning" : "text-foreground"}`}>
                        {mailboxHealth.data.queuedDeliveries}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text3">Last Sync</p>
                      <p className="text-foreground tabular-nums">{fmtRelative(mailboxHealth.data.lastSyncAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text3">Last Error</p>
                      <p className={mailboxHealth.data.lastError ? "text-red-400 text-xs" : "text-foreground"}>
                        {mailboxHealth.data.lastError || "None"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Newsletters Tab ──────────────────────────── */}
      {tab === "newsletters" && s && (
        <div className="space-y-6">
          {/* Source counts by trust level */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground mb-3">Newsletter Sources by Trust Level</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(s.newsletterSources).length > 0 ? (
                Object.entries(s.newsletterSources).map(([level, count]) => (
                  <div key={level} className="flex items-center gap-2">
                    {statusBadge(level)}
                    <span className="text-sm tabular-nums text-foreground">{count}</span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-text3">No newsletter sources detected yet</span>
              )}
            </div>
          </div>

          {/* Subscriptions */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Active Subscriptions" value={s.subscriptions.active} />
            <StatCard label="Cancelled" value={s.subscriptions.cancelled} />
          </div>

          {/* Learning events */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground mb-3">Learning Events by Type</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(s.learningEvents).length > 0 ? (
                Object.entries(s.learningEvents).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-2xs bg-purple-500/15 text-purple-400 border-purple-500/20">
                      {type}
                    </Badge>
                    <span className="text-sm tabular-nums text-foreground">{count}</span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-text3">No learning events recorded yet</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
