import { useState } from "react"
import { useParams, useNavigate } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useCustomerDetail, useUpdateRole, useDeleteUser } from "~/hooks/use-admin-api"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Progress } from "~/components/ui/progress"
import { Separator } from "~/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "~/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Trash2, Shield, DollarSign, TrendingUp, TrendingDown,
  Zap, AlertTriangle, CheckCircle, Heart, Users,
  Globe, Share2, Target, Brain, Play, ChevronDown,
  MapPin, Building, Mail, Phone, Github, ExternalLink,
  Clock, Bot, FolderKanban, MessageSquare,
} from "lucide-react"
import { api } from "~/lib/api"
import { Link } from "react-router"

function fmt$(n: number) { return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}` }
function fmtRel(ts: number | null) {
  if (!ts) return "never"
  const d = Date.now() / 1000 - ts
  if (d < 60) return "now"
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}
function fmtDate(ts: number | null) {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function scoreColor(v: number, invert = false) {
  const n = invert ? 100 - v : v
  if (n >= 70) return "text-success"
  if (n >= 40) return "text-warning"
  return "text-danger"
}

const roleLabels: Record<string, string> = { operator: "Operator", admin: "Admin", platform_admin: "Platform Admin" }

function UserDetailContent() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useCustomerDetail(username!)
  const updateRole = useUpdateRole()
  const deleteUser = useDeleteUser()
  const [pendingRole, setPendingRole] = useState<string | null>(null)

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const { customer: c, scores: s, stage, tokensByModel, loginHistory, anomalies, recentProjects, pendingTasks } = data as any
  const roleRank: Record<string, number> = { operator: 0, admin: 1, platform_admin: 2 }

  function handleRoleChange(role: string) {
    if (role === c.role) return
    if ((roleRank[role] ?? 0) < (roleRank[c.role] ?? 0)) setPendingRole(role)
    else updateRole.mutateAsync({ username: c.username, role })
  }

  async function handlePurge() {
    await api(`/api/admin/users/${c.username}/purge-sessions`, { method: "POST" })
    refetch()
  }

  async function executeTask(taskId: number) {
    await api(`/api/admin/agents/execute/${taskId}`, { method: "POST" })
    refetch()
  }

  return (
    <div className="space-y-3">
      {/* Role downgrade modal */}
      <AlertDialog open={!!pendingRole} onOpenChange={(o) => !o && setPendingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade Role</AlertDialogTitle>
            <AlertDialogDescription>
              Downgrading <strong>{c.display_name || c.username}</strong> from <strong>{roleLabels[c.role] ?? c.role}</strong> to <strong>{roleLabels[pendingRole ?? ""] ?? pendingRole}</strong>. Permissions revoked immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/80"
              onClick={() => { if (pendingRole) updateRole.mutateAsync({ username: c.username, role: pendingRole }); setPendingRole(null) }}>
              Downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Identity + CRM profile */}
      <div className="flex gap-2">
        {/* Profile card */}
        <Card className="flex-1 animate-card-deal-in border-border bg-surface">
          <CardContent className="p-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-12 items-center justify-center rounded-full bg-accent-porter text-lg font-bold text-white">
                  {(c.display_name || c.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-text">{c.full_name || c.display_name || c.username}</span>
                    {c.email_verified ? <CheckCircle className="size-3.5 text-success" /> : <AlertTriangle className="size-3.5 text-warning" />}
                    <Badge variant={stage === "revenue" ? "default" : stage === "at-risk" ? "destructive" : "secondary"} className="text-[10px]">{stage}</Badge>
                  </div>
                  <p className="text-xs text-text3">@{c.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="xs">
                      {roleLabels[c.role] ?? c.role} <ChevronDown className="size-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {Object.entries(roleLabels).map(([k, v]) => (
                      <DropdownMenuItem key={k} onClick={() => handleRoleChange(k)} className={c.role === k ? "font-bold" : ""}>
                        {v} {c.role === k && <CheckCircle className="size-3 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Dialog>
                  <DialogTrigger asChild><Button variant="destructive" size="icon-xs"><Trash2 className="size-3" /></Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Delete Customer</DialogTitle>
                      <DialogDescription>Permanently delete <strong>{c.username}</strong>?</DialogDescription></DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                      <Button variant="destructive" onClick={async () => { await deleteUser.mutateAsync(c.username); navigate("/users") }}>Delete</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            {/* CRM fields */}
            <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
              {c.email && <span className="flex items-center gap-1.5 text-text2"><Mail className="size-3 text-text3" />{c.email}</span>}
              {c.phone && <span className="flex items-center gap-1.5 text-text2"><Phone className="size-3 text-text3" />{c.phone}</span>}
              {(c.country || c.city) && <span className="flex items-center gap-1.5 text-text2"><MapPin className="size-3 text-text3" />{[c.city, c.country].filter(Boolean).join(", ")}</span>}
              {c.company && <span className="flex items-center gap-1.5 text-text2"><Building className="size-3 text-text3" />{c.company}{c.job_title ? ` · ${c.job_title}` : ""}</span>}
              {c.social_x && <span className="flex items-center gap-1.5 text-text2"><ExternalLink className="size-3 text-text3" />@{c.social_x}</span>}
              {c.social_github && <span className="flex items-center gap-1.5 text-text2"><Github className="size-3 text-text3" />{c.social_github}</span>}
              <span className="flex items-center gap-1.5 text-text3"><Clock className="size-3" />Joined {fmtDate(c.created_at)}</span>
              <span className="flex items-center gap-1.5 text-text3"><Globe className="size-3" />Last seen {fmtRel(c.last_seen_at)} · IP {c.last_ip ?? "—"}</span>
              {c.signup_source && <span className="flex items-center gap-1.5 text-text3"><Share2 className="size-3" />Source: {c.signup_source}</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next Action + Agent Tasks */}
      <Card className="border-accent-porter/30 bg-accent-porter/5">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Brain className="size-3.5 text-accent-porter shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-porter">
                Next Action — {s.nextAction.agent ? `${s.nextAction.agent} agent` : "none"}
              </p>
              <p className="text-sm text-text">{s.nextAction.text}</p>
            </div>
            {pendingTasks && pendingTasks.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button size="xs" onClick={() => executeTask(pendingTasks[0].id)} className="gap-1">
                  <Play className="size-3" /> Execute
                </Button>
                <Badge variant="outline" className="text-[10px]">{pendingTasks.length} queued</Badge>
              </div>
            )}
            {(!pendingTasks || pendingTasks.length === 0) && s.nextAction.agent && (
              <Link to="/agents">
                <Button variant="outline" size="xs" className="gap-1"><Bot className="size-3" /> View Queue</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Revenue: MRR, Cost, Margin, LTV */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: DollarSign, label: "MRR", value: fmt$(s.mrr), color: "#22C55E" },
          { icon: Zap, label: "Cost/mo", value: fmt$(s.cost), color: "#EF4444" },
          { icon: s.margin >= 0 ? TrendingUp : TrendingDown, label: "Margin", value: fmt$(s.margin), color: s.margin >= 0 ? "#22C55E" : "#EF4444" },
          { icon: Target, label: "12mo LTV", value: fmt$(s.ltv), color: "#6366F1" },
        ].map((m, i) => (
          <Card key={i} className="border-border bg-surface">
            <CardContent className="flex items-center gap-2 p-3">
              <div className="flex size-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${m.color}15` }}>
                <m.icon className="size-3" style={{ color: m.color }} />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
                <p className="text-[11px] text-text3">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scores with breakdowns */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Health", value: s.health, factors: s.healthFactors, invert: false },
          { label: "Conversion", value: s.conversion, factors: s.conversionFactors, invert: false },
          { label: "Churn Risk", value: s.churn, factors: s.churnFactors, invert: true },
          { label: "Viral", value: s.viral, factors: s.viralFactors, invert: false },
        ].map((sc) => (
          <Card key={sc.label} className="border-border bg-surface">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">{sc.label}</span>
                <span className={`text-base font-bold ${scoreColor(sc.value, sc.invert)}`}>{sc.value}</span>
              </div>
              <Progress value={sc.value} className="h-1 mb-2" />
              <div className="space-y-0.5">
                {sc.factors.map((f: string, i: number) => (
                  <p key={i} className="text-[10px] text-text3">{f}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Anomalies + Token costs + Security + Activity */}
      <div className="grid grid-cols-3 gap-2">
        {/* Signals */}
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-2">Signals</h3>
            <div className="space-y-1.5">
              {anomalies.map((a: string, i: number) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-danger/5 px-2.5 py-1.5">
                  <AlertTriangle className="size-3 text-danger mt-0.5 shrink-0" />
                  <p className="text-[11px] text-danger/90">{a}</p>
                </div>
              ))}
              {c.suspended_at && (
                <div className="flex items-start gap-2 rounded-md bg-danger/5 px-2.5 py-1.5">
                  <Shield className="size-3 text-danger mt-0.5 shrink-0" />
                  <p className="text-[11px] text-danger/90">Account suspended: {c.suspension_reason ?? "no reason"}</p>
                </div>
              )}
              {!c.email_verified && (
                <div className="flex items-start gap-2 rounded-md bg-warning/5 px-2.5 py-1.5">
                  <AlertTriangle className="size-3 text-warning mt-0.5 shrink-0" />
                  <p className="text-[11px] text-warning/90">Email not verified</p>
                </div>
              )}
              {anomalies.length === 0 && !c.suspended_at && c.email_verified !== 0 && (
                <div className="flex items-start gap-2 rounded-md bg-success/5 px-2.5 py-1.5">
                  <CheckCircle className="size-3 text-success mt-0.5 shrink-0" />
                  <p className="text-[11px] text-success/90">No issues detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Token costs */}
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-2">Token Costs</h3>
            {tokensByModel.length === 0 ? (
              <p className="text-xs text-text3">No usage this month</p>
            ) : (
              <div className="space-y-1.5">
                {tokensByModel.map((t: any) => (
                  <div key={t.model} className="flex items-center justify-between text-xs">
                    <div>
                      <p className="font-medium text-text">{t.model}</p>
                      <p className="text-[10px] text-text3">{t.requests} reqs</p>
                    </div>
                    <span className="font-semibold text-text">{fmt$(t.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security + Activity compact */}
        <Card className="border-border bg-surface">
          <CardContent className="p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-2">Overview</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-text3">Sessions</span><span className="font-semibold text-text">{c.active_sessions}</span></div>
              <div className="flex justify-between"><span className="text-text3">Unique IPs</span><span className="font-semibold text-text">{c.unique_ips}</span></div>
              <div className="flex justify-between"><span className="text-text3">30d logins</span><span className="font-semibold text-text">{s.loginCount}</span></div>
              <Separator className="my-1.5" />
              <div className="flex justify-between"><span className="text-text3">Projects</span><span className="font-semibold text-text">{c.project_count}</span></div>
              <div className="flex justify-between"><span className="text-text3">Chats</span><span className="font-semibold text-text">{c.chat_count}</span></div>
              <div className="flex justify-between"><span className="text-text3">Agents</span><span className="font-semibold text-text">{c.agent_count}</span></div>
              <div className="flex justify-between"><span className="text-text3">Invites</span><span className="font-semibold text-text">{s.invitesSent} sent · {s.invitesConverted} conv</span></div>
            </div>
            {c.active_sessions > 10 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="xs" className="w-full mt-3">Force Logout</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Force Logout</AlertDialogTitle>
                    <AlertDialogDescription>Destroy all {c.active_sessions} sessions?</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/80" onClick={handlePurge}>Force Logout</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function UserDetailPage() {
  return (
    <AdminShell>
      <UserDetailContent />
    </AdminShell>
  )
}
