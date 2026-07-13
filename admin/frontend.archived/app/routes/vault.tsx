/**
 * #27 R4 — the Vault, promoted from a file browser to the actual engine.
 *
 * Council design: "R4 — Promote Vault: schemas/nodes/placements/edges/artifacts/scopes/search."
 *
 * The vault engine has been running for weeks and NOTHING could see what it was doing.
 * Two facts were invisible until this page existed, and both matter:
 *
 *   1. REVIEW BACKLOG — 4,900 placements had accumulated with nobody ever reviewing them,
 *      because accept/refile only worked BY ID and nothing could enumerate the queue. You
 *      cannot accept what you cannot list.
 *
 *      NOTE (corrected in 6.100.0): these are NOT AI proposals. This file originally said
 *      "the AI proposes a placement for every item it ingests" — that was wrong, and it was
 *      wrong because I read the `proposed_by` column instead of the code. resolveProposedParentId
 *      is a deterministic PASS-THROUGH STUB; no classifier has ever run. Every one of these is
 *      the calling app's OWN declared hierarchy. It is not a pile of machine guesses awaiting
 *      judgement — it is ymc's existing structure awaiting confirmation, which is a different
 *      decision entirely.
 *
 *   2. DERIVATIVE COVERAGE — the raw→markdown sweep is capped at 25 model calls per 24h
 *      (a deliberate cost bound). It looks healthy: it does its 25 every day. But with a
 *      backlog of thousands, the ETA runs to months. That cap is a COST decision, and it
 *      should be made with the number in front of you rather than discovered a quarter later.
 *
 * Everything here is a COUNT over a real table. The one computed value (ETA) is labelled
 * as arithmetic, not a prediction. Additive: no existing route is removed.
 */
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Library, Boxes, Layers, GitBranch, FileStack, Clock,
  AlertTriangle, Check, CornerUpRight, Loader2,
} from "lucide-react"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"

/* ── Types (mirror backend/src/routes/v1/vault.ts) ── */

interface VaultScope {
  id: string
  scope_kind: string
  parent_scope_id: string | null
  label: string
}

interface Overview {
  scope: string | null
  scopes: VaultScope[]
  schema: { app_scope: string; type_count: number } | null
  nodes: Array<{ app_scope: string; layer: string; type: string; count: number }>
  nodeTotal: number
  edges: Array<{ kind: string; count: number }>
  artifacts: Array<{ kind: string; count: number }>
  placements: {
    byState: Record<string, number>
    proposedWithoutConfidence: number
    byProvenance: Record<string, number>
  }
  classifier: { active: boolean; note: string }
  derivatives: {
    byStatus: Record<string, number>
    total: number
    generated: number
    missing: number
    coveragePct: number
    batchLimitPerSweep: number
    sweepIntervalHours: number
    etaDays: number
  }
}

interface EdgeWhy { rule: string; sourceTable: string | null; sourceId: string | null; note: string | null }
interface Explain {
  node: { id: string; type: string; layer: string; title: string; status: string }
  placements: Array<{ id: string; state: string; parent_title: string | null; proposed_by: string | null; reviewed_by: string | null }>
  edges: Array<{ id: string; kind: string; direction: string; other_id: string; other_title: string; other_type: string; why: EdgeWhy | null }>
  artifacts: Array<{ id: string; kind: string; path: string | null; source_system: string | null }>
}

interface Placement {
  id: string
  node_id: string
  parent_id: string | null
  layer: string
  state: string
  confidence: number | null
  proposed_by: string | null
  type: string
  title: string
  parent_title: string | null
  parent_type: string | null
}

const SCOPE = "ymc" // the only app scope with a registered schema today

type Tab = "overview" | "schema" | "review" | "structure" | "derivatives"

const TABS: Array<{ key: Tab; label: string; icon: typeof Boxes }> = [
  { key: "overview", label: "Overview", icon: Boxes },
  { key: "schema", label: "Schema", icon: Layers },
  { key: "review", label: "Inspector", icon: Check },
  { key: "structure", label: "Structure", icon: GitBranch },
  { key: "derivatives", label: "Derivatives", icon: FileStack },
]

function num(n: number): string {
  return n.toLocaleString("en-US")
}

export default function VaultPage() {
  const [tab, setTab] = useState<Tab>("overview")

  const { data: ov, isLoading } = useQuery({
    queryKey: ["v1", "vault", "overview", SCOPE],
    // NOTE: api() already unwraps the { data } envelope — do NOT unwrap it a second time.
    queryFn: () => api<Overview>(`/api/v1/vault/overview?scope=${SCOPE}`),
    staleTime: 30_000,
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Library className="h-4 w-4 text-accent-porter" />
        <h1 className="text-base font-semibold text-foreground">Vault</h1>
        <Badge className="text-2xs bg-raised text-text3">scope: {SCOPE}</Badge>
      </div>

      {/* The two things that were invisible. Loud, because they should be. */}
      {ov && (ov.placements.byState.proposed > 0 || ov.derivatives.missing > 0) && (
        <div className="space-y-2">
          {ov.placements.byState.proposed > 0 && (
            <Alert
              title={`${num(ov.placements.byState.proposed)} placements awaiting review — and no AI ever filed them`}
              body={
                ov.classifier.active
                  ? `${num(ov.placements.proposedWithoutConfidence)} of them carry no confidence score.`
                  : "These were recorded as AI proposals. They are not. The auto-association classifier has never been built — it is a pass-through stub, so every one of these is the app's OWN declared hierarchy, and nothing was ever scored. That matters: this is not a pile of machine guesses needing your judgement, it is ymc's existing structure waiting to be confirmed."
              }
            />
          )}
          {ov.derivatives.etaDays > 30 && (
            <Alert
              title={`Derivatives are ${ov.derivatives.coveragePct}% covered — ETA ${num(ov.derivatives.etaDays)} days at the current cap`}
              body={`${num(ov.derivatives.missing)} raw files have no markdown derivative. The sweep does ${ov.derivatives.batchLimitPerSweep} model calls every ${ov.derivatives.sweepIntervalHours}h — that is a deliberate cost bound, not a bug. It looks healthy because it does its ${ov.derivatives.batchLimitPerSweep} a day. Raising the cap costs model spend; that is a decision, not a default.`}
            />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-accent-porter text-accent-porter font-medium"
                : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.key === "review" && ov && ov.placements.byState.proposed > 0 && (
              <Badge className="bg-warning text-white text-2xs px-1 ml-0.5">
                {num(ov.placements.byState.proposed)}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-xs text-text3">Loading…</p>}
      {!isLoading && !ov && (
        <p className="text-xs text-text3">Vault unreachable. Nothing is being hidden — Porter just isn't answering.</p>
      )}

      {ov && tab === "overview" && <OverviewTab ov={ov} />}
      {ov && tab === "schema" && <SchemaTab ov={ov} />}
      {tab === "review" && <ReviewTab types={ov ? [...new Set(ov.nodes.map((n) => n.type))].sort() : []} />}
      {ov && tab === "structure" && <StructureTab ov={ov} />}
      {ov && tab === "derivatives" && <DerivativesTab ov={ov} />}
    </div>
  )
}

function Alert({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
      <div>
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-2xs text-text2 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-2xs uppercase tracking-wide text-text3">{label}</p>
        <p className="text-xl font-semibold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-2xs text-text3 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function OverviewTab({ ov }: { ov: Overview }) {
  const d = ov.derivatives
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Nodes" value={num(ov.nodeTotal)} sub={`${ov.schema?.type_count ?? 0} registered types`} />
        <Stat
          label="Placed (active)"
          value={num(ov.placements.byState.active ?? 0)}
          sub={`${num(ov.placements.byState.proposed ?? 0)} awaiting review`}
        />
        <Stat label="Edges" value={num(ov.edges.reduce((a, e) => a + e.count, 0))} sub={`${ov.edges.length} kinds`} />
        <Stat
          label="Derivative coverage"
          value={`${d.coveragePct}%`}
          sub={`${num(d.generated)} of ${num(d.total)}`}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Scopes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {ov.scopes.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              <Badge className="text-2xs bg-raised text-text2">{s.scope_kind}</Badge>
              <span className="text-foreground font-medium">{s.id}</span>
              <span className="text-text3">{s.label}</span>
              {s.parent_scope_id && <span className="text-2xs text-text3">↳ under {s.parent_scope_id}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nodes by type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
            {ov.nodes.slice(0, 15).map((n) => (
              <div key={`${n.layer}-${n.type}`} className="flex items-center justify-between text-xs">
                <span className="text-text2 truncate">
                  {n.type}
                  <span className="text-text3 text-2xs ml-1">({n.layer})</span>
                </span>
                <span className="text-foreground tabular-nums">{num(n.count)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SchemaTab({ ov }: { ov: Overview }) {
  const { data } = useQuery({
    queryKey: ["v1", "vault", "schema", SCOPE],
    queryFn: () =>
      api<{ nodeTypes: Array<{ type: string; layer: string; parent_types?: string[]; parentTypes?: string[] }> }>(
        `/api/v1/vault/schema?scope=${SCOPE}`,
      ),
    staleTime: 60_000,
  })
  const types = data?.nodeTypes ?? []
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Registered node types
          <span className="text-text3 font-normal ml-1.5 text-xs">
            {types.length || ov.schema?.type_count || 0} declared by the app, not hardcoded in Porter
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {types.length === 0 ? (
          <p className="text-xs text-text3">No schema registered for this scope.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {types.map((t) => {
              const parents = t.parentTypes ?? t.parent_types ?? []
              return (
                <div key={t.type} className="flex items-baseline gap-2 text-xs border-b border-border/40 py-1">
                  <Badge className={`text-2xs ${t.layer === "learning" ? "bg-accent-porter/15 text-accent-porter" : "bg-raised text-text2"}`}>
                    {t.layer}
                  </Badge>
                  <span className="text-foreground font-medium">{t.type}</span>
                  {parents.length > 0 && (
                    <span className="text-2xs text-text3 truncate">under {parents.join(", ")}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * THE INSPECTOR — step through the logic behind any item.
 *
 * This replaces the "review queue" I built, which was a governance gate that gated nothing (every
 * reader already treated `proposed` and `active` alike) and could not have answered the real
 * question anyway: 1,731 of the graph's 1,766 edges recorded NO reason at all.
 *
 * Moe's ask was to step through the logic and fix the weird associations. So: pick anything, see
 * where it is filed and who decided that, see every association it has AND WHY — the rule, the
 * source table, the exact row — and cut the wrong ones. Cutting an association removes only the
 * association; the documents and their filing are untouched.
 */
function ReviewTab({ types }: { types: string[] }) {
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [type, setType] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const LIMIT = 25

  const { data, isLoading } = useQuery({
    queryKey: ["v1", "vault", "placements", SCOPE, type, offset],
    queryFn: () =>
      api<{ total: number; placements: Placement[] }>(
        `/api/v1/vault/placements?scope=${SCOPE}&state=proposed&limit=${LIMIT}&offset=${offset}` +
          (type ? `&type=${encodeURIComponent(type)}` : ""),
      ),
  })

  const { data: explain, isLoading: explaining } = useQuery({
    queryKey: ["v1", "vault", "explain", selected],
    enabled: !!selected,
    queryFn: () => api<Explain>(`/api/v1/vault/nodes/${selected}/explain`),
  })

  const cut = useMutation({
    mutationFn: (edgeId: string) => api(`/api/v1/vault/edges/${edgeId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v1", "vault", "explain", selected] })
      void qc.invalidateQueries({ queryKey: ["v1", "vault", "overview", SCOPE] })
    },
  })

  const accept = useMutation({
    mutationFn: (id: string) => api(`/api/v1/vault/placements/${id}/accept`, { method: "POST" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["v1", "vault"] }) },
  })

  const total = data?.total ?? 0
  const rows = data?.placements ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* LEFT — pick anything */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span>
              Items
              <span className="text-text3 font-normal ml-1.5 text-xs">{num(total)} unconfirmed</span>
            </span>
            <span className="flex items-center gap-1">
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setOffset(0) }}
                className="h-7 rounded border border-border bg-surface px-2 text-xs text-text2"
              >
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Prev</Button>
              <Button size="sm" variant="ghost" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next</Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-xs text-text3">Loading…</p>}
          {!isLoading && rows.length === 0 && <p className="text-xs text-text3">Nothing here.</p>}
          <div className="space-y-0.5 max-h-[560px] overflow-y-auto scrollbar-thin">
            {rows.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.node_id)}
                className={`flex w-full items-center gap-2 text-xs py-1.5 px-1 border-b border-border/40 text-left transition-colors ${
                  selected === p.node_id ? "bg-accent-porter/10" : "hover:bg-raised/50"
                }`}
              >
                <Badge className="text-2xs bg-raised text-text3 shrink-0">{p.type}</Badge>
                <span className="text-foreground truncate flex-1" title={p.title}>{p.title}</span>
                <CornerUpRight className="h-3 w-3 text-text3 shrink-0" />
                <span className="text-text3 truncate w-28 shrink-0 text-2xs">{p.parent_title ?? "—"}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* RIGHT — why is it like this? */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Why is it like this?
            <span className="text-text3 font-normal ml-1.5 text-xs">
              every association, and the rule + row that caused it
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selected && <p className="text-xs text-text3">Pick anything on the left to step through its logic.</p>}
          {explaining && <p className="text-xs text-text3">Loading…</p>}
          {explain && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-foreground">{explain.node.title}</p>
                <p className="text-2xs text-text3">{explain.node.type} · {explain.node.layer}</p>
              </div>

              {explain.placements.map((p) => (
                <div key={p.id} className="rounded border border-border bg-raised/30 p-2">
                  <p className="text-2xs uppercase tracking-wide text-text3 mb-0.5">Filed under</p>
                  <p className="text-xs text-foreground">{p.parent_title ?? "— nothing —"}</p>
                  <p className="text-2xs text-text3 mt-0.5">
                    {p.state} · decided by {p.reviewed_by ?? p.proposed_by ?? "unknown"}
                    {p.proposed_by === "app" && " (the app's own hierarchy, not an AI)"}
                  </p>
                  {p.state === "proposed" && (
                    <Button size="sm" variant="ghost" className="h-6 mt-1 text-2xs" disabled={accept.isPending}
                      onClick={() => accept.mutate(p.id)}>
                      {accept.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm this filing"}
                    </Button>
                  )}
                </div>
              ))}

              <div>
                <p className="text-2xs uppercase tracking-wide text-text3 mb-1">
                  Associations ({explain.edges.length})
                </p>
                {explain.edges.length === 0 && <p className="text-xs text-text3">None.</p>}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-thin">
                  {explain.edges.map((e) => (
                    <div key={e.id} className="rounded border border-border p-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">
                            <span className="text-text3">{e.direction === "out" ? "→" : "←"} {e.kind}</span>{" "}
                            {e.other_title}
                          </p>
                          {e.why ? (
                            <>
                              <p className="text-2xs text-text2 mt-0.5">{e.why.note}</p>
                              <p className="text-2xs text-text3 mt-0.5 truncate" title={e.why.sourceId ?? ""}>
                                rule <span className="text-text2">{e.why.rule}</span>
                                {e.why.sourceTable && <> · from {e.why.sourceTable}</>}
                              </p>
                            </>
                          ) : (
                            <p className="text-2xs text-danger mt-0.5">No reason recorded — this cannot be audited.</p>
                          )}
                        </div>
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 shrink-0 text-2xs text-danger"
                          disabled={cut.isPending}
                          onClick={() => cut.mutate(e.id)}
                          title="Cut this association (the documents are untouched)"
                        >
                          {cut.isPending && cut.variables === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cut"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {explain.artifacts.length > 0 && (
                <div>
                  <p className="text-2xs uppercase tracking-wide text-text3 mb-1">Files ({explain.artifacts.length})</p>
                  {explain.artifacts.map((a) => (
                    <p key={a.id} className="text-2xs text-text3 truncate" title={a.path ?? ""}>
                      {a.kind} · {a.path ?? a.source_system}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StructureTab({ ov }: { ov: Overview }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Edges by kind</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {ov.edges.map((e) => (
            <div key={e.kind} className="flex items-center justify-between text-xs">
              <span className="text-text2">{e.kind}</span>
              <span className="text-foreground tabular-nums">{num(e.count)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Artifacts by kind</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {ov.artifacts.map((a) => (
            <div key={a.kind} className="flex items-center justify-between text-xs">
              <span className="text-text2">{a.kind}</span>
              <span className="text-foreground tabular-nums">{num(a.count)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function DerivativesTab({ ov }: { ov: Overview }) {
  const d = ov.derivatives
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Coverage" value={`${d.coveragePct}%`} sub={`${num(d.generated)} generated`} />
        <Stat label="Missing" value={num(d.missing)} />
        <Stat label="Failed" value={num(d.byStatus.failed ?? 0)} />
        <Stat
          label="ETA at current cap"
          value={d.etaDays > 0 ? `${num(d.etaDays)} d` : "—"}
          sub={`${d.batchLimitPerSweep}/sweep · every ${d.sweepIntervalHours}h`}
        />
      </div>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-text3 mt-0.5 shrink-0" />
            <p className="text-xs text-text2 leading-relaxed">
              The sweep converts raw files into markdown derivatives through Bridge. It is capped at{" "}
              <strong className="text-foreground">{d.batchLimitPerSweep} model calls per {d.sweepIntervalHours}h run</strong>{" "}
              — a deliberate cost bound. With {num(d.missing)} still missing, that is{" "}
              <strong className="text-foreground">{num(d.etaDays)} days</strong> to converge. It is not broken and it is
              not stalled: it does its {d.batchLimitPerSweep} every day, which is exactly why the backlog was invisible.
              Raising the cap trades model spend for speed.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
