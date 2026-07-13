/**
 * #27 R4 — the Vault, promoted from a file browser to the actual engine.
 *
 * Council design: "R4 — Promote Vault: schemas/nodes/placements/edges/artifacts/scopes/search."
 *
 * The vault engine has been running for weeks and NOTHING could see what it was doing.
 * Two facts were invisible until this page existed, and both matter:
 *
 *   1. REVIEW BACKLOG — the AI proposes a placement for every item it ingests, and a human
 *      is supposed to accept or re-file it. 4,900 proposals had accumulated and none had
 *      ever been reviewed, because accept/refile only worked BY ID and nothing could
 *      enumerate the queue. You cannot accept what you cannot list.
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
  }
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
  { key: "review", label: "Review queue", icon: Check },
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
              title={`${num(ov.placements.byState.proposed)} placements proposed by the AI, none reviewed`}
              body={
                ov.placements.proposedWithoutConfidence === ov.placements.byState.proposed
                  ? "Every one carries NO confidence score, so the queue can't be triaged by trusting the confident ones — the association engine proposes without scoring. Review them below, or fix the engine to score them."
                  : `${num(ov.placements.proposedWithoutConfidence)} of them carry no confidence score.`
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

/** The review queue. accept = keep the AI's parent; nothing is ever deleted (the incumbent is archived). */
function ReviewTab({ types }: { types: string[] }) {
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [type, setType] = useState("")
  const [confirming, setConfirming] = useState(false)
  const LIMIT = 25

  const { data, isLoading } = useQuery({
    queryKey: ["v1", "vault", "placements", SCOPE, type, offset],
    queryFn: () =>
      api<{ total: number; placements: Placement[] }>(
        `/api/v1/vault/placements?scope=${SCOPE}&state=proposed&limit=${LIMIT}&offset=${offset}` +
          (type ? `&type=${encodeURIComponent(type)}` : ""),
      ),
  })

  const accept = useMutation({
    mutationFn: (id: string) => api(`/api/v1/vault/placements/${id}/accept`, { method: "POST" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["v1", "vault"] }) },
  })

  const bulk = useMutation({
    mutationFn: (vars: { type: string; expect: number }) =>
      api<{ accepted: number; skipped: unknown[] }>(`/api/v1/vault/placements/bulk-accept`, {
        method: "POST",
        json: { app_scope: SCOPE, type: vars.type, expect: vars.expect },
      }),
    onSuccess: () => {
      setConfirming(false)
      void qc.invalidateQueries({ queryKey: ["v1", "vault"] })
    },
  })

  const total = data?.total ?? 0
  const rows = data?.placements ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>
            Proposed placements
            <span className="text-text3 font-normal ml-1.5 text-xs">
              {num(total)} awaiting a human — accept keeps the AI&apos;s parent, nothing is ever deleted
            </span>
          </span>
          <span className="flex items-center gap-1">
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setOffset(0); setConfirming(false) }}
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
        {/* Bulk accept is deliberately type-scoped: you accept one KIND of thing at a time,
            having actually looked at that kind. "Accept everything" is how you rubber-stamp
            thousands of AI guesses by accident. The count is echoed back to the server, which
            refuses if the set moved since you looked. */}
        {type && total > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded border border-border bg-raised/40 p-2">
            {!confirming ? (
              <>
                <span className="text-xs text-text2 flex-1">
                  Accept all <strong className="text-foreground">{num(total)}</strong> proposed{" "}
                  <strong className="text-foreground">{type}</strong> placements, as the AI filed them?
                </span>
                <Button size="sm" variant="ghost" className="h-6" onClick={() => setConfirming(true)}>Accept all {num(total)}</Button>
              </>
            ) : (
              <>
                <span className="text-xs text-text2 flex-1">
                  This accepts {num(total)} filings in one go. They can still be re-filed afterwards — nothing is deleted.
                </span>
                <Button size="sm" variant="ghost" className="h-6" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="h-6"
                  disabled={bulk.isPending}
                  onClick={() => bulk.mutate({ type, expect: total })}
                >
                  {bulk.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : `Yes, accept ${num(total)}`}
                </Button>
              </>
            )}
          </div>
        )}
        {bulk.isError && (
          <p className="mb-2 text-2xs text-danger">{(bulk.error as Error).message}</p>
        )}
        {bulk.isSuccess && (
          <p className="mb-2 text-2xs text-emerald-400">
            Accepted {num(bulk.data.accepted)}{bulk.data.skipped.length > 0 ? `, skipped ${num(bulk.data.skipped.length)} that failed validation` : ""}.
          </p>
        )}

        {isLoading && <p className="text-xs text-text3">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-xs text-text3">Nothing awaiting review. The queue is clear.</p>
        )}
        <div className="space-y-0.5">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40">
              <Badge className="text-2xs bg-raised text-text3 shrink-0">{p.type}</Badge>
              <span className="text-foreground truncate flex-1" title={p.title}>{p.title}</span>
              <CornerUpRight className="h-3 w-3 text-text3 shrink-0" />
              <span className="text-text2 truncate w-40 shrink-0" title={p.parent_title ?? ""}>
                {p.parent_title ?? <span className="text-text3">— no parent —</span>}
              </span>
              <span className="text-2xs text-text3 w-16 shrink-0">
                {p.confidence === null ? "no score" : p.confidence.toFixed(2)}
              </span>
              <Button
                size="sm" variant="ghost" className="h-6 px-2 shrink-0"
                disabled={accept.isPending}
                onClick={() => accept.mutate(p.id)}
              >
                {accept.isPending && accept.variables === p.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Check className="h-3 w-3" />}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-2xs text-text3 mt-2">
          Showing {rows.length ? offset + 1 : 0}–{offset + rows.length} of {num(total)}.
        </p>
      </CardContent>
    </Card>
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
