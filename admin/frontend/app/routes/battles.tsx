import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { api } from "~/lib/api"
import {
  Swords, Trophy, Users, ChevronDown, ChevronRight,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface Battle {
  id: string
  challenger_id: string
  defender_id: string
  challenger_name: string | null
  defender_name: string | null
  prompt: string
  domain: string
  status: string
  winner_id: string | null
  judge_model: string | null
  challenger_elo_before: number | null
  defender_elo_before: number | null
  challenger_elo_after: number | null
  defender_elo_after: number | null
  created_at: number
  completed_at: number | null
}

interface LeaderboardEntry {
  template_id: string
  agent_name: string | null
  elo: number
  level: number
  xp: number
  quality: number
  speed: number
  efficiency: number
  reliability: number
  battle_count: number
  dispatch_count: number
  rarity: string
  agent_class: string
  stars: number
}

interface Bond {
  id: string
  agent_a_id: string
  agent_b_id: string
  agent_a_name: string | null
  agent_b_name: string | null
  chain_count: number
  success_count: number
  combo_score: number
  last_chained: number | null
  created_at: number
}

interface BattleRound {
  id: string
  round_num: number
  challenger_response: string | null
  defender_response: string | null
  challenger_tokens: number | null
  defender_tokens: number | null
  challenger_latency_ms: number | null
  defender_latency_ms: number | null
  round_winner: string | null
  created_at: number
}

interface BattleJudgment {
  id: string
  judge_model: string
  quality_score: number | null
  speed_score: number | null
  efficiency_score: number | null
  style_score: number | null
  rationale: string | null
  verdict: string | null
  confidence: number | null
  created_at: number
}

// ── Helpers ────────────────────────────────────────────

const statusColors: Record<string, string> = {
  pending: "bg-text3/10 text-text3",
  active: "bg-blue-500/10 text-blue-400",
  judging: "bg-yellow-500/10 text-yellow-400",
  complete: "bg-green-500/10 text-green-400",
  cancelled: "bg-red-500/10 text-red-400",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] ?? "bg-text3/10 text-text3"}`}>
      {status}
    </span>
  )
}

function EloDelta({ before, after }: { before: number | null; after: number | null }) {
  if (before == null || after == null) return <span className="text-text3">--</span>
  const delta = after - before
  if (delta === 0) return <span className="text-text3">0</span>
  return (
    <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  )
}

function formatDate(ts: number | null) {
  if (!ts) return "--"
  return new Date(ts * 1000).toLocaleString()
}

// ── Tabs ───────────────────────────────────────────────

type Tab = "battles" | "leaderboard" | "bonds"

// ── Battle Detail ──────────────────────────────────────

function BattleDetail({ battleId }: { battleId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["battle-detail", battleId],
    queryFn: () => api<{ data: { battle: Battle & { challenger_name: string; defender_name: string }; rounds: BattleRound[]; judgments: BattleJudgment[] } }>(`/api/admin/battles/${battleId}`).then(r => r.data),
  })

  if (isLoading) return <div className="text-text3 p-4">Loading...</div>
  if (!data?.battle) return <div className="text-text3 p-4">Battle not found</div>

  const { battle, rounds, judgments } = data

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          {battle.challenger_name ?? battle.challenger_id} vs {battle.defender_name ?? battle.defender_id}
        </h3>
        <StatusBadge status={battle.status} />
      </div>
      <p className="text-xs text-text2">{battle.prompt}</p>

      {rounds.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text3 mb-2">Rounds ({rounds.length})</h4>
          <div className="space-y-2">
            {rounds.map(r => (
              <div key={r.id} className="rounded border border-border p-3 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-text">Round {r.round_num}</span>
                  {r.round_winner && <span className="text-green-400">Winner: {r.round_winner === battle.challenger_id ? (battle.challenger_name ?? "Challenger") : (battle.defender_name ?? "Defender")}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-text3">
                  <div>Challenger: {r.challenger_tokens ?? 0} tokens, {r.challenger_latency_ms ?? 0}ms</div>
                  <div>Defender: {r.defender_tokens ?? 0} tokens, {r.defender_latency_ms ?? 0}ms</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {judgments.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text3 mb-2">Judgments ({judgments.length})</h4>
          <div className="space-y-2">
            {judgments.map(j => (
              <div key={j.id} className="rounded border border-border p-3 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-text">{j.judge_model}</span>
                  <span className="text-text3">Confidence: {j.confidence != null ? `${Math.round(j.confidence * 100)}%` : "--"}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-text3 mb-1">
                  <div>Quality: {j.quality_score ?? "--"}</div>
                  <div>Speed: {j.speed_score ?? "--"}</div>
                  <div>Efficiency: {j.efficiency_score ?? "--"}</div>
                  <div>Style: {j.style_score ?? "--"}</div>
                </div>
                {j.verdict && <div className="text-green-400">Verdict: {j.verdict}</div>}
                {j.rationale && <p className="text-text3 mt-1">{j.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Battles Tab ────────────────────────────────────────

function BattlesTab() {
  const [statusFilter, setStatusFilter] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["battles", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" })
      if (statusFilter) params.set("status", statusFilter)
      return api<{ data: { battles: Battle[]; total: number } }>(`/api/admin/battles?${params}`).then(r => r.data)
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="judging">Judging</option>
          <option value="complete">Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="text-xs text-text3">{data?.total ?? 0} battles</span>
      </div>

      {isLoading && <div className="text-text3">Loading...</div>}

      <table className="w-full text-sm">
        <thead className="text-text3 text-xs">
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-2 w-6"></th>
            <th className="text-left py-2 pr-4">Challenger</th>
            <th className="text-left py-2 pr-4">Defender</th>
            <th className="text-left py-2 pr-4">Domain</th>
            <th className="text-left py-2 pr-4">Status</th>
            <th className="text-right py-2 pr-4">Ch. Elo</th>
            <th className="text-right py-2 pr-4">Def. Elo</th>
            <th className="text-left py-2 pr-4">Winner</th>
            <th className="text-right py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {(data?.battles ?? []).map(b => {
            const isExpanded = expandedId === b.id
            const winnerName = b.winner_id
              ? b.winner_id === b.challenger_id
                ? (b.challenger_name ?? "Challenger")
                : (b.defender_name ?? "Defender")
              : "--"

            return (
              <tr key={b.id} className="border-b border-border/50 hover:bg-raised/50 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : b.id)}>
                <td className="py-2 pr-2 text-text3">
                  {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </td>
                <td className="py-2 pr-4 text-text"><Link to={`/agents/${b.challenger_id}`} className="text-accent-porter hover:underline">{b.challenger_name ?? b.challenger_id?.slice(0, 8)}</Link></td>
                <td className="py-2 pr-4 text-text"><Link to={`/agents/${b.defender_id}`} className="text-accent-porter hover:underline">{b.defender_name ?? b.defender_id?.slice(0, 8)}</Link></td>
                <td className="py-2 pr-4 text-text2">{b.domain}</td>
                <td className="py-2 pr-4"><StatusBadge status={b.status} /></td>
                <td className="py-2 pr-4 text-right"><EloDelta before={b.challenger_elo_before} after={b.challenger_elo_after} /></td>
                <td className="py-2 pr-4 text-right"><EloDelta before={b.defender_elo_before} after={b.defender_elo_after} /></td>
                <td className="py-2 pr-4 text-text">{winnerName}</td>
                <td className="py-2 text-right text-text3 text-xs">{formatDate(b.created_at)}</td>
              </tr>
            )
          })}
          {expandedId && (
            <tr>
              <td colSpan={9} className="p-0">
                <BattleDetail battleId={expandedId} />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!isLoading && (data?.battles ?? []).length === 0 && (
        <div className="text-center py-12 text-text3">No battles found</div>
      )}
    </div>
  )
}

// ── Leaderboard Tab ────────────────────────────────────

function LeaderboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["battles-leaderboard"],
    queryFn: () => api<{ data: { leaderboard: LeaderboardEntry[] } }>("/api/admin/battles/leaderboard").then(r => r.data),
  })

  if (isLoading) return <div className="text-text3">Loading...</div>

  const rows = data?.leaderboard ?? []

  return (
    <table className="w-full text-sm">
      <thead className="text-text3 text-xs">
        <tr className="border-b border-border">
          <th className="text-left py-2 pr-4 w-12">#</th>
          <th className="text-left py-2 pr-4">Agent</th>
          <th className="text-right py-2 pr-4">Elo</th>
          <th className="text-right py-2 pr-4">Level</th>
          <th className="text-right py-2 pr-4">XP</th>
          <th className="text-right py-2 pr-4">Battles</th>
          <th className="text-right py-2 pr-4">Quality</th>
          <th className="text-right py-2 pr-4">Speed</th>
          <th className="text-left py-2 pr-4">Class</th>
          <th className="text-left py-2">Rarity</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.template_id} className="border-b border-border/50 hover:bg-raised/50">
            <td className="py-2 pr-4 text-text3 font-mono">{i + 1}</td>
            <td className="py-2 pr-4 text-text font-medium"><Link to={`/agents/${r.template_id}`} className="text-accent-porter hover:underline">{r.agent_name ?? r.template_id.slice(0, 8)}</Link></td>
            <td className="py-2 pr-4 text-right text-text font-mono">{r.elo}</td>
            <td className="py-2 pr-4 text-right text-text2">{r.level}</td>
            <td className="py-2 pr-4 text-right text-text3">{r.xp.toLocaleString()}</td>
            <td className="py-2 pr-4 text-right text-text2">{r.battle_count}</td>
            <td className="py-2 pr-4 text-right text-text2">{r.quality.toFixed(1)}</td>
            <td className="py-2 pr-4 text-right text-text2">{r.speed.toFixed(1)}</td>
            <td className="py-2 pr-4 text-text3 capitalize">{r.agent_class}</td>
            <td className="py-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                r.rarity === "legendary" ? "bg-yellow-500/10 text-yellow-400" :
                r.rarity === "epic" ? "bg-purple-500/10 text-purple-400" :
                r.rarity === "rare" ? "bg-blue-500/10 text-blue-400" :
                r.rarity === "uncommon" ? "bg-green-500/10 text-green-400" :
                "bg-text3/10 text-text3"
              }`}>
                {r.rarity}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Bonds Tab ──────────────────────────────────────────

function BondsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["battles-bonds"],
    queryFn: () => api<{ data: { bonds: Bond[] } }>("/api/admin/battles/bonds").then(r => r.data),
  })

  if (isLoading) return <div className="text-text3">Loading...</div>

  const bonds = data?.bonds ?? []

  return (
    <table className="w-full text-sm">
      <thead className="text-text3 text-xs">
        <tr className="border-b border-border">
          <th className="text-left py-2 pr-4">Agent A</th>
          <th className="text-left py-2 pr-4">Agent B</th>
          <th className="text-right py-2 pr-4">Chain Count</th>
          <th className="text-right py-2 pr-4">Success Count</th>
          <th className="text-right py-2 pr-4">Combo Score</th>
          <th className="text-right py-2">Last Chained</th>
        </tr>
      </thead>
      <tbody>
        {bonds.map(b => (
          <tr key={b.id} className="border-b border-border/50 hover:bg-raised/50">
            <td className="py-2 pr-4 text-text font-medium"><Link to={`/agents/${b.agent_a_id}`} className="text-accent-porter hover:underline">{b.agent_a_name ?? b.agent_a_id.slice(0, 8)}</Link></td>
            <td className="py-2 pr-4 text-text font-medium"><Link to={`/agents/${b.agent_b_id}`} className="text-accent-porter hover:underline">{b.agent_b_name ?? b.agent_b_id.slice(0, 8)}</Link></td>
            <td className="py-2 pr-4 text-right text-text2">{b.chain_count}</td>
            <td className="py-2 pr-4 text-right text-text2">{b.success_count}</td>
            <td className="py-2 pr-4 text-right text-accent-porter font-mono">{b.combo_score.toFixed(1)}</td>
            <td className="py-2 text-right text-text3 text-xs">{formatDate(b.last_chained)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Page ───────────────────────────────────────────────

export default function BattlesPage() {
  const [tab, setTab] = useState<Tab>("battles")

  const tabs: { id: Tab; label: string; icon: typeof Swords }[] = [
    { id: "battles", label: "Battles", icon: Swords },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
    { id: "bonds", label: "Bonds", icon: Users },
  ]

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Battle Arena</h1>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-accent-porter text-accent-porter"
                : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        {tab === "battles" && <BattlesTab />}
        {tab === "leaderboard" && <LeaderboardTab />}
        {tab === "bonds" && <BondsTab />}
      </div>
    </div>
  )
}
