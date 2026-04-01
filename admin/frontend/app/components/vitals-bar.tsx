import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"

interface GatewayLimit {
  limit_type: "tokens" | "requests" | "input_tokens" | "output_tokens"
  period: "minute" | "daily" | "weekly" | "monthly"
  limit_value: number
  current_value: number
}

interface GatewayCapacity {
  gateway_id: string
  limits: GatewayLimit[]
}

export interface VitalsProps {
  templateId: string  // scopes query key for SSE invalidation
  reliability: number // 0-100 from RpgStats (rpg.reliability)
  dispatchCount: number // from RpgStats, to proxy focus if no session data
}

function deriveTokenPct(gateways: GatewayCapacity[]): number {
  let totalUsed = 0
  let totalLimit = 0
  for (const gw of gateways) {
    for (const lim of gw.limits) {
      if (lim.limit_type === "tokens" && lim.period === "daily" && lim.limit_value > 0) {
        totalUsed += lim.current_value
        totalLimit += lim.limit_value
      }
    }
  }
  if (totalLimit === 0) return 85 // no capacity data — default
  const pct = 100 - (totalUsed / totalLimit) * 100
  return Math.max(0, Math.min(100, pct))
}

function tokenColor(pct: number): string {
  if (pct >= 50) return "bg-blue-400"
  if (pct >= 20) return "bg-yellow-400"
  return "bg-red-400"
}

function healthColor(pct: number): string {
  if (pct >= 80) return "bg-green-400"
  if (pct >= 50) return "bg-yellow-400"
  return "bg-red-400"
}

function focusColor(pct: number): string {
  if (pct >= 70) return "bg-purple-400"
  if (pct >= 40) return "bg-yellow-400"
  return "bg-red-400"
}

interface VitalBarRowProps {
  label: string
  value: string
  pct: number
  colorClass: string
}

function VitalBarRow({ label, value, pct, colorClass }: VitalBarRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text3">{label}</span>
        <span className="text-2xs font-mono text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-raised overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function VitalsBar({ templateId: _templateId, reliability, dispatchCount }: VitalsProps) {
  const { data: capacityData } = useQuery({
    queryKey: ["bridge", "capacity"],
    queryFn: () => api<{ gateways: GatewayCapacity[] }>("/api/admin/bridge/capacity"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Vital 1 — Tokens (blue): remaining daily token budget across all gateways
  const tokenPct = capacityData?.gateways ? deriveTokenPct(capacityData.gateways) : 85

  // Vital 2 — Health (green/red): 100 = zero errors, 0 = all failed
  const healthPct = Math.max(0, Math.min(100, reliability))

  // Vital 3 — Focus (purple): context window pressure proxy
  // Derives from dispatch recency within a 50-dispatch window
  // Real session data replaces this in Phase 29
  const focusPct = Math.max(0, Math.min(100, 100 - (dispatchCount % 50) * 2))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-bold uppercase tracking-widest text-text3">Vitals</span>
      <VitalBarRow
        label="Tokens"
        value={`${Math.round(tokenPct)}%`}
        pct={tokenPct}
        colorClass={tokenColor(tokenPct)}
      />
      <VitalBarRow
        label="Health"
        value={`${Math.round(healthPct)}%`}
        pct={healthPct}
        colorClass={healthColor(healthPct)}
      />
      <VitalBarRow
        label="Focus"
        value={`${Math.round(focusPct)}%`}
        pct={focusPct}
        colorClass={focusColor(focusPct)}
      />
    </div>
  )
}
