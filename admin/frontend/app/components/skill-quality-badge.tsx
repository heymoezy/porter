import { Badge } from "~/components/ui/badge"

export type QualityTier = 'scaffold' | 'baseline' | 'production' | 'high-performing'

const TIER_CONFIG: Record<QualityTier, { label: string; cls: string }> = {
  'scaffold':        { label: 'scaffold',        cls: 'bg-danger/15 text-danger' },
  'baseline':        { label: 'baseline',        cls: 'bg-warning/15 text-warning' },
  'production':      { label: 'production',      cls: 'bg-success/15 text-success' },
  'high-performing': { label: 'high-performing', cls: 'bg-blue-500/15 text-blue-400' },
}

export function SkillQualityBadge({ tier }: { tier: QualityTier | undefined | null }) {
  if (!tier) return null
  const config = TIER_CONFIG[tier]
  if (!config) return null
  return (
    <Badge className={`text-2xs border-0 ${config.cls}`}>
      {config.label}
    </Badge>
  )
}
