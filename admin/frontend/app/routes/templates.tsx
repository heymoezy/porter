import { useState } from "react"
import { Link } from "react-router"
import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { PixelPortrait } from "~/components/pixel-portrait"
import { Blocks, Search, ChevronRight } from "lucide-react"

interface Template {
  id: string
  name: string
  category: string
  description: string
  tags: string[]
  archetype: string
  appearance_spec: Record<string, unknown>
  communication_style: string
}

interface TemplatesResponse {
  templates: Template[]
  count: number
  categories: Record<string, number>
}

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "templates", activeCat],
    queryFn: () => {
      const params = activeCat !== "all" ? `?category=${activeCat}` : ""
      return api<TemplatesResponse>(`/api/admin/templates${params}`)
    },
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
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-center">
        <p className="text-xs text-danger">Failed to load templates — is Porter.py running?</p>
      </div>
    )
  }

  const templates = data?.templates ?? []
  const categories = data?.categories ?? {}

  const filtered = search
    ? templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      )
    : templates

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Blocks className="size-3 text-accent-porter" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">
          Agent Templates ({data?.count ?? 0})
        </span>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-7 w-[180px] bg-raised border-border pl-7 text-xs"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {["all", ...Object.keys(categories).sort()].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              activeCat === cat ? "bg-accent-porter/15 text-accent-porter" : "text-text3 hover:text-text2 hover:bg-raised"
            }`}
          >{cat}{cat !== "all" && categories[cat] ? ` (${categories[cat]})` : ""}</button>
        ))}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((t, i) => {
          const spec = (t.appearance_spec || {}) as Record<string, string>
          return (
            <Link
              key={t.id}
              to={`/templates/${t.id}`}
              className="animate-card-deal-in rounded-xl border border-border bg-surface p-2.5 hover:border-text3/30 transition-all group"
              style={{ animationDelay: `${i * 20}ms` }}
            >
              <div className="flex items-center gap-2">
                <PixelPortrait
                  hair={spec.hair || "#2c1b18"}
                  skin={spec.skin || "#f1c27d"}
                  eyes={spec.eyes || "#1a1a2e"}
                  shirt={spec.shirt || "#64748b"}
                  hairStyle={(["short","long","mohawk","bald","parted","buzz","curly","ponytail"].includes(spec.hair_style) ? spec.hair_style : "short") as "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail"}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text truncate">{t.name}</p>
                  <Badge className={`text-[8px] border-0 ${archetypeColors[t.archetype] || "bg-text3/15 text-text3"}`}>
                    {t.archetype}
                  </Badge>
                </div>
                <ChevronRight className="size-3 text-text3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[10px] text-text3 mt-1.5 line-clamp-2">{t.description}</p>
            </Link>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-6 text-center text-xs text-text3">No templates found</div>
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
