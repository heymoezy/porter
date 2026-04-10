import { useState } from "react"
import { AppShell } from "~/components/layout/app-shell"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { useDecisions } from "~/hooks/use-api"
import { Loader2, ScrollText, Filter, ChevronDown, ChevronRight } from "lucide-react"
import type { Decision } from "~/lib/types"

const TYPE_STYLE: Record<string, string> = {
  routing: "bg-accent-porter/15 text-accent-porter",
  delegation: "bg-warning/15 text-warning",
  escalation: "bg-danger/15 text-danger",
  fallback: "bg-teal-500/15 text-teal-400",
  model_selection: "bg-purple-500/15 text-purple-400",
  tool_call: "bg-success/15 text-success",
}

function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
  }
}

function DecisionRow({ decision }: { decision: Decision }) {
  const [open, setOpen] = useState(false)
  const ts = formatTimestamp(decision.created_at)
  const typeStyle = TYPE_STYLE[decision.decision_type] ?? "bg-text3/15 text-text3"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface hover:bg-raised transition-colors text-left group">
          <div className="shrink-0 text-text3 tabular-nums text-[10px] w-[72px]">
            <p className="font-mono">{ts.time}</p>
            <p className="text-[9px]">{ts.date}</p>
          </div>

          <Badge className={`text-[8px] px-1.5 py-0 shrink-0 ${typeStyle}`}>
            {decision.decision_type}
          </Badge>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground truncate">
              {decision.chosen}
            </p>
          </div>

          {decision.reasoning && (
            <ChevronRight className={`size-3.5 text-text3 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          )}
        </button>
      </CollapsibleTrigger>

      {decision.reasoning && (
        <CollapsibleContent>
          <div className="ml-[84px] pl-3 pr-3 pb-2 pt-1 border-l-2 border-border">
            <p className="text-[11px] text-text3 leading-relaxed">{decision.reasoning}</p>
            {decision.alternatives && decision.alternatives.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-[9px] text-text3">Alternatives:</span>
                {decision.alternatives.map((a, i) => (
                  <Badge key={i} variant="outline" className="text-[8px] px-1 py-0">
                    {a}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export default function LogsPage() {
  const [limit, setLimit] = useState(50)
  const [typeFilter, setTypeFilter] = useState<string>("all")

  const { data, isLoading, error } = useDecisions(limit)

  const allDecisions: Decision[] = data?.decisions ?? (Array.isArray(data) ? data : [])

  // Derive unique decision types from the data
  const decisionTypes = [...new Set(allDecisions.map((d) => d.decision_type))].sort()

  const decisions = typeFilter === "all"
    ? allDecisions
    : allDecisions.filter((d) => d.decision_type === typeFilter)

  const total = data?.total ?? allDecisions.length
  const hasMore = allDecisions.length < total

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[900px] space-y-6">

          <div className="flex items-center gap-3">
            {decisionTypes.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Filter className="size-3" />
                    {typeFilter === "all" ? "All types" : typeFilter}
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setTypeFilter("all")}>
                    All types
                  </DropdownMenuItem>
                  {decisionTypes.map((t) => (
                    <DropdownMenuItem key={t} onClick={() => setTypeFilter(t)}>
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <span className="text-[10px] text-text3 ml-auto">
              {decisions.length} of {total} entries
            </span>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 py-12 justify-center text-text3">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-xs">Loading logs...</span>
            </div>
          )}

          {error && (
            <div className="py-12 text-center">
              <p className="text-xs text-danger">Failed to load decisions</p>
            </div>
          )}

          {!isLoading && decisions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="size-8 text-text3 mb-3" />
              <p className="text-sm font-medium text-text2">No logs yet</p>
              <p className="text-xs text-text3 mt-1">Decision logs appear as Porter routes work</p>
            </div>
          )}

          {decisions.length > 0 && (
            <div className="animated-list space-y-1.5">
              {decisions.map((d) => (
                <DecisionRow key={d.id} decision={d} />
              ))}
            </div>
          )}

          {hasMore && !isLoading && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimit((l) => l + 50)}
                className="text-xs gap-1.5"
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
