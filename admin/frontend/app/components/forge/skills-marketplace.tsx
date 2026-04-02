import { useState, useMemo } from "react"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Search, Star } from "lucide-react"
import { SkillQualityBadge, type QualityTier } from "~/components/skill-quality-badge"

// ── Types ──────────────────────────────────────────────────

interface SkillAgent { id: string; name: string; role: string; enabled: boolean }

interface Skill {
  id: string; name: string; description: string; category: string; source: string
  enabled: boolean; visible: boolean; featured: boolean
  icon: string; color: string; short_label: string
  sort_order: number; featured_order: number
  packStatus: "ready" | "partial" | "missing"
  qualityTier?: QualityTier
  tags: string[]
  agents: SkillAgent[]
}

interface SkillsMarketplaceProps {
  skills: Skill[]
  categories: Record<string, number>
  allTags: Record<string, number>
  onSelect?: (skill: Skill) => void
}

// ── Component ──────────────────────────────────────────────

export function SkillsMarketplace({ skills, categories, allTags, onSelect }: SkillsMarketplaceProps) {
  const [search, setSearch] = useState("")
  const [activeCat, setActiveCat] = useState("all")
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  // Top tags sorted by count
  const topTags = useMemo(() => {
    return Object.entries(allTags)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
  }, [allTags])

  // Filter skills
  const filtered = useMemo(() => {
    let result = skills
    if (activeCat !== "all") result = result.filter(s => s.category === activeCat)
    if (activeTags.size > 0) {
      result = result.filter(s => s.tags.some(t => activeTags.has(t)))
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return result
  }, [skills, activeCat, activeTags, search])

  const featured = useMemo(() => skills.filter(s => s.featured), [skills])

  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text3" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills, tags..."
          className="h-8 bg-raised border-border pl-8 text-xs"
        />
      </div>

      {/* Tag pills */}
      {topTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topTags.map(([tag, cnt]) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-2 py-0.5 text-2xs font-medium transition-colors ${
                activeTags.has(tag)
                  ? "bg-accent-porter/20 text-accent-porter"
                  : "bg-raised text-text3 hover:text-text2 hover:bg-raised/80"
              }`}
            >
              {tag} ({cnt})
            </button>
          ))}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="rounded-full px-2 py-0.5 text-2xs font-medium text-danger/70 hover:text-danger transition-colors"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Category pills */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveCat("all")}
          className={`rounded-md px-2 py-0.5 text-2xs font-medium transition-colors ${
            activeCat === "all" ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
          }`}
        >all ({skills.length})</button>
        {Object.entries(categories).sort(([, a], [, b]) => b - a).map(([cat, cnt]) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`rounded-md px-2 py-0.5 text-2xs font-medium transition-colors ${
              activeCat === cat ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
            }`}
          >{cat} ({cnt})</button>
        ))}
      </div>

      {/* Featured section */}
      {featured.length > 0 && activeCat === "all" && !search && activeTags.size === 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-1.5 flex items-center gap-1">
            <Star className="size-3 text-warning fill-warning" />
            Featured
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {featured.map(skill => (
              <button
                key={skill.id}
                onClick={() => onSelect?.(skill)}
                className="rounded-lg border border-warning/20 bg-warning/5 p-3 hover:border-warning/40 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-1.5">
                  <Star className="size-2.5 text-warning fill-warning shrink-0" />
                  <p className="text-xs font-bold text-text truncate">{skill.name}</p>
                </div>
                <p className="text-2xs text-text3 line-clamp-2 mt-0.5">{skill.description}</p>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  <Badge className="text-2xs bg-muted text-text3 border-0">{skill.category}</Badge>
                  <SkillQualityBadge tier={skill.qualityTier} />
                  {skill.agents.length > 0 && <span className="text-2xs text-text3">{skill.agents.length} agents</span>}
                </div>
                {skill.tags.length > 0 && (
                  <div className="flex gap-0.5 mt-1 flex-wrap">
                    {skill.tags.slice(0, 3).map(t => (
                      <span key={t} className="rounded bg-raised px-1 py-0.5 text-2xs text-text3">{t}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {filtered.map(skill => (
          <button
            key={skill.id}
            onClick={() => onSelect?.(skill)}
            className="rounded-lg border border-border bg-surface p-2.5 hover:border-accent-porter/30 transition-colors cursor-pointer text-left"
          >
            <p className="text-xs font-bold text-text truncate">{skill.name}</p>
            <p className="text-2xs text-text3 line-clamp-2 mt-0.5">{skill.description}</p>
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <Badge className="text-2xs bg-muted text-text3 border-0">{skill.category}</Badge>
              <SkillQualityBadge tier={skill.qualityTier} />
              {skill.agents.length > 0 && <span className="text-2xs text-text3">{skill.agents.length} agents</span>}
            </div>
            {skill.tags.length > 0 && (
              <div className="flex gap-0.5 mt-1 flex-wrap">
                {skill.tags.slice(0, 3).map(t => (
                  <span key={t} className="rounded bg-raised px-1 py-0.5 text-2xs text-text3">{t}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-6 text-center text-xs text-text3">
          {search || activeTags.size > 0 ? "No skills match" : "No skills"}
        </div>
      )}
    </div>
  )
}
