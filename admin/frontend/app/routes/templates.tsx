import { useState } from "react"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { PixelPortrait } from "~/components/pixel-portrait"
import {
  Blocks, Search, ChevronDown, ChevronUp, X,
} from "lucide-react"

interface Template {
  id: string
  name: string
  category: string
  description: string
  tags: string[]
  archetype: string
  appearance_spec: Record<string, unknown>
  appearance_style: string
  communication_style: string
}

interface TemplatesResponse {
  templates: Template[]
  count: number
  categories: Record<string, number>
  archetypes: Record<string, number>
}

interface TemplateDetail {
  id: string
  name: string
  cat: string
  desc: string
  soul: string[]
  mission: string
  inputs: string[]
  outputs: string[]
  authority: string[]
  tags: string[]
  archetype: string
  appearance_spec: Record<string, string>
  communication_style: string
}

const CATEGORIES = [
  "all", "business", "content", "creative", "data", "design",
  "devops", "education", "engineering", "legal", "research",
]

const archetypeColors: Record<string, string> = {
  navigator: "bg-blue-500/15 text-blue-400",
  operator: "bg-emerald-500/15 text-emerald-400",
  maker: "bg-purple-500/15 text-purple-400",
  auditor: "bg-amber-500/15 text-amber-400",
  warden: "bg-red-500/15 text-red-400",
  scholar: "bg-cyan-500/15 text-cyan-400",
}

function TemplatesContent() {
  const [activeCat, setActiveCat] = useState("all")
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "templates", activeCat],
    queryFn: () => {
      const params = activeCat !== "all" ? `?category=${activeCat}` : ""
      return api<TemplatesResponse>(`/api/admin/templates${params}`)
    },
  })

  const { data: detail } = useQuery({
    queryKey: ["admin", "templates", expandedId],
    queryFn: () => api<TemplateDetail>(`/api/admin/templates/${expandedId}`),
    enabled: !!expandedId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
        <p className="text-sm text-danger">Failed to load templates — is Porter.py running?</p>
      </div>
    )
  }

  const templates = data?.templates ?? []
  const categories = data?.categories ?? {}
  const archetypes = data?.archetypes ?? {}

  const filtered = search
    ? templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      )
    : templates

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Blocks className="size-3 text-accent-porter" />
        <span className="text-sm font-bold text-text">{data?.count ?? 0}</span>
        <span className="text-xs text-text3">templates</span>
        <span className="mx-2 h-4 w-px bg-border" />
        <span className="text-xs text-text3">{Object.keys(categories).length} categories</span>
        <span className="mx-2 h-4 w-px bg-border" />
        {Object.entries(archetypes).map(([arch, count]) => (
          <Badge key={arch} className={`text-[10px] border-0 ${archetypeColors[arch] || "bg-text3/15 text-text3"}`}>
            {arch} {count}
          </Badge>
        ))}
      </div>

      {/* Search + Category tabs */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text3 focus:border-accent-porter focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-text3 hover:text-text">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              activeCat === cat
                ? "bg-accent-porter/15 text-accent-porter"
                : "text-text3 hover:bg-raised hover:text-text2"
            }`}
          >
            {cat}{cat !== "all" && categories[cat] ? ` (${categories[cat]})` : ""}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t, i) => {
          const spec = (t.appearance_spec || {}) as Record<string, string>
          const isExpanded = expandedId === t.id
          return (
            <div
              key={t.id}
              className={`animate-card-deal-in cursor-pointer rounded-xl border bg-surface transition-all ${
                isExpanded ? "border-accent-porter col-span-1 sm:col-span-2 lg:col-span-3" : "border-border hover:border-text3/30"
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => setExpandedId(isExpanded ? null : t.id)}
            >
              <div className="flex items-center gap-2 p-3">
                <PixelPortrait
                  hair={spec.hair || "#2c1b18"}
                  skin={spec.skin || "#f1c27d"}
                  eyes={spec.eyes || "#1a1a2e"}
                  shirt={spec.shirt || "#64748b"}
                  hairStyle={(["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style) ? spec.hair_style : "short") as "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-text truncate">{t.name}</p>
                    <Badge className={`text-[10px] border-0 shrink-0 ${archetypeColors[t.archetype] || "bg-text3/15 text-text3"}`}>
                      {t.archetype}
                    </Badge>
                  </div>
                  <p className="text-xs text-text3 truncate">{t.description}</p>
                </div>
                {isExpanded ? <ChevronUp className="size-3 text-text3 shrink-0" /> : <ChevronDown className="size-3 text-text3 shrink-0" />}
              </div>

              {/* Expanded detail */}
              {isExpanded && detail && (
                <div className="border-t border-border px-3 py-3 space-y-2">
                  {detail.soul && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Soul</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.soul.map((s, i) => (
                          <span key={i} className="rounded-md bg-raised px-2 py-1 text-xs text-text2">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.mission && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Mission</p>
                      <p className="text-xs text-text2 leading-relaxed">{detail.mission}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {detail.inputs?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Inputs</p>
                        {detail.inputs.map((inp, i) => (
                          <p key={i} className="text-xs text-text2">{inp}</p>
                        ))}
                      </div>
                    )}
                    {detail.outputs?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Outputs</p>
                        {detail.outputs.map((out, i) => (
                          <p key={i} className="text-xs text-text2">{out}</p>
                        ))}
                      </div>
                    )}
                    {detail.authority?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text3 mb-1">Authority</p>
                        {detail.authority.map((a, i) => (
                          <p key={i} className="text-xs text-text2">{a}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  {detail.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {detail.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-text3">No templates found</p>
        </div>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  return (
    <AdminShell>
      <TemplatesContent />
    </AdminShell>
  )
}
