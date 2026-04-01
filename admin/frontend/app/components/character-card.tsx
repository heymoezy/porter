import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Star, Shield, Zap, Target } from 'lucide-react'

// ── Interfaces ────────────────────────────────────────────────────

export interface RpgStats {
  quality: number
  speed: number
  efficiency: number
  reliability: number
  combo: number
  xp: number
  level: number
  stars: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  elo: number
  dispatchCount: number
  battleCount: number
  specialties: Array<{ label: string }>
}

export interface WorkshopData {
  shell: string
  intelligence: {
    primary_model?: string
    fallback_chain?: string[]
    temperature?: number
    reasoning_depth?: string
    memory_profile?: string
  }
  supports: Array<{
    id: string
    target_skill?: string
    prompt_diff?: string
    measured_impact?: string
  }>
  equipment_slots: Array<{ slot?: string; equipped?: string }>
  passive_tree: Array<{ node_id: string; unlocked: boolean; active: boolean }>
  skill_slots: number
  skills: Array<{
    skill_id: string
    success_rate_30d: number
    total_uses: number
  }>
}

export interface CharacterCardProps {
  rpg: RpgStats | null
  workshop: WorkshopData | null
  agentName: string
}

// ── Constants ─────────────────────────────────────────────────────

const RARITY_CLASS: Record<string, string> = {
  common: 'rarity-common',
  rare: 'rarity-rare',
  epic: 'rarity-epic',
  legendary: 'rarity-legendary',
  mythic: 'rarity-mythic',
}

const RARITY_COLOR: Record<string, string> = {
  common: 'text-[var(--text3)]',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-yellow-400',
  mythic: 'text-red-400',
}

// Dispatch gate thresholds for each star level
const GATE = [0, 50, 200, 500, 1000]

// ── Sub-components ────────────────────────────────────────────────

function StarDisplay({
  stars,
  dispatchCount,
}: {
  stars: number
  dispatchCount: number
}) {
  const nextGate = GATE[Math.min(stars, 4)]
  const prevGate = GATE[Math.max(stars - 1, 0)]
  const range = nextGate - prevGate + 1
  const progress = Math.min((dispatchCount - prevGate) / range, 1)
  const circumference = 2 * Math.PI * 10
  const dashoffset = circumference * (1 - progress)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => {
          const filled = i < stars
          return (
            <Star
              key={i}
              size={14}
              className={filled ? 'text-yellow-400' : 'text-[var(--text3)]/40'}
              fill={filled ? 'currentColor' : 'none'}
              strokeWidth={filled ? 2 : 1}
            />
          )
        })}

        {/* Arc progress or crown */}
        <div className="ml-1">
          {stars === 5 ? (
            <span className="text-xs" title="Max stars">
              👑
            </span>
          ) : (
            <svg width={24} height={24} viewBox="0 0 24 24">
              <circle
                r={10}
                cx={12}
                cy={12}
                className="star-progress-track"
                strokeWidth={2}
              />
              <circle
                r={10}
                cx={12}
                cy={12}
                className="star-progress-fill"
                strokeWidth={2}
                strokeDasharray={circumference}
                strokeDashoffset={dashoffset}
                transform="rotate(-90 12 12)"
              />
            </svg>
          )}
        </div>
      </div>

      <span className="text-[10px] text-[var(--text3)]">
        {dispatchCount} dispatches
      </span>
    </div>
  )
}

function XpBar({ xp, level }: { xp: number; level: number }) {
  const xpPerLevel = level * 100
  const currentLevelXp = xp % xpPerLevel
  const pct = Math.min((currentLevelXp / xpPerLevel) * 100, 100)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="xp-bar-fill absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-[var(--text3)]">
        {currentLevelXp} / {xpPerLevel} XP
      </span>
    </div>
  )
}

function StatPentagon({ rpg }: { rpg: RpgStats | null }) {
  const pentagonData = [
    { stat: 'QTY', value: rpg?.quality ?? 0, fullMark: 100 },
    { stat: 'SPD', value: rpg?.speed ?? 0, fullMark: 100 },
    { stat: 'EFF', value: rpg?.efficiency ?? 0, fullMark: 100 },
    { stat: 'REL', value: rpg?.reliability ?? 0, fullMark: 100 },
    { stat: 'COMBO', value: rpg?.combo ?? 0, fullMark: 100 },
  ]

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={pentagonData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid gridType="polygon" stroke="var(--border)" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fontSize: 10, fill: 'var(--text3)' }}
        />
        <Radar
          name="stats"
          dataKey="value"
          stroke="var(--accent-porter)"
          fill="var(--accent-porter)"
          fillOpacity={0.25}
          dot={false}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function ShellIntelSection({ workshop }: { workshop: WorkshopData | null }) {
  if (!workshop) return null
  const { shell, intelligence } = workshop

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text3)]">
          Shell
        </span>
        <div className="flex items-center gap-1">
          <Shield size={12} className="text-[var(--accent-porter)]" />
          <span className="capitalize font-medium">{shell || 'Unknown'}</span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text3)]">
          Intelligence
        </span>
        <span className="font-medium truncate">
          {intelligence?.primary_model || 'Unassigned'}
        </span>
        {intelligence?.temperature !== undefined && (
          <span className="text-[10px] text-[var(--text3)]">
            temp {intelligence.temperature}
          </span>
        )}
      </div>
    </div>
  )
}

function SkillsSection({ workshop }: { workshop: WorkshopData | null }) {
  if (!workshop) {
    return (
      <div>
        <SectionLabel>Skills</SectionLabel>
        <span className="text-[10px] text-[var(--text3)]">No workshop data</span>
      </div>
    )
  }

  const shown = workshop.skills?.slice(0, Math.max(workshop.skill_slots ?? 4, 4)) ?? []

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Skills</SectionLabel>
      {shown.length === 0 ? (
        <span className="text-[10px] text-[var(--text3)]">No skills equipped</span>
      ) : (
        shown.map((skill, i) => (
          <div key={`${skill.skill_id}-${i}`} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium truncate max-w-[70%]">
                {skill.skill_id}
              </span>
              <span className="text-[10px] text-[var(--text3)]">
                {skill.total_uses} uses
              </span>
            </div>
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent-porter)] transition-all"
                style={{ width: `${Math.min(skill.success_rate_30d, 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function SupportsSection({ workshop }: { workshop: WorkshopData | null }) {
  const supports = workshop?.supports ?? []

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Supports</SectionLabel>
      {supports.length === 0 ? (
        <span className="text-[10px] text-[var(--text3)]">None equipped</span>
      ) : (
        supports.map((s, i) => (
          <div key={`${s.id}-${i}`} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium">{s.id}</span>
            {s.measured_impact && (
              <span className="text-[10px] text-[var(--success)]">
                {s.measured_impact}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function EquipmentSection({ workshop }: { workshop: WorkshopData | null }) {
  const slots = workshop?.equipment_slots?.slice(0, 6) ?? []

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Equipment</SectionLabel>
      {slots.length === 0 ? (
        <span className="text-[10px] text-[var(--text3)]">No slots</span>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <Target size={10} className="text-[var(--text3)] shrink-0" />
              <span className="text-[var(--text3)] capitalize truncate">
                {slot.slot || `Slot ${i + 1}`}:
              </span>
              <span
                className={
                  slot.equipped
                    ? 'font-medium truncate'
                    : 'text-[var(--text3)]/40 italic'
                }
              >
                {slot.equipped || 'Empty'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text3)]">
      {children}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────

export function CharacterCard({ rpg, workshop, agentName }: CharacterCardProps) {
  // Full null/empty skeleton
  if (!rpg && !workshop) {
    return (
      <Card className="border-2 rarity-common">
        <CardContent className="py-6 flex flex-col items-center gap-2 text-center">
          <Zap size={24} className="text-[var(--text3)]" />
          <p className="text-sm text-[var(--text3)]">
            Forge this agent to unlock its character sheet
          </p>
        </CardContent>
      </Card>
    )
  }

  const rarity = rpg?.rarity ?? 'common'
  const rarityClass = RARITY_CLASS[rarity] ?? 'rarity-common'
  const rarityColorClass = RARITY_COLOR[rarity] ?? 'text-[var(--text3)]'

  const specialties = rpg?.specialties ?? []
  const hasSpecialties = specialties.length > 0

  return (
    <div className={`border-2 rounded-xl ${rarityClass}`}>
      <Card className="border-0 rounded-xl bg-[var(--surface)]">
        <CardContent className="flex flex-col gap-4 py-4">

          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm flex-1 min-w-0 truncate">
              {agentName}
            </span>
            <Badge variant="outline" className={`capitalize text-[10px] ${rarityColorClass}`}>
              {rarity}
            </Badge>
            {rpg && (
              <>
                <Badge variant="secondary" className="text-[10px]">
                  ELO {rpg.elo}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  LV {rpg.level}
                </Badge>
              </>
            )}
          </div>

          {/* Level + XP bar */}
          {rpg && <XpBar xp={rpg.xp} level={rpg.level} />}

          {/* Star display */}
          {rpg && (
            <StarDisplay
              stars={rpg.stars}
              dispatchCount={rpg.dispatchCount}
            />
          )}

          {/* Stat Pentagon */}
          <StatPentagon rpg={rpg} />

          {/* Shell + Intelligence */}
          <ShellIntelSection workshop={workshop} />

          {/* Skills */}
          <SkillsSection workshop={workshop} />

          {/* Supports */}
          <SupportsSection workshop={workshop} />

          {/* Equipment */}
          <EquipmentSection workshop={workshop} />

          {/* Specialties */}
          {hasSpecialties && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Specialties</SectionLabel>
              <div className="flex flex-wrap gap-1">
                {specialties.slice(0, 3).map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}
