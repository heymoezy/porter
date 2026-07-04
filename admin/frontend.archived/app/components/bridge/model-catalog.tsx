import React, { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import {
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  SortAsc,
  SortDesc,
  Server,
} from "lucide-react"
import { Button } from "~/components/ui/button"

// ── Types ──────────────────────────────────────────────

interface ModelItem {
  id: string
  gateway_id: string
  gateway_name: string
  gateway_type: string
  model_name: string
  capabilities: string[]
  context_window: number | null
  pricing_input_per_m: number | null
  pricing_output_per_m: number | null
  is_active: number
  created_at: number
  updated_at: number
}

interface ModelVersion {
  id: string
  model_id: string
  version_label: string
  snapshot: Record<string, unknown>
  detected_at: number
}

// ── Constants ──────────────────────────────────────────

const CAPABILITY_COLORS: Record<string, string> = {
  coding:   "bg-blue-500/15 text-blue-400 border-0",
  writing:  "bg-purple-500/15 text-purple-400 border-0",
  analysis: "bg-amber-500/15 text-amber-400 border-0",
  vision:   "bg-emerald-500/15 text-emerald-400 border-0",
  _default: "bg-muted text-text3 border-0",
}

type SortCol = "model_name" | "gateway_name" | "context_window" | "pricing_input_per_m"

// ── Helpers ─────────────────────────────────────────────

function fmtContext(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtPrice(n: number | null): string {
  if (n === null) return "—"
  return `$${n.toFixed(2)}`
}

function fmtTime(epoch: number | null): string {
  if (epoch === null) return "—"
  const d = Date.now() / 1000 - epoch
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function capabilityColor(cap: string): string {
  return CAPABILITY_COLORS[cap] ?? CAPABILITY_COLORS._default
}

// ── Skeleton ─────────────────────────────────────────────

function TableRowSkeleton() {
  return (
    <tr className="border-b border-border/20">
      <td className="px-3 py-2"><div className="h-3 w-32 rounded bg-muted animate-pulse" /></td>
      <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /></td>
      <td className="px-3 py-2"><div className="h-5 w-28 rounded-full bg-muted animate-pulse" /></td>
      <td className="px-3 py-2"><div className="h-3 w-12 rounded bg-muted animate-pulse" /></td>
      <td className="px-3 py-2"><div className="h-3 w-12 rounded bg-muted animate-pulse" /></td>
      <td className="px-3 py-2"><div className="h-3 w-12 rounded bg-muted animate-pulse" /></td>
      <td className="px-3 py-2"><div className="size-3.5 rounded bg-muted animate-pulse" /></td>
    </tr>
  )
}

// ── Sortable column header ────────────────────────────────

function SortHeader({
  col,
  label,
  sortCol,
  sortDir,
  onSort,
  className = "",
}: {
  col: SortCol
  label: string
  sortCol: SortCol
  sortDir: "asc" | "desc"
  onSort: (col: SortCol) => void
  className?: string
}) {
  const active = sortCol === col
  return (
    <th
      className={`px-3 py-2 text-2xs font-semibold uppercase text-text3 cursor-pointer select-none hover:text-text2 transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "asc"
            ? <SortAsc className="size-3 text-accent-porter" />
            : <SortDesc className="size-3 text-accent-porter" />
        ) : (
          <SortAsc className="size-3 opacity-20" />
        )}
      </span>
    </th>
  )
}

// ── Version history panel ─────────────────────────────────

function VersionPanel({ modelId }: { modelId: string }) {
  const versionsQuery = useQuery({
    queryKey: ["bridge", "model-versions", modelId],
    queryFn: () => api<{ versions: ModelVersion[] }>(`/api/admin/bridge/models/${modelId}/versions`),
    enabled: modelId !== "",
    staleTime: 30_000,
  })

  if (versionsQuery.isLoading) {
    return <span className="text-xs text-text3">Loading history...</span>
  }

  const versions = versionsQuery.data?.versions ?? []

  if (versions.length === 0) {
    return <span className="text-xs text-text3">No version history recorded yet.</span>
  }

  return (
    <div className="space-y-0.5">
      {versions.map(v => (
        <div key={v.id} className="flex items-center gap-3 text-2xs py-0.5">
          <Clock className="size-3 text-text3 shrink-0" />
          <span className="font-mono text-text2">{v.version_label}</span>
          <span className="text-text3">{fmtTime(v.detected_at)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────

export function ModelCatalog() {
  const [search, setSearch] = useState("")
  const [gatewayFilter, setGatewayFilter] = useState("all")
  const [capabilityFilter, setCapabilityFilter] = useState("all")
  const [sortCol, setSortCol] = useState<SortCol>("model_name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const catalogQuery = useQuery({
    queryKey: ["bridge", "model-catalog"],
    queryFn: () => api<{ models: ModelItem[] }>("/api/admin/bridge/models"),
    
  })

  // Derive unique gateways for filter dropdown
  const gateways = useMemo(() => {
    const models = catalogQuery.data?.models ?? []
    const seen = new Map<string, string>()
    for (const m of models) {
      if (!seen.has(m.gateway_id)) seen.set(m.gateway_id, m.gateway_name)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [catalogQuery.data])

  // Filtered + sorted rows
  const filteredSorted = useMemo(() => {
    const models = catalogQuery.data?.models ?? []
    let rows = models.filter(m => {
      if (search && !m.model_name.toLowerCase().includes(search.toLowerCase())) return false
      if (gatewayFilter !== "all" && m.gateway_id !== gatewayFilter) return false
      if (capabilityFilter !== "all" && !m.capabilities.includes(capabilityFilter)) return false
      return true
    })

    rows = [...rows].sort((a, b) => {
      let av: string | number | null
      let bv: string | number | null

      if (sortCol === "model_name") {
        av = a.model_name.toLowerCase()
        bv = b.model_name.toLowerCase()
      } else if (sortCol === "gateway_name") {
        av = a.gateway_name.toLowerCase()
        bv = b.gateway_name.toLowerCase()
      } else if (sortCol === "context_window") {
        av = a.context_window
        bv = b.context_window
      } else {
        av = a.pricing_input_per_m
        bv = b.pricing_input_per_m
      }

      // Nulls last
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1

      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })

    return rows
  }, [catalogQuery.data, search, gatewayFilter, capabilityFilter, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortCol(col)
      setSortDir("asc")
    }
  }

  function handleRowClick(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  function resetFilters() {
    setSearch("")
    setGatewayFilter("all")
    setCapabilityFilter("all")
  }

  // Loading state
  if (catalogQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-56 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-40 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-surface">
                <th className="px-3 py-2"><div className="h-3 w-12 rounded bg-muted animate-pulse" /></th>
                <th className="px-3 py-2"><div className="h-3 w-16 rounded bg-muted animate-pulse" /></th>
                <th className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /></th>
                <th className="px-3 py-2"><div className="h-3 w-14 rounded bg-muted animate-pulse" /></th>
                <th className="px-3 py-2"><div className="h-3 w-14 rounded bg-muted animate-pulse" /></th>
                <th className="px-3 py-2"><div className="h-3 w-14 rounded bg-muted animate-pulse" /></th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Error state
  if (catalogQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <XCircle className="size-5 text-danger shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Failed to load models</p>
            <p className="text-xs text-text3 mt-0.5">
              {catalogQuery.error instanceof Error ? catalogQuery.error.message : "An unexpected error occurred"}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search models..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-56"
        />
        <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="All gateways" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gateways</SelectItem>
            {gateways.map(gw => (
              <SelectItem key={gw.id} value={gw.id}>{gw.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="All capabilities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All capabilities</SelectItem>
            <SelectItem value="coding">Coding</SelectItem>
            <SelectItem value="writing">Writing</SelectItem>
            <SelectItem value="analysis">Analysis</SelectItem>
            <SelectItem value="vision">Vision</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-2xs text-text3">{filteredSorted.length} models</div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 text-left bg-surface">
              <SortHeader col="model_name" label="Name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader col="gateway_name" label="Gateway" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3">Capabilities</th>
              <SortHeader col="context_window" label="Context" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <SortHeader col="pricing_input_per_m" label="Price In" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-3 py-2 text-2xs font-semibold uppercase text-text3 text-right">Price Out</th>
              <th className="px-3 py-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <div className="flex items-center justify-center size-10 rounded-xl bg-muted">
                      <Server className="size-5 text-text3" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">No models match your filters</p>
                      <p className="text-xs text-text3 mt-1">Try adjusting the search or filter criteria.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>
                  </div>
                </td>
              </tr>
            )}
            {filteredSorted.map(model => (
              <React.Fragment key={model.id}>
                <tr
                  className="border-b border-border/20 last:border-0 hover:bg-surface/50 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(model.id)}
                >
                  {/* Model name */}
                  <td className="px-3 py-2">
                    <span className="text-xs font-medium text-text">{model.model_name}</span>
                  </td>

                  {/* Gateway */}
                  <td className="px-3 py-2">
                    <div>
                      <span className="text-xs text-text2">{model.gateway_name}</span>
                      <p className="text-2xs text-text3 mt-0.5">{model.gateway_type}</p>
                    </div>
                  </td>

                  {/* Capability badges */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {model.capabilities.length === 0 ? (
                        <span className="text-2xs text-text3">—</span>
                      ) : (
                        model.capabilities.map(cap => (
                          <Badge key={cap} className={`text-2xs ${capabilityColor(cap)}`}>
                            {cap}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>

                  {/* Context window */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">{fmtContext(model.context_window)}</span>
                  </td>

                  {/* Price in */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">{fmtPrice(model.pricing_input_per_m)}</span>
                  </td>

                  {/* Price out */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs tabular-nums text-text2">{fmtPrice(model.pricing_output_per_m)}</span>
                  </td>

                  {/* Expand toggle */}
                  <td className="px-3 py-2">
                    {expandedId === model.id
                      ? <ChevronDown className="size-3.5 text-text3" />
                      : <ChevronRight className="size-3.5 text-text3" />
                    }
                  </td>
                </tr>

                {/* Version history expansion row */}
                {expandedId === model.id && (
                  <tr>
                    <td colSpan={7} className="bg-raised/50 px-4 py-3">
                      <VersionPanel modelId={model.id} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
