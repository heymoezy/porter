import { useState, useMemo } from "react"
import { Link } from "react-router"
import { AgentPresenceSummary } from "~/components/agent-presence"
import {
  useCustomers, useSegments, useCreateSegment, useDeleteSegment,
  planDisplayLabel, type Customer, type AdminSegment,
} from "~/hooks/use-admin-api"
import { CustomerTagsEditor } from "~/components/customer/CustomerTagsEditor"
import { Badge } from "~/components/ui/badge"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { SegmentedControl } from "~/components/ui/segmented-control"
import { PipelineView } from "~/components/pipeline-view"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "~/components/ui/dialog"
import {
  Users, CreditCard,
  Search, ChevronRight, TrendingUp, Heart, LayoutGrid, List,
  Tag, X, Save,
} from "lucide-react"

/** Blended customer score 0-10 */
function customerScore(health: number, conversion: number, churn: number, viral: number): number {
  return Math.round(((health * 0.4) + (conversion * 0.2) + ((100 - churn) * 0.3) + (viral * 0.1)) / 10 * 10) / 10
}

function formatRelative(ts: number | null) {
  if (!ts) return "never"
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function healthDot(health: number) {
  if (health >= 70) return "bg-success"
  if (health >= 40) return "bg-warning"
  return "bg-danger"
}

function activityColor(lastSeen: number | null) {
  if (!lastSeen) return "text-text3"
  const diff = Date.now() / 1000 - lastSeen
  if (diff < 3600) return "text-success"
  if (diff < 86400) return "text-warning"
  return "text-text3"
}

type Filter = "all" | "paying" | "trial" | "free" | "suspended"

type Stats = { total: number; paying: number; trialing: number; free: number; suspended: number; preLaunch: boolean; totalAllUsers: number }

type ViewMode = "table" | "pipeline"

function CustomersContent() {
  const { data, isLoading } = useCustomers()
  const { data: segmentsData } = useSegments()
  const createSegment = useCreateSegment()
  const deleteSegment = useDeleteSegment()

  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [joinedAfter, setJoinedAfter] = useState("")
  const [joinedBefore, setJoinedBefore] = useState("")
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [segmentName, setSegmentName] = useState("")
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const stats: Stats = data?.stats ?? { total: 0, paying: 0, trialing: 0, free: 0, suspended: 0, preLaunch: true, totalAllUsers: 0 }
  const allCustomers = data?.customers ?? []

  const totalMrr = allCustomers.reduce((sum, c) => sum + (c.mrr || 0), 0)
  const avgHealth = allCustomers.length > 0
    ? Math.round(allCustomers.reduce((sum, c) => sum + c.health, 0) / allCustomers.length)
    : 0
  const activeToday = allCustomers.filter(c => { const d = c.last_seen_at ? Date.now() / 1000 - c.last_seen_at : Infinity; return d < 86400 }).length

  // Derive all unique tags from customer data
  const allTags = useMemo(() => {
    const set = new Set<string>()
    allCustomers.forEach(c => (c.tags ?? []).forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [allCustomers])

  const customers = useMemo(() => {
    let result = allCustomers
    // Filter: status
    if (filter === "paying") result = result.filter(c => c.plan === "cloud" && c.sub_status === "active")
    if (filter === "trial") result = result.filter(c => c.sub_status === "trialing")
    if (filter === "free") result = result.filter(c => (c.plan === "free" || c.sub_status === "none") && !c.suspended_at)
    if (filter === "suspended") result = result.filter(c => c.suspended_at)

    // Filter: search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.username.toLowerCase().includes(q) ||
        (c.display_name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      )
    }

    // Filter: tags (customer must have ALL selected tags)
    if (selectedTags.length > 0) {
      result = result.filter(c =>
        selectedTags.every(t => (c.tags ?? []).includes(t))
      )
    }

    // Filter: date range (based on created_at unix timestamp)
    if (joinedAfter) {
      const afterTs = new Date(joinedAfter).getTime() / 1000
      result = result.filter(c => (c.created_at ?? 0) >= afterTs)
    }
    if (joinedBefore) {
      const beforeTs = new Date(joinedBefore + "T23:59:59").getTime() / 1000
      result = result.filter(c => (c.created_at ?? 0) <= beforeTs)
    }

    return result
  }, [allCustomers, filter, search, selectedTags, joinedAfter, joinedBefore])

  const hasAdvancedFilters = selectedTags.length > 0 || joinedAfter !== "" || joinedBefore !== ""

  function loadSegment(seg: AdminSegment) {
    setActiveSegmentId(seg.id)
    setFilter((seg.filters.status as Filter) ?? "all")
    setSelectedTags(seg.filters.tags ?? [])
    setJoinedAfter(seg.filters.joinedAfter ?? "")
    setJoinedBefore(seg.filters.joinedBefore ?? "")
    setSearch(seg.filters.search ?? "")
  }

  function clearFilters() {
    setActiveSegmentId(null)
    setFilter("all")
    setSelectedTags([])
    setJoinedAfter("")
    setJoinedBefore("")
    setSearch("")
  }

  async function handleSaveSegment() {
    if (!segmentName.trim()) return
    await createSegment.mutateAsync({
      name: segmentName.trim(),
      filters: { status: filter, tags: selectedTags, joinedAfter, joinedBefore, search },
    })
    setSegmentName("")
    setSaveDialogOpen(false)
  }

  return (
    <div className="space-y-3">
      {/* Compact KPI row */}
      <div className="flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-text3">
          <Users className="size-3.5 text-accent-porter" />
          <span className="font-bold text-text text-sm">{stats.total}</span> customers
        </span>
        <span className="inline-flex items-center gap-1.5 text-text3">
          <TrendingUp className="size-3.5 text-success" />
          <span className="font-bold text-text text-sm">{activeToday}</span> active today
        </span>
        <span className="inline-flex items-center gap-1.5 text-text3">
          <CreditCard className={`size-3.5 ${totalMrr > 0 ? "text-success" : "text-text3"}`} />
          <span className="font-bold text-text text-sm">${totalMrr.toFixed(0)}</span> MRR
        </span>
        <span className="inline-flex items-center gap-1.5 text-text3">
          <Heart className={`size-3.5 ${avgHealth >= 70 ? "text-success" : avgHealth >= 40 ? "text-warning" : "text-danger"}`} />
          <span className="font-bold text-text text-sm">{avgHealth}</span> avg health
        </span>
      </div>

      {/* Saved segments row — only shown when segments exist */}
      {(segmentsData?.segments ?? []).length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs text-text3 font-medium uppercase tracking-wide mr-1">Segments</span>
          {segmentsData!.segments.map(seg => (
            <div key={seg.id} className="flex items-center gap-0.5">
              <button
                onClick={() => loadSegment(seg)}
                className={`inline-flex items-center h-6 px-2 rounded text-2xs font-medium transition-colors
                  ${activeSegmentId === seg.id
                    ? "bg-accent-porter/20 text-accent-porter"
                    : "bg-raised text-text2 hover:bg-surface hover:text-text"}`}
              >
                {seg.name}
              </button>
              <button
                onClick={() => {
                  deleteSegment.mutate(seg.id)
                  if (activeSegmentId === seg.id) clearFilters()
                }}
                className="size-4 rounded flex items-center justify-center text-text3 hover:text-danger hover:bg-danger/10 transition-colors"
                title="Delete segment"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Segmented control + search + advanced filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedControl<Filter>
          options={[
            { value: "all", label: "All", count: stats.total },
            { value: "paying", label: "Paying", count: stats.paying },
            { value: "trial", label: "Trial", count: stats.trialing },
            { value: "free", label: "Free", count: stats.free },
            { value: "suspended", label: "Suspended", count: stats.suspended },
          ]}
          value={filter}
          onChange={(v) => { setFilter(v); setActiveSegmentId(null) }}
        />

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text3" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveSegmentId(null) }}
            placeholder="Search customers..."
            className="h-8 w-[220px] bg-raised border-border2 pl-8 text-xs"
          />
        </div>

        {/* Tag filter popover */}
        <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={selectedTags.length > 0 ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <Tag className="size-3" />
              {selectedTags.length > 0 ? `Tags (${selectedTags.length})` : "Tags"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            {allTags.length === 0 ? (
              <p className="text-2xs text-text3 px-1 py-2">No tags yet — add tags to customers first</p>
            ) : (
              <div className="space-y-1">
                {allTags.map(tag => (
                  <label key={tag} className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-surface text-xs">
                    <Checkbox
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={(checked) => {
                        setSelectedTags(prev =>
                          checked ? [...prev, tag] : prev.filter(t => t !== tag)
                        )
                        setActiveSegmentId(null)
                      }}
                    />
                    <span className="text-text">{tag}</span>
                  </label>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Date range filters */}
        <div className="flex items-center gap-1 text-xs">
          <input
            type="date"
            value={joinedAfter}
            onChange={e => { setJoinedAfter(e.target.value); setActiveSegmentId(null) }}
            title="Joined after"
            className="h-8 w-[115px] rounded-md border border-border bg-raised px-2 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent-porter"
          />
          <span className="text-text3">–</span>
          <input
            type="date"
            value={joinedBefore}
            onChange={e => { setJoinedBefore(e.target.value); setActiveSegmentId(null) }}
            title="Joined before"
            className="h-8 w-[115px] rounded-md border border-border bg-raised px-2 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent-porter"
          />
        </div>

        {/* Clear + Save — only when filters are active */}
        {(hasAdvancedFilters || filter !== "all" || search) && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters} title="Clear all filters">
              <X className="size-3" /> Clear
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setSaveDialogOpen(true)} title="Save as segment">
              <Save className="size-3" /> Save
            </Button>
          </div>
        )}

        <div className="flex items-center gap-0.5">
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            className="size-8"
            onClick={() => setViewMode("table")}
            title="Table view"
          >
            <List className="size-3.5" />
          </Button>
          <Button
            variant={viewMode === "pipeline" ? "secondary" : "ghost"}
            size="icon"
            className="size-8"
            onClick={() => setViewMode("pipeline")}
            title="Pipeline view"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Customer table / Pipeline view */}
      {viewMode === "pipeline" ? (
        <PipelineView customers={customers} preLaunch={stats.preLaunch} />
      ) : (
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[2fr_50px_90px_140px_90px_90px_28px] gap-2 border-b border-border bg-surface px-3 py-2">
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Customer</span>
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Score</span>
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Role</span>
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Plan</span>
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Status</span>
          <span className="text-2xs font-semibold uppercase tracking-wide text-text3">Last Active</span>
          <span />
        </div>

        {customers.length === 0 ? (
          <div className="py-8 text-center text-sm text-text3">No customers match</div>
        ) : (
          customers.map((c, i) => {
            const label = planDisplayLabel(c, stats.preLaunch)
            const isSuspended = !!c.suspended_at

            return (
              <Link
                key={c.username}
                to={`/users/${c.username}`}
                className="grid grid-cols-[2fr_50px_90px_140px_90px_90px_28px] gap-2 items-center border-b border-border/50 px-3 py-2.5 last:border-0 transition-colors hover:bg-surface/60 animate-list-stagger-in"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                {/* Customer */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-8 items-center justify-center rounded-full bg-accent-porter/15 text-xs font-bold text-accent-porter shrink-0">
                    {(c.display_name || c.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{c.full_name || c.display_name || c.username}</p>
                    <p className="text-2xs text-text3 truncate">{c.email ?? `@${c.username}`}</p>
                    {c.tags && c.tags.length > 0 && (
                      <CustomerTagsEditor username={c.username} tags={c.tags} className="mt-0.5" />
                    )}
                  </div>
                </div>

                {/* Score */}
                {(() => {
                  const cs = customerScore(c.health, c.conversion, c.churn, c.viral)
                  return <span className={`text-sm font-bold tabular-nums ${cs >= 7 ? "text-success" : cs >= 4 ? "text-warning" : "text-danger"}`}>{cs}</span>
                })()}

                {/* Role */}
                <span className="text-2xs text-text2 capitalize">{c.role ?? "operator"}</span>

                {/* Plan badge */}
                <div>
                  {label.includes("lifetime") ? (
                    <Badge variant="default" className="bg-accent-porter/15 text-accent-porter border-0 text-2xs">{label}</Badge>
                  ) : label.includes("Cloud") || label.includes("Team") || label.includes("Enterprise") ? (
                    <Badge variant="default" className="bg-success/15 text-success border-0 text-2xs">{label}</Badge>
                  ) : label.includes("Trial") ? (
                    <Badge variant="default" className="bg-warning/15 text-warning border-0 text-2xs">{label}</Badge>
                  ) : label.includes("pre-launch") ? (
                    <Badge variant="outline" className="text-text2 border-text3/20 text-2xs">{label}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-text3 border-text3/20 text-2xs">{label}</Badge>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  {isSuspended ? (
                    <>
                      <div className="size-2 rounded-full bg-danger" />
                      <span className="text-2xs text-danger font-medium">Suspended</span>
                    </>
                  ) : (
                    <>
                      <div className={`size-2 rounded-full ${healthDot(c.health)}`} />
                      <span className={`text-2xs font-medium ${activityColor(c.last_seen_at)}`}>Active</span>
                    </>
                  )}
                </div>

                {/* Last Active */}
                <span className="text-2xs text-text2">{formatRelative(c.last_seen_at)}</span>

                <ChevronRight className="size-3.5 text-text3" />
              </Link>
            )
          })
        )}
      </div>
      )}

      {/* Save segment dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Save Segment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs text-text2">Segment name</Label>
            <Input
              value={segmentName}
              onChange={e => setSegmentName(e.target.value)}
              placeholder="e.g. High-value trial users"
              className="h-8 text-xs"
              onKeyDown={e => e.key === "Enter" && handleSaveSegment()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSegment} disabled={!segmentName.trim() || createSegment.isPending}>
              {createSegment.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function UsersPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <AgentPresenceSummary surface="users" className="mb-3" />
        <CustomersContent />
      </div>
  )
}
