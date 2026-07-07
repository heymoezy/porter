/**
 * Brain — Porter's memory, learning, and flow in ONE screen (v6.31.0).
 *
 * Replaces Intelligence + Dreams + Recall + Learnings (Moe 2026-06-10: "junk
 * screens that mean nothing to me and should probably all be combined").
 * Organised around three questions:
 *   WHAT does Porter know?   → memory browser (Rules / Knowledge / Episodes)
 *   WHAT is it learning?     → review queue (dream proposals + candidates,
 *                              duplicates grouped, bulk actions)
 *   WHO is it feeding?       → synapse feed (live memory events: recalls,
 *                              writes, corrections, sessions) + flow metrics
 *
 * Viewport-locked; every number is a real query (zero = genuinely zero).
 */
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { AnimCount } from "~/components/ui/anim-count"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
import { LLMTerminal } from "~/components/llm-terminal"
import { Check, X, Play, Shield, Lightbulb, BookOpen, Sparkles } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────

interface BrainSummary {
  directives_active: number
  agent_learned_rules: number
  concepts_active: number
  episodes_total: number
  episodes_24h: number
  proposals_pending: number
  candidates_pending: number
  recalls_24h: number
  memory_writes_24h: number
  corrections_24h: number
}

interface MemoryRow {
  id: string
  scope: string
  scope_id: string | null
  content: string
  priority?: number
  source_type?: string
  trust_tier?: string
  use_count?: number
  gateway?: string
  created_at: number
}

interface Proposal {
  id: string
  proposal_kind: string
  proposed_content: string
  status: string
  created_at?: number
}

interface Candidate {
  id: string
  content: string
  priority: number
  created_at: number
}

interface FeedEvent {
  id: string
  event_type: string
  source_type: string
  details_json: Record<string, unknown>
  created_at: number
}

// ── Helpers ────────────────────────────────────────────────────────────

const fmtAge = (epoch: number) => {
  const s = Math.max(0, Math.round(Date.now() / 1000 - epoch))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

/** Group near-duplicate proposals (the queue rots with ~30 copies of one rule). */
function groupProposals(rows: Proposal[]): Array<{ key: string; content: string; kind: string; ids: string[] }> {
  const groups = new Map<string, { key: string; content: string; kind: string; ids: string[] }>()
  for (const p of rows) {
    const norm = p.proposed_content.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").slice(0, 120)
    const g = groups.get(norm)
    if (g) g.ids.push(p.id)
    else groups.set(norm, { key: norm, content: p.proposed_content, kind: p.proposal_kind, ids: [p.id] })
  }
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length)
}

const FEED_STYLE: Record<string, { color: string; label: string }> = {
  agent_memory_recall: { color: "text-chart-2",       label: "recall" },
  agent_memory_write:  { color: "text-success",       label: "write" },
  "correction.detected": { color: "text-warning",     label: "correction" },
  "session.end":       { color: "text-accent-porter", label: "session" },
}

function feedLine(e: FeedEvent): { text: string; color: string } {
  const t = new Date(e.created_at * 1000).toLocaleTimeString("en-SG", { hour12: false, timeZone: "Asia/Singapore" })
  const st = FEED_STYLE[e.event_type] ?? { color: "text-text3", label: e.event_type.replace(/[._]/g, " ") }
  const d = e.details_json ?? {}
  let detail = ""
  if (e.event_type === "agent_memory_recall") detail = `${d.agent ?? ""} « ${String(d.q ?? "").slice(0, 60)} » ${d.hits ?? 0} hits`
  else if (e.event_type === "agent_memory_write") detail = `${d.agent ?? ""} ${d.kind ?? ""}: ${String(d.preview ?? "").slice(0, 70)}`
  else detail = String((d as { summary?: string; userMessage?: string; preview?: string }).summary ?? (d as { userMessage?: string }).userMessage ?? (d as { preview?: string }).preview ?? "").slice(0, 80)
  return { text: `${t} ${st.label} ${detail}`.trimEnd(), color: st.color }
}

const KIND_TABS = [
  { key: "rules", label: "Rules", icon: Shield },
  { key: "knowledge", label: "Knowledge", icon: Lightbulb },
  { key: "episodes", label: "Episodes", icon: BookOpen },
] as const

// ── Screen ─────────────────────────────────────────────────────────────

export default function BrainPage() {
  const qc = useQueryClient()
  const [kind, setKind] = useState<"rules" | "knowledge" | "episodes">("rules")
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const summaryQ = useQuery({
    queryKey: ["brain", "summary"],
    queryFn: () => api<BrainSummary>("/api/admin/brain/summary"),
    refetchInterval: 15_000,
  })
  const memoryQ = useQuery({
    queryKey: ["brain", "memory", kind, search, scope],
    queryFn: () => api<{ rows: MemoryRow[] }>(`/api/admin/brain/memory?kind=${kind}&q=${encodeURIComponent(search)}&scope=${scope}`),
  })
  const feedQ = useQuery({
    queryKey: ["brain", "feed"],
    queryFn: () => api<{ events: FeedEvent[] }>("/api/admin/brain/feed?limit=40"),
    refetchInterval: 5_000,
  })
  const proposalsQ = useQuery({
    queryKey: ["admin", "dreams", "proposals"],
    queryFn: () => api<{ proposals: Proposal[] }>("/api/admin/dreams/proposals?status=pending&limit=200"),
    refetchInterval: 30_000,
  })
  const candidatesQ = useQuery({
    queryKey: ["brain", "candidates"],
    queryFn: () => api<{ candidates: Candidate[] }>("/api/v1/intellect/candidates"),
    refetchInterval: 30_000,
  })

  const s = summaryQ.data
  const rows = memoryQ.data?.rows ?? []
  const groups = useMemo(() => groupProposals(proposalsQ.data?.proposals ?? []), [proposalsQ.data])
  const candidates = candidatesQ.data?.candidates ?? []
  const feedLines = useMemo(() => {
    const evs = (feedQ.data?.events ?? []).slice().reverse()
    return evs.map((e, i) => ({ ...feedLine(e), _key: i }))
  }, [feedQ.data])

  const proposalAction = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: "accept" | "reject" }) => {
      for (const id of ids) await api(`/api/admin/dreams/proposals/${id}/${action}`, { method: "POST" })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "dreams", "proposals"] }),
  })
  const candidateAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "accept" | "reject" }) =>
      api(`/api/v1/intellect/candidates/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain", "candidates"] })
      qc.invalidateQueries({ queryKey: ["brain", "summary"] })
    },
  })
  const runDream = useMutation({
    mutationFn: () => api("/api/v1/intellect/dream-run", { method: "POST", json: { triggered_by: "admin-brain" } }),
  })

  const reviewTotal = (s?.proposals_pending ?? 0) + (s?.candidates_pending ?? 0)

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4 animate-page-fade-slide">
      {/* ── Flow metrics strip ── */}
      <div className="grid shrink-0 grid-cols-6 gap-2">
        {[
          { label: "Rules", value: s?.directives_active, sub: s ? `${s.agent_learned_rules} agent-learned` : "" },
          { label: "Knowledge", value: s?.concepts_active, sub: "active concepts" },
          { label: "Episodes", value: s?.episodes_total, sub: s ? `+${s.episodes_24h} today` : "" },
          { label: "To review", value: reviewTotal, sub: s ? `${s.proposals_pending} dreams · ${s.candidates_pending} candidates` : "", warn: reviewTotal > 0 },
          { label: "Recalls 24h", value: s?.recalls_24h, sub: "agents reading memory" },
          { label: "Writes 24h", value: s?.memory_writes_24h, sub: "memories formed" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)]">
            <p className={`text-lg font-bold leading-none tabular-nums ${(m as { warn?: boolean }).warn ? "text-warning" : "text-text"}`}>
              {m.value == null ? "—" : <AnimCount to={m.value} />}
            </p>
            <p className="mt-1 text-2xs uppercase tracking-wider text-text3">{m.label}</p>
            {m.sub && <p className="text-2xs text-text3">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Body: synapse feed | memory browser | learning queue ── */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
        {/* Synapse feed — the live navy strip */}
        <div className="col-span-3 flex min-h-0 flex-col">
          <LLMTerminal
            lines={feedLines.length ? feedLines : [{ text: "no memory flow yet — recalls, writes and corrections stream here", color: "text-text3", _key: 0 }]}
            title="Synapse Feed"
            pulse={feedLines.length > 0}
            className="h-full"
          />
        </div>

        {/* Memory browser */}
        <div className="col-span-5 flex min-h-0 flex-col rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            {KIND_TABS.map(t => {
              const Icon = t.icon
              const active = kind === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => { setKind(t.key); setExpanded(null) }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:bg-raised hover:text-text2"
                  }`}
                >
                  <Icon className="size-3" /> {t.label}
                </button>
              )
            })}
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search memory…"
              className="ml-auto h-7 w-44 text-xs"
            />
            <select
              value={scope}
              onChange={e => setScope(e.target.value)}
              className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-text2"
            >
              <option value="">all scopes</option>
              <option value="agent">agent</option>
              <option value="project">project</option>
              <option value="workspace">workspace</option>
              <option value="global">global</option>
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {memoryQ.isError && <p className="px-3 py-4 text-xs text-danger">query failed</p>}
            {!memoryQ.isError && rows.length === 0 && <p className="px-3 py-4 text-xs text-text3">nothing matches</p>}
            {rows.map(r => (
              <button
                key={r.id}
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="block w-full border-b border-border/60 px-3 py-1.5 text-left transition-colors hover:bg-raised/50"
              >
                <div className="flex items-baseline gap-2">
                  <p className={`min-w-0 flex-1 text-xs text-text ${expanded === r.id ? "" : "truncate"}`}>{r.content}</p>
                  <span className="shrink-0 text-2xs tabular-nums text-text3">{fmtAge(r.created_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-2xs text-text3">
                  <span className="rounded bg-raised px-1">{r.scope}{r.scope_id ? `:${r.scope_id}` : ""}</span>
                  {r.source_type && <span>{r.source_type}</span>}
                  {r.priority != null && <span>p{r.priority}</span>}
                  {r.trust_tier && <span>{r.trust_tier} trust</span>}
                  {r.use_count != null && r.use_count > 0 && <span>used ×{r.use_count}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Learning queue */}
        <div className="col-span-4 flex min-h-0 flex-col rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <Sparkles className="size-3.5 text-accent-porter" />
            <p className="text-xs font-semibold text-text">Learning queue</p>
            <span className="text-2xs text-text3">{groups.length} proposals · {candidates.length} candidates</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 gap-1 px-2 text-2xs"
              disabled={runDream.isPending}
              onClick={() => runDream.mutate()}
            >
              <Play className="size-3" /> {runDream.isPending ? "dreaming…" : "Run dream"}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {groups.length === 0 && candidates.length === 0 && (
              <p className="px-3 py-4 text-xs text-text3">queue clear — nothing waiting for review</p>
            )}
            {groups.map(g => (
              <div key={g.key} className="border-b border-border/60 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-accent-porter/10 px-1 text-2xs font-medium text-accent-porter">{g.kind.replace("_", " ")}</span>
                  {g.ids.length > 1 && <span className="mt-0.5 shrink-0 rounded bg-warning/15 px-1 text-2xs font-semibold text-warning">×{g.ids.length}</span>}
                  <p className="min-w-0 flex-1 text-xs leading-snug text-text">{g.content}</p>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    disabled={proposalAction.isPending}
                    onClick={() => proposalAction.mutate({ ids: [g.ids[0]], action: "accept" })}
                    className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-2xs font-medium text-success transition-colors hover:bg-success/20"
                  >
                    <Check className="size-3" /> Accept
                  </button>
                  <button
                    disabled={proposalAction.isPending}
                    onClick={() => proposalAction.mutate({ ids: g.ids, action: "reject" })}
                    className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-2xs font-medium text-danger transition-colors hover:bg-danger/20"
                  >
                    <X className="size-3" /> Reject{g.ids.length > 1 ? ` all ${g.ids.length}` : ""}
                  </button>
                  {g.ids.length > 1 && (
                    <button
                      disabled={proposalAction.isPending}
                      onClick={() => proposalAction.mutate({ ids: g.ids.slice(1), action: "reject" })}
                      className="rounded-md px-2 py-0.5 text-2xs text-text3 transition-colors hover:bg-raised hover:text-text2"
                      title="Keep one copy pending, reject the duplicates"
                    >
                      dedupe
                    </button>
                  )}
                </div>
              </div>
            ))}
            {candidates.length > 0 && (
              <p className="px-3 pt-2 text-2xs font-semibold uppercase tracking-wider text-text3">Correction candidates</p>
            )}
            {candidates.map(c => (
              <div key={c.id} className="border-b border-border/60 px-3 py-2">
                <p className="text-xs leading-snug text-text">{c.content}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    disabled={candidateAction.isPending}
                    onClick={() => candidateAction.mutate({ id: c.id, action: "accept" })}
                    className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-2xs font-medium text-success transition-colors hover:bg-success/20"
                  >
                    <Check className="size-3" /> Promote
                  </button>
                  <button
                    disabled={candidateAction.isPending}
                    onClick={() => candidateAction.mutate({ id: c.id, action: "reject" })}
                    className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-2xs font-medium text-danger transition-colors hover:bg-danger/20"
                  >
                    <X className="size-3" /> Dismiss
                  </button>
                  <span className="ml-auto text-2xs text-text3">{fmtAge(c.created_at)} ago</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
