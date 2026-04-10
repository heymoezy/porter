import { useState } from "react"
import { Lightbulb, ChevronLeft, ChevronRight } from "lucide-react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { AppShell } from "~/components/layout/app-shell"
import { NotificationBar } from "~/components/notification-bar"
import { HeroStats } from "~/components/dashboard/hero-stats"
import { StatTiles } from "~/components/dashboard/stat-tiles"
import { ProjectList } from "~/components/dashboard/project-list"
import { Badge } from "~/components/ui/badge"
import { Sparkline } from "~/components/ui/sparkline"
import { ActivityFeed, type ActivityItem } from "~/components/dashboard/activity-feed"
import { LLMActivity } from "~/components/dashboard/llm-activity"
import { PixelPortrait } from "~/components/pixel-portrait"

/* ── Agent Supervisor Headers ── */
const AGENT_PRESETS: Record<string, { skin: string; hair: string; eyes: string; shirt: string; hairStyle: "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail" }> = {
  pm:       { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#6366F1", hairStyle: "parted" },
  ops:      { skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#22C55E", hairStyle: "curly" },
  strategy: { skin: "#D4A574", hair: "#1A1A2E", eyes: "#1A1A2E", shirt: "#F59E0B", hairStyle: "buzz" },
  router:   { skin: "#E0AC69", hair: "#4A2912", eyes: "#1A1A2E", shirt: "#818CF8", hairStyle: "short" },
}

function AgentSupervisor({ agent, name, desc }: { agent: string; name: string; desc: string; accent: string; activity?: string }) {
  const ap = AGENT_PRESETS[agent] ?? AGENT_PRESETS.ops
  // Agents not born yet — ghost state until Forge creates them
  return (
    <div className="rounded-lg border border-border/30 px-3 py-2 mb-2 bg-card">
      <div className="flex items-center gap-2.5">
        <div className="grayscale opacity-40">
          <PixelPortrait skin={ap.skin} hair={ap.hair} eyes={ap.eyes} shirt={ap.shirt} hairStyle={ap.hairStyle} size="xs" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-text2">{name}</p>
          <p className="text-[10px] text-text3 truncate">{desc}</p>
        </div>
        <span className="flex items-center gap-1 text-[8px] text-text3 font-mono shrink-0">
          <span className="size-1.5 rounded-full bg-text3/40" />
          pending
        </span>
      </div>
    </div>
  )
}

/* ── Feed seed data ── */
const FEED_ITEMS = [
  { agent: "Sam", action: "Finished homepage copy draft", skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#22C55E", hs: "curly" as const, status: "complete" as const },
  { agent: "Maya", action: "Designing hero section layout", skin: "#F5D0A9", hair: "#2C1B18", eyes: "#1A1A2E", shirt: "#6366F1", hs: "long" as const, status: "working" as const },
  { agent: "Dev", action: "Set up project scaffolding", skin: "#E0AC69", hair: "#4A2912", eyes: "#1A1A2E", shirt: "#3B82F6", hs: "short" as const, status: "complete" as const },
  { agent: "Porter", action: "Assigned 3 agents to Marketing Site", skin: "#F5D0A9", hair: "#D4A76A", eyes: "#1A1A2E", shirt: "#F59E0B", hs: "parted" as const, status: "complete" as const },
  { agent: "Copy", action: "Queued: Write about page content", skin: "#C68642", hair: "#2C1B18", eyes: "#1A1A2E", shirt: "#8B5CF6", hs: "mohawk" as const, status: "queued" as const },
  { agent: "Maya", action: "Exported color palette — 5 variants", skin: "#F5D0A9", hair: "#2C1B18", eyes: "#1A1A2E", shirt: "#6366F1", hs: "long" as const, status: "complete" as const },
  { agent: "Porter", action: "Routed code review to Claude Opus", skin: "#F5D0A9", hair: "#D4A76A", eyes: "#1A1A2E", shirt: "#F59E0B", hs: "parted" as const, status: "complete" as const },
  { agent: "Sam", action: "Writing SEO meta descriptions", skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#22C55E", hs: "curly" as const, status: "working" as const },
  { agent: "Moe", action: "messaged Maya via WhatsApp: 'make the hero bolder'", skin: "#E0AC69", hair: "#2C1B18", eyes: "#1A1A2E", shirt: "#64748B", hs: "short" as const, status: "complete" as const },
  { agent: "Jacob", action: "viewed Brand Guide deliverables", skin: "#FFDBB4", hair: "#D4A76A", eyes: "#1A1A2E", shirt: "#14B8A6", hs: "buzz" as const, status: "complete" as const },
]

const ALL_NOTIFICATIONS = [
  { id: 1, text: "Marketing Site proposal needs approval", type: "approval", color: "warning", action: "Review →" },
  { id: 2, text: "Maya encountered an error on Brand Guide", type: "error", color: "danger", action: "View →" },
  { id: 3, text: "Brand Guide milestone 1 complete!", type: "milestone", color: "success", action: "See →" },
]

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [resolved, setResolved] = useState<Set<number>>(new Set())
  const [attIdx, setAttIdx] = useState(0)
  const [tokenCount, setTokenCount] = useState(14280)
  const [ideaIdx, setIdeaIdx] = useState(0)
  const [viewH, setViewH] = useState(900)
  const [timeline, setTimeline] = useState<ActivityItem[]>(
    FEED_ITEMS.slice(0, 8).map((e, i) => ({ ...e, _key: i, _sec: i * 150 }))
  )

  useMountEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    setViewH(window.innerHeight)
    const onResize = () => setViewH(window.innerHeight)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  })

  useMountEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  })

  useMountEffect(() => {
    let idx = 8
    const id = setInterval(() => {
      const n = FEED_ITEMS[idx % FEED_ITEMS.length]
      idx++
      setTimeline(p => [{ ...n, _key: Date.now(), _sec: 0 }, ...p.slice(0, 9)])
    }, 5000)
    return () => clearInterval(id)
  })

  // Derived notification lists
  const unresolvedNotifications = ALL_NOTIFICATIONS.filter(n => !resolved.has(n.id))
  const visibleNotifications = unresolvedNotifications.filter(n => !dismissed.has(n.id))
  const bellCount = unresolvedNotifications.length

  // Auto-cycle visible notifications (uses refs to avoid stale closure)
  useMountEffect(() => {
    const id = setInterval(() => {
      setDismissed(d => {
        setResolved(r => {
          const visible = ALL_NOTIFICATIONS.filter(n => !r.has(n.id) && !d.has(n.id))
          if (visible.length > 1) setAttIdx(i => (i + 1) % visible.length)
          return r
        })
        return d
      })
    }, 8000)
    return () => clearInterval(id)
  })

  function handleDismiss(id: number) {
    setDismissed(prev => new Set(prev).add(id))
    setResolved(prev => new Set(prev).add(id))
    setAttIdx(0)
  }
  function handleAction(id: number) {
    setResolved(prev => new Set(prev).add(id))
    setDismissed(prev => { const n = new Set(prev); n.delete(id); return n })
    setAttIdx(0)
  }
  function handleAutoHandle(id: number) {
    setResolved(prev => new Set(prev).add(id))
    setDismissed(prev => { const n = new Set(prev); n.delete(id); return n })
    setAttIdx(0)
  }

  useMountEffect(() => {
    const id = setInterval(() => setTokenCount(t => t + Math.floor(Math.random() * 40 + 10)), 3000)
    return () => clearInterval(id)
  })

  useMountEffect(() => {
    const id = setInterval(() => setIdeaIdx(i => (i + 1) % 5), 6000)
    return () => clearInterval(id)
  })

  const projectCount = viewH > 1000 ? 5 : viewH > 800 ? 4 : viewH > 650 ? 3 : 2
  const activityCount = viewH > 1000 ? 8 : viewH > 800 ? 6 : viewH > 650 ? 4 : 3
  const ideaCount = 1

  return (
    <AppShell notificationCount={bellCount}>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">

          {/* Fixed top: notification + hero + stats */}
          <div className="shrink-0 px-6 pt-4 space-y-3">
            {/* Notifications */}
            {visibleNotifications.length > 0 && (
              <NotificationBar
                items={visibleNotifications}
                activeIdx={attIdx % visibleNotifications.length}
                total={bellCount}
                onPrev={() => setAttIdx(i => (i - 1 + visibleNotifications.length) % visibleNotifications.length)}
                onNext={() => setAttIdx(i => (i + 1) % visibleNotifications.length)}
                onDismiss={handleDismiss}
                onAction={handleAction}
                onAutoHandle={handleAutoHandle}
              />
            )}

            <HeroStats mounted={mounted} />
            <StatTiles mounted={mounted} tokenCount={tokenCount} />
          </div>

          {/* Scrollable middle: projects + activity */}
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 px-6 mt-3">
            <div className="lg:w-1/2 min-w-0 flex flex-col min-h-0 overflow-hidden rounded-lg border border-accent-porter/20 bg-gradient-to-b from-accent-porter/3 to-transparent p-3" style={{ maxWidth: "50%" }}>
              <div className="shrink-0">
                <AgentSupervisor agent="pm" name="Project Manager" desc="Tracking progress, assigning agents, reporting blockers" accent="text-accent-porter" activity="Monitoring active sprints and deadlines" />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ProjectList mounted={mounted} maxItems={projectCount} />
              </div>
            </div>
            <div className="lg:w-1/2 min-w-0 flex flex-col min-h-0 overflow-hidden rounded-lg border border-success/20 bg-gradient-to-b from-success/3 to-transparent p-3" style={{ maxWidth: "50%" }}>
              <div className="shrink-0">
                <AgentSupervisor agent="ops" name="Operations" desc="Monitoring all platform activity, detecting patterns" accent="text-success" activity="Processing events and flagging anomalies" />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ActivityFeed items={timeline} elapsed={elapsed} maxItems={activityCount} />
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mx-6 mt-3 mb-4 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">
              <div className="lg:w-1/2 min-w-0 flex flex-col">
                <AgentSupervisor agent="strategy" name="Strategy" desc="Analyzing market opportunities, generating project ideas" accent="text-warning" activity="Scanning trends and competitor moves" />
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Lightbulb className="h-3 w-3 text-warning" />
                    Project Ideas
                  </h2>
                </div>
                {(() => {
                  const ideas = [
                    { name: "Bakery SEO Package", idea: "Local SEO + Google Business Profile optimization", spark: [2,4,6,5,8,7,9,10], agents: 2 },
                    { name: "Social Media Audit", idea: "Analyze engagement metrics across all platforms", spark: [1,3,5,4,6,8,7,9], agents: 3 },
                    { name: "Email Drip Campaign", idea: "5-email onboarding sequence for new signups", spark: [0,1,2,4,5,6,8,10], agents: 2 },
                    { name: "Competitor Report", idea: "Monthly competitor pricing and feature comparison", spark: [3,5,4,7,6,8,9,11], agents: 1 },
                    { name: "Landing Page Redesign", idea: "A/B test hero variants with conversion tracking", spark: [2,3,5,7,9,8,10,12], agents: 4 },
                  ]
                  const idea = ideas[ideaIdx % ideas.length]
                  return (
                    <div key={ideaIdx} className="group flex-1 rounded-lg border border-border bg-surface p-3 cursor-pointer transition-all duration-[var(--duration-fast)] hover:border-accent-porter/30 hover:shadow-[var(--shadow-card)] hover:-translate-y-px animate-carousel-in">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-foreground truncate flex-1 min-w-0">{idea.name}</p>
                        <Sparkline values={idea.spark} />
                        <Badge className="text-[8px] px-1 py-0 bg-warning/15 text-warning">suggested</Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-raised overflow-hidden">
                          <div className="h-full rounded-full bg-warning/50" style={{ width: "0%" }} />
                        </div>
                        <span className="text-[9px] text-text3 tabular-nums w-6">0%</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <p className="text-[10px] text-text3 truncate flex-1 min-w-0">
                          <span className="text-text2">Idea:</span> {idea.idea}
                        </p>
                        <span className="text-[9px] text-text3">{idea.agents} agents</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div className="lg:w-1/2 min-w-0 flex flex-col">
                <AgentSupervisor agent="router" name="AI Router" desc="Routing queries to optimal models, managing token budget" accent="text-chart-2" activity="Optimizing model selection and cost" />
                <LLMActivity mounted={mounted} className="flex-1" />
              </div>
            </div>
          </div>

        </div>
    </AppShell>
  )
}
