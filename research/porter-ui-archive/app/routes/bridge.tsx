import { useState } from "react"
import { AppShell } from "~/components/layout/app-shell"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { useHealth, useDecisions } from "~/hooks/use-api"
import { api } from "~/lib/api"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  Route, Server, Database, Zap, ArrowRight, ChevronDown,
  ChevronRight, Loader2, Send, Clock, CheckCircle2, XCircle, Info,
} from "lucide-react"
import type { HealthBackend, TokenUsage, Decision } from "~/lib/types"

/* ── Status helpers ── */

const STATUS_COLOR: Record<string, string> = {
  up: "bg-success",
  down: "bg-danger",
  unknown: "bg-text3",
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/* ── Backend Row ── */

function BackendRow({ b, index }: { b: HealthBackend; index: number }) {
  return (
    <div
      className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 animate-list-stagger-in"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Priority number */}
      <span className="text-lg font-black text-text3/30 tabular-nums w-6 text-center">{index + 1}</span>

      {/* Status dot */}
      <span className={`size-2.5 rounded-full shrink-0 ${STATUS_COLOR[b.status] ?? STATUS_COLOR.unknown}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">{b.name}</p>
          <Badge className="text-[9px] px-1.5 py-0 bg-raised text-text3">{b.model}</Badge>
        </div>
        <p className="text-[10px] text-text3 truncate">{b.url}</p>
      </div>

      {/* Latency */}
      {b.latencyMs != null && (
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold tabular-nums ${b.latencyMs < 100 ? "text-success" : b.latencyMs < 500 ? "text-warning" : "text-danger"}`}>
            {b.latencyMs}ms
          </p>
          <p className="text-[9px] text-text3">latency</p>
        </div>
      )}

      {/* Status label */}
      <Badge className={`text-[9px] px-2 py-0.5 ${b.status === "up" ? "bg-success/15 text-success" : b.status === "down" ? "bg-danger/15 text-danger" : "bg-raised text-text3"}`}>
        {b.status === "up" ? "Online" : b.status === "down" ? "Offline" : "Unknown"}
      </Badge>
    </div>
  )
}

/* ── Test Prompt ── */

function TestPrompt() {
  const [prompt, setPrompt] = useState("")
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ backend?: string; response?: string; error?: string } | null>(null)

  async function handleTest() {
    if (!prompt.trim() || testing) return
    setTesting(true)
    setResult(null)
    try {
      const res = await api<{ done: boolean; backend?: string; full_response?: string }>("/api/v1/chat/stream", {
        method: "POST",
        json: { message: prompt, backend: "auto" },
      })
      setResult({ backend: res.backend ?? "auto", response: res.full_response ?? "(streamed)" })
    } catch (e: unknown) {
      setResult({ error: e instanceof Error ? e.message : "Failed" })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Send className="size-3 text-accent-porter" />
        Test Bridge
      </h2>
      <p className="text-[11px] text-text3">Send a prompt through Porter Bridge — see which backend handles it.</p>
      <div className="flex gap-2">
        <Input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Type a test prompt..."
          className="flex-1 bg-raised border-border text-foreground text-xs"
          onKeyDown={e => e.key === "Enter" && handleTest()}
        />
        <Button
          onClick={handleTest}
          disabled={!prompt.trim() || testing}
          className="bg-accent-porter text-white hover:bg-accent-hover text-xs px-4"
          size="sm"
        >
          {testing ? <Loader2 className="size-3 animate-spin" /> : "Route"}
        </Button>
      </div>

      {result && (
        <div className={`rounded-lg border p-3 text-xs animate-page-fade-slide ${result.error ? "border-danger/30 bg-danger/5" : "border-success/30 bg-success/5"}`}>
          {result.error ? (
            <div className="flex items-center gap-2 text-danger">
              <XCircle className="size-3.5 shrink-0" />
              <span>{result.error}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-success shrink-0" />
                <span className="text-success font-medium">Routed to: {result.backend}</span>
              </div>
              {result.response && (
                <p className="text-text2 pl-5 truncate">{result.response.slice(0, 200)}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Decision Feed ── */

function DecisionFeed({ decisions }: { decisions: Decision[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (!decisions.length) {
    return (
      <div className="py-8 text-center">
        <Info className="size-8 mx-auto mb-2 text-text3/30" />
        <p className="text-xs text-text3">No routing decisions yet. Send a message through Porter to see decisions here.</p>
      </div>
    )
  }

  return (
    <div className="animated-list space-y-1.5">
      {decisions.map(d => {
        const isOpen = expanded.has(d.id)
        return (
          <button
            key={d.id}
            onClick={() => setExpanded(prev => {
              const next = new Set(prev)
              isOpen ? next.delete(d.id) : next.add(d.id)
              return next
            })}
            className="w-full text-left rounded-lg border border-border bg-surface px-3 py-2 hover:bg-raised transition-colors"
          >
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="size-3 text-text3 shrink-0" /> : <ChevronRight className="size-3 text-text3 shrink-0" />}
              <ArrowRight className="size-3 text-accent-porter shrink-0" />
              <span className="text-xs font-medium text-foreground flex-1 truncate">
                {d.chosen}
              </span>
              <Badge className="text-[9px] px-1.5 py-0 bg-accent-porter/10 text-accent-porter shrink-0">{d.decision_type}</Badge>
              <span className="text-[9px] text-text3 shrink-0 tabular-nums">{timeAgo(d.created_at)}</span>
            </div>
            {isOpen && (
              <div className="mt-2 pl-5 space-y-1 animate-page-fade-slide">
                <p className="text-[11px] text-text2">{d.reasoning}</p>
                {d.alternatives?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-[9px] text-text3">Also considered:</span>
                    {d.alternatives.map((a, i) => (
                      <Badge key={i} className="text-[9px] px-1.5 py-0 bg-raised text-text3">{a}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ── Token Usage ── */

function TokenSummary({ usage }: { usage: TokenUsage[] }) {
  if (!usage.length) return null

  const totalIn = usage.reduce((s, u) => s + u.total_input, 0)
  const totalOut = usage.reduce((s, u) => s + u.total_output, 0)
  const totalReqs = usage.reduce((s, u) => s + u.total_requests, 0)
  const maxTokens = Math.max(...usage.map(u => u.total_input + u.total_output), 1)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">Input</p>
          <p className="text-lg font-black text-foreground">{formatTokens(totalIn)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">Output</p>
          <p className="text-lg font-black text-foreground">{formatTokens(totalOut)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-text3">Requests</p>
          <p className="text-lg font-black text-foreground">{totalReqs.toLocaleString()}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {usage.map(u => {
          const total = u.total_input + u.total_output
          const pct = Math.round((total / maxTokens) * 100)
          return (
            <div key={u.model} className="rounded-lg border border-border bg-surface px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-foreground">{u.model}</p>
                <p className="text-xs font-bold text-foreground tabular-nums">{formatTokens(total)}</p>
              </div>
              <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                <div className="h-full rounded-full bg-accent-porter transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[9px] text-text3 mt-1">{formatTokens(u.total_input)} in · {formatTokens(u.total_output)} out · {u.total_requests} req</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main Page ── */

export default function BridgePage() {
  const { data: health, isLoading } = useHealth()
  const { data: decisionsData } = useDecisions(20)

  const backends = (health?.backends ?? []) as HealthBackend[]
  const db = health?.database as { engine?: string; status: string; latencyMs: number | null } | undefined
  const tokenUsage = (health?.tokenUsage ?? []) as TokenUsage[]
  const decisions = (decisionsData?.decisions ?? []) as Decision[]

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[960px] space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-9 rounded-lg bg-accent-porter/10">
              <Route className="size-5 text-accent-porter" />
            </div>
            <div>
              <p className="text-xs text-text3">All model calls route through Porter. One bridge, many backends.</p>
            </div>
            {db && (
              <div className="ml-auto flex items-center gap-2">
                <Database className="size-3.5 text-text3" />
                <span className="text-[10px] text-text3">{db.engine ?? "PostgreSQL"}</span>
                <span className={`size-2 rounded-full ${STATUS_COLOR[db.status] ?? STATUS_COLOR.unknown}`} />
                {db.latencyMs != null && <span className="text-[10px] text-success tabular-nums">{db.latencyMs}ms</span>}
              </div>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center gap-2 py-12 justify-center text-text3">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-xs">Probing backends...</span>
            </div>
          )}

          {/* Routing Chain */}
          {backends.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Server className="size-3 text-text3" />
                Routing Priority
              </h2>
              <p className="text-[11px] text-text3 mb-1">Porter routes requests top-down. First available backend handles the call.</p>
              <div className="space-y-1.5">
                {backends.map((b, i) => (
                  <BackendRow key={b.name} b={b} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Porter avatar + explanation */}
          <Card className="border-accent-porter/20 bg-accent-porter/3">
            <CardContent className="flex items-start gap-3 py-4">
              <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="short" size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-accent-porter mb-1">How Porter Bridge Works</p>
                <p className="text-[11px] text-text2 leading-relaxed">
                  Every AI request goes through me. I pick the best backend based on the task —
                  fast local inference via Ollama for simple queries, GPT-5.4 via OpenClaw for complex reasoning.
                  If one backend is down, I automatically fail over to the next. You never think about models — I handle it.
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator className="bg-border" />

          {/* Test Prompt */}
          <TestPrompt />

          <Separator className="bg-border" />

          {/* Token Usage */}
          {tokenUsage.length > 0 && (
            <>
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Zap className="size-3 text-warning" />
                  Token Usage
                </h2>
                <TokenSummary usage={tokenUsage} />
              </div>
              <Separator className="bg-border" />
            </>
          )}

          {/* Decision Log */}
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
              <Clock className="size-3 text-text3" />
              Routing Decisions
            </h2>
            <DecisionFeed decisions={decisions} />
          </div>

        </div>
      </div>
    </AppShell>
  )
}
