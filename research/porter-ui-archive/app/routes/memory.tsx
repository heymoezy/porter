import { useState } from "react"
import { AppShell } from "~/components/layout/app-shell"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useConcepts } from "~/hooks/use-api"
import { Loader2, Search, Brain, Filter, ChevronDown } from "lucide-react"

interface Concept {
  id: string | number
  content: string
  trust_tier: "directive" | "concept" | "episode" | "signal"
  scope: string
  confidence: number
  source_type?: string
  agent_id?: string | null
  project_id?: string | null
  created_at?: string
}

const TIER_STYLE: Record<string, { bg: string; text: string }> = {
  directive: { bg: "bg-purple-500/15", text: "text-purple-400" },
  concept: { bg: "bg-accent-porter/15", text: "text-accent-porter" },
  episode: { bg: "bg-teal-500/15", text: "text-teal-400" },
  signal: { bg: "bg-text3/15", text: "text-text3" },
}

const SCOPE_OPTIONS = ["all", "global", "project", "agent"] as const
type ScopeFilter = (typeof SCOPE_OPTIONS)[number]

function ConceptCard({ concept }: { concept: Concept }) {
  const tier = TIER_STYLE[concept.trust_tier] ?? TIER_STYLE.signal
  const truncated = concept.content.length > 200
    ? concept.content.slice(0, 200) + "..."
    : concept.content

  return (
    <Card size="sm" className="bg-surface border-border">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[9px] px-1.5 py-0 ${tier.bg} ${tier.text}`}>
            {concept.trust_tier}
          </Badge>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {concept.scope}
          </Badge>
          {concept.source_type && (
            <span className="text-[9px] text-text3">{concept.source_type}</span>
          )}
        </div>

        <p className="text-xs text-text2 leading-relaxed">{truncated}</p>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full bg-raised overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-porter/60 transition-all duration-500"
                style={{ width: `${Math.round(concept.confidence * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[9px] text-text3 tabular-nums shrink-0">
            {Math.round(concept.confidence * 100)}%
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Brain className="size-8 text-text3 mb-3" />
      <p className="text-sm font-medium text-text2">No memories yet</p>
      <p className="text-xs text-text3 mt-1">Porter will build memory as it works</p>
    </div>
  )
}

export default function MemoryPage() {
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<ScopeFilter>("all")

  const queryParams = new URLSearchParams()
  if (search.trim()) queryParams.set("q", search.trim())
  if (scope !== "all") queryParams.set("scope", scope)

  const { data, isLoading, error } = useConcepts(
    search.trim() || undefined,
    scope !== "all" ? scope : undefined,
  )

  const concepts: Concept[] = data?.concepts ?? []

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[900px] space-y-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text3" />
              <Input
                placeholder="Search concepts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-raised border-border2 text-foreground focus-visible:ring-accent-porter text-xs h-8"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Filter className="size-3" />
                  {scope === "all" ? "All scopes" : scope}
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SCOPE_OPTIONS.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setScope(s)}>
                    {s === "all" ? "All scopes" : s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 py-12 justify-center text-text3">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-xs">Loading memories...</span>
            </div>
          )}

          {error && (
            <div className="py-12 text-center">
              <p className="text-xs text-danger">Failed to load memories</p>
            </div>
          )}

          {data && concepts.length === 0 && !isLoading && <EmptyState />}

          {concepts.length > 0 && (
            <>
              <p className="text-[10px] text-text3">{data?.count ?? concepts.length} concept{(data?.count ?? concepts.length) !== 1 ? "s" : ""}</p>
              <div className="animated-list space-y-2">
                {concepts.map((c) => (
                  <ConceptCard key={c.id} concept={c} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  )
}
