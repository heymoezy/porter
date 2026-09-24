import { StatusBadge } from "~/components/ui/status-badge"

export type QualityTier = "scaffold" | "baseline" | "production" | "high-performing" | "stale"

const TIERS: ReadonlySet<string> = new Set<QualityTier>(["scaffold", "baseline", "production", "high-performing", "stale"])

export function SkillQualityBadge({ tier }: { tier: QualityTier | undefined | null }) {
  if (!tier || !TIERS.has(tier)) return null
  return <StatusBadge status={tier} label={tier} />
}
