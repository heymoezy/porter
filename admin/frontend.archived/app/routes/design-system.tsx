import { useState, useEffect, useRef, useCallback } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { PorterLogo } from "~/components/porter-logo"
import { LLMTerminal } from "~/components/llm-terminal"
import { PixelPortrait } from "~/components/pixel-portrait"
import { PixelPortraitEditorDemo } from "~/components/pixel-portrait-editor"
import { FileTypeIcon, FileTypeIconGallery } from "~/components/file-type-icon"
import { ModelCombobox } from "~/components/model-combobox"
import { Button } from "~/components/ui/button"
import { Calendar } from "~/components/ui/calendar"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Badge } from "~/components/ui/badge"
import { Separator } from "~/components/ui/separator"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Card, CardContent } from "~/components/ui/card"
import { Switch } from "~/components/ui/switch"
import { Progress } from "~/components/ui/progress"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import { Checkbox } from "~/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Slider } from "~/components/ui/slider"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "~/components/ui/command"
import {
  FolderKanban, Bot, FileText, Users, Box, Monitor, Link, Brain, Shield,
  Moon, Sun, Settings, LogOut, Menu, ChevronRight, ChevronLeft,
  Plus, Search, MoreHorizontal, Check, X, AlertTriangle, Info,
  Clock, Zap, MessageSquare, BrainCircuit, Sparkles,
  Activity, Wifi, WifiOff, RefreshCw, Copy, Trash2,
  ExternalLink, Upload, Folder, MoreVertical, Eye, EyeOff,
  ArrowRight, Loader2, Send, Heart, Star,
  Palette, Type, ToggleLeft, LayoutGrid, Tag, CircleUser,
  PanelLeft, Rows3, MessagesSquare, BarChart3, Bell,
  Play, Hash, Share2, AtSign, Repeat2, BarChart2,
  Cpu, Globe, Server,
  Code2, Image,
  GripVertical,
  CheckCircle2, XCircle,
  MessageCircle,
  ArrowUpDown, ArrowUp, ArrowDown,
  ChevronDown, ChevronsLeft, ChevronsRight,
  FolderOpen, FolderClosed, FileCode, FileImage, FileJson,
  Minus, Home,
  Layers, Grid3X3, Maximize, PanelRight,
  Terminal, AlertOctagon,
  CloudOff, RotateCw,
  Paintbrush, MonitorSmartphone, Video, BookOpen,
  Pin, Smartphone, Tablet, Laptop,
  Volume2, Maximize2, SkipForward,
  Wrench, CreditCard, Target, Flame,
} from "lucide-react"

/* ============================================================
   CONSTANTS
   ============================================================ */
/* Tab groups for condensed layout */

/* ============================================================
   HELPERS
   ============================================================ */

function CalendarDemo({ mode, dropdown }: { mode: "single"; dropdown?: boolean }) {
  const [date, setDate] = useState<Date | undefined>(new Date())
  return (
    <div className="rounded-xl border border-border bg-surface w-fit">
      <Calendar
        mode={mode}
        selected={date}
        onSelect={setDate}
        {...(dropdown ? { captionLayout: "dropdown" } : {})}
      />
    </div>
  )
}
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  )
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-text3">{title}</h3>
      {children}
    </div>
  )
}

function Swatch({ name, cls, hex }: { name: string; cls: string; hex: string }) {
  return (
    <div className="text-center">
      <div className={`h-14 rounded-lg border border-border2/30 ${cls}`} />
      <p className="mt-1.5 text-xs font-medium text-text2">{name}</p>
      <p className="font-mono text-2xs text-text3">{hex}</p>
    </div>
  )
}

/** CSS-only horizontal bar chart */
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value))
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-16 text-right text-2xs text-text2 shrink-0">{d.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${(d.value / max) * 100}%`, background: `var(--${d.color})` }}
            />
          </div>
          <span className="w-10 text-left text-2xs font-medium text-foreground">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

/** CSS-only sparkline */
function Sparkline({ values, color = "accent-porter" }: { values: number[]; color?: string }) {
  const max = Math.max(...values)
  return (
    <div className="inline-flex items-end gap-px h-4">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm transition-all duration-300"
          style={{
            height: `${Math.max(15, (v / max) * 100)}%`,
            background: `var(--${color})`,
            opacity: 0.4 + (v / max) * 0.6,
          }}
        />
      ))}
    </div>
  )
}

/** CSS-only progress bar */
function ProgressBar({ value, color = "accent-porter", thin = false }: { value: number; color?: string; thin?: boolean }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-raised ${thin ? "h-1" : "h-2"}`}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${value}%`, background: `var(--${color})` }}
      />
    </div>
  )
}

/** CSS-only status gauge */
function StatusGauge({ segments }: { segments: { pct: number; color: string }[] }) {
  return (
    <div className="flex h-3 w-48 overflow-hidden rounded-full bg-raised">
      {segments.map((s, i) => (
        <div
          key={i}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${s.pct}%`, background: `var(--${s.color})` }}
        />
      ))}
    </div>
  )
}

/** Progress ring (SVG) */
function ProgressRing({ pct, size = 48, color = "accent-porter" }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--raised)" strokeWidth={4} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={`var(--${color})`}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="progress-ring-circle"
      />
    </svg>
  )
}

/* ============================================================
   INTERACTIVE COMPONENTS
   ============================================================ */

/** Animated Badge Counter -- scales in when toggled */
function AnimatedBadgeCounter() {
  const [count, setCount] = useState(3)
  const [animKey, setAnimKey] = useState(0)

  function bump() {
    setCount(c => c + 1)
    setAnimKey(k => k + 1)
  }
  function reset() {
    setCount(0)
    setAnimKey(k => k + 1)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative inline-flex">
        <Bell className="h-5 w-5 text-text2" />
        {count > 0 && (
          <Badge
            key={animKey}
            className="absolute -right-2 -top-2 animate-badge-scale-in bg-danger text-white text-2xs px-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full"
          >
            {count}
          </Badge>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={bump}>+1</Button>
      <Button size="sm" variant="ghost" onClick={reset}>Reset</Button>
    </div>
  )
}

/** Animated Digit Counter -- rolls when value changes */
function AnimatedDigitCounter() {
  const [value, setValue] = useState(42)
  const [animKey, setAnimKey] = useState(0)

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-0.5 rounded-lg bg-surface px-3 py-2 border border-border">
        {String(value).split("").map((d, i) => (
          <span
            key={`${animKey}-${i}`}
            className="inline-block text-xl font-bold text-foreground tabular-nums animate-digit-roll"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {d}
          </span>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => { setValue(v => v + 7); setAnimKey(k => k + 1) }}>+7</Button>
      <Button size="sm" variant="outline" onClick={() => { setValue(v => Math.max(0, v - 3)); setAnimKey(k => k + 1) }}>-3</Button>
    </div>
  )
}

/** Collapsible Chat Section */
function CollapsibleChatSection() {
  const [expanded, setExpanded] = useState(false)
  const lines = [
    "import { dispatch } from './porter'",
    "import { models } from './registry'",
    "import { memory } from './cortex'",
    "",
    "// Initialize agent team",
    "const team = await dispatch.createTeam({",
    "  lead: 'porter',",
    "  workers: ['maya', 'dev', 'sam'],",
    "  project: 'marketing-site',",
    "})",
    "",
    "// Start design phase",
    "await team.execute('design')",
    "",
    "// Run QA checks",
    "const results = await team.test()",
    "console.log(results.passed, results.failed)",
    "",
    "// Deploy if all green",
    "if (results.failed === 0) {",
    "  await team.deploy('production')",
    "}",
    "// ... more setup code",
  ]

  return (
    <div className="max-w-lg">
      <div className="rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5">
        <p className="text-sm text-foreground mb-2">Here is the setup code:</p>
        <div className="rounded bg-[#0D1117] p-3 font-mono text-2xs leading-relaxed text-text2 overflow-hidden">
          {(expanded ? lines : lines.slice(0, 5)).map((l, i) => (
            <div key={i}>{l || "\u00A0"}</div>
          ))}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-accent-porter hover:text-accent-hover transition-colors"
        >
          {expanded ? "Show less" : `Show ${lines.length - 5} more lines`}
        </button>
      </div>
    </div>
  )
}

/** Rich Activity Feed with filters */
function RichActivityFeed() {
  const [filter, setFilter] = useState<"all" | "agents" | "system" | "decisions">("all")

  const events = [
    { type: "agents" as const, icon: "check", agent: "Maya", text: "Completed homepage design", time: "2 min ago", color: "success" },
    { type: "agents" as const, icon: "working", agent: "Sam", text: "Started writing blog post", time: "5 min ago", color: "accent-porter" },
    { type: "agents" as const, icon: "error", agent: "Dev", text: "Build failed: type error in auth.ts", time: "8 min ago", color: "danger" },
    { type: "system" as const, icon: "memory", agent: "Porter", text: "Learned: Moe prefers concise copy", time: "12 min ago", color: "chart-2" },
    { type: "decisions" as const, icon: "decision", agent: "Porter", text: "Routed to Claude Opus (complex reasoning)", time: "15 min ago", color: "accent-porter" },
    { type: "system" as const, icon: "system", agent: "System", text: "Ollama service restarted", time: "20 min ago", color: "text3" },
  ]

  const filtered = filter === "all" ? events : events.filter(e => e.type === filter)

  return (
    <div className="max-w-lg space-y-3">
      <div className="flex gap-1 rounded-lg bg-raised p-1 w-fit">
        {(["all", "agents", "system", "decisions"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-2xs font-medium transition-all duration-150 capitalize ${
              filter === f ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {filtered.map((e, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2.5 transition-all hover:border-border2">
            {/* Icon */}
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              e.icon === "check" ? "bg-success/15" :
              e.icon === "working" ? "bg-accent-porter/15" :
              e.icon === "error" ? "bg-danger/15" :
              e.icon === "memory" ? "bg-chart-2/15" :
              e.icon === "decision" ? "bg-accent-porter/15" :
              "bg-raised"
            }`}>
              {e.icon === "check" && <Check className="h-3.5 w-3.5 text-success" />}
              {e.icon === "working" && (
                <div className="relative">
                  <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#22C55E" hairStyle="curly" size="sm" isAnimated />
                </div>
              )}
              {e.icon === "error" && <XCircle className="h-3.5 w-3.5 text-danger" />}
              {e.icon === "memory" && <Brain className="h-3.5 w-3.5 text-chart-2" />}
              {e.icon === "decision" && <Cpu className="h-3.5 w-3.5 text-accent-porter" />}
              {e.icon === "system" && <Server className="h-3.5 w-3.5 text-text3" />}
            </div>
            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground">
                <span className="font-bold">{e.agent}</span>{" "}
                {e.text}
              </p>
              <p className="text-2xs text-text3">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Notification Carousel -- Needs Your Attention */
function NotificationCarousel() {
  const items = [
    { type: "approval" as const, text: "Maya submitted homepage design for review", badge: "Approve" },
    { type: "error" as const, text: "Build failed in project Marketing Site", badge: "Review" },
    { type: "milestone" as const, text: "Sprint 1 milestone reached: 8/8 tasks done", badge: "View" },
    { type: "checkpoint" as const, text: "Dev is waiting at deployment checkpoint", badge: "Continue" },
    { type: "approval" as const, text: "Sam drafted blog post for approval", badge: "Read" },
  ]

  const [current, setCurrent] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  const prev = () => { setCurrent(c => (c - 1 + items.length) % items.length); setAnimKey(k => k + 1) }
  const next = () => { setCurrent(c => (c + 1) % items.length); setAnimKey(k => k + 1) }

  const item = items[current]

  const borderColor = item.type === "error" ? "border-danger/30" :
    item.type === "milestone" ? "border-success/30" :
    item.type === "checkpoint" ? "border-warning/30" :
    "border-accent-porter/30"

  const badgeColor = item.type === "error" ? "bg-danger/15 text-danger" :
    item.type === "milestone" ? "bg-success/15 text-success" :
    item.type === "checkpoint" ? "bg-warning/15 text-warning" :
    "bg-accent-porter/15 text-accent-porter"

  return (
    <div className={`flex items-center gap-2 rounded-lg border ${borderColor} bg-surface px-3 py-2.5 max-w-xl transition-colors`}>
      <button onClick={prev} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text3 hover:text-text2 hover:bg-raised transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div key={animKey} className="flex-1 flex items-center gap-2 min-w-0 animate-carousel-in">
        <p className="text-xs text-foreground truncate flex-1">{item.text}</p>
        <Badge className={`shrink-0 text-2xs px-2 py-0.5 ${badgeColor}`}>{item.badge}</Badge>
      </div>
      <span className="text-2xs text-text3 shrink-0 tabular-nums">{current + 1} of {items.length}</span>
      <button onClick={next} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text3 hover:text-text2 hover:bg-raised transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Full Motion Spec interactive demos */
function MotionSpecDemos() {
  const [activeDemo, setActiveDemo] = useState<string | null>(null)

  const trigger = (name: string) => {
    setActiveDemo(null)
    requestAnimationFrame(() => setActiveDemo(name))
  }

  const demos = [
    { name: "page", label: "Page transition", desc: "Fade + slide (250ms)" },
    { name: "drill-in", label: "Drill-in", desc: "Slide right + scale (250ms)" },
    { name: "drill-out", label: "Drill-out", desc: "Reverse drill (250ms)" },
    { name: "hover", label: "Component hover", desc: "Lift + shadow (150ms)" },
    { name: "tab", label: "Tab switch", desc: "Crossfade (200ms)" },
    { name: "sidebar", label: "Sidebar expand", desc: "Width slide (250ms)" },
    { name: "dropdown", label: "Dropdown open", desc: "Scale from origin (200ms)" },
    { name: "toast-enter", label: "Toast enter", desc: "Slide up (200ms)" },
    { name: "toast-exit", label: "Toast exit", desc: "Fade out (150ms)" },
    { name: "stagger", label: "List stagger", desc: "40ms between items" },
    { name: "card-deal", label: "Card deal", desc: "Staggered card-deal-in" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-2xl">
        {demos.map(d => (
          <div key={d.name} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex-1">
              <p className="text-xs font-bold text-foreground">{d.label}</p>
              <p className="text-2xs text-text3">{d.desc}</p>
            </div>
            <button
              onClick={() => trigger(d.name)}
              className="flex h-7 items-center gap-1 rounded-md bg-accent-porter/10 px-2.5 text-2xs font-medium text-accent-porter hover:bg-accent-porter/20 transition-colors"
            >
              <Play className="h-3 w-3" />Play
            </button>
          </div>
        ))}
      </div>

      {/* Preview area */}
      <div className="rounded-xl border border-border bg-background p-6 min-h-[120px] flex items-center justify-center overflow-hidden max-w-2xl">
        {!activeDemo && <p className="text-xs text-text3">Click Play to preview an animation</p>}

        {activeDemo === "page" && (
          <div className="animate-page-fade-slide rounded-lg border border-border bg-surface px-8 py-4 text-xs text-foreground">Page content appears</div>
        )}
        {activeDemo === "drill-in" && (
          <div className="animate-drill-in rounded-lg border border-border bg-surface px-8 py-4 text-xs text-foreground">Detail view slides in</div>
        )}
        {activeDemo === "drill-out" && (
          <div className="animate-drill-out rounded-lg border border-border bg-surface px-8 py-4 text-xs text-foreground">View slides out</div>
        )}
        {activeDemo === "hover" && (
          <div className="rounded-lg border border-border bg-surface px-8 py-4 text-xs text-foreground transition-all duration-[150ms] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] cursor-pointer">
            Hover me
          </div>
        )}
        {activeDemo === "tab" && (
          <div className="animate-tab-crossfade rounded-lg border border-border bg-surface px-8 py-4 text-xs text-foreground">Tab content crossfades</div>
        )}
        {activeDemo === "sidebar" && (
          <div className="animate-sidebar-expand h-20 rounded-lg border border-border bg-surface overflow-hidden">
            <div className="p-3 text-2xs text-text2 whitespace-nowrap">Sidebar expands</div>
          </div>
        )}
        {activeDemo === "dropdown" && (
          <div className="animate-dropdown-open rounded-lg border border-border bg-surface px-6 py-3 text-xs text-foreground shadow-[var(--shadow-dropdown)]">
            <p className="text-xs font-medium text-foreground mb-1">Dropdown</p>
            <p className="text-2xs text-text2">Option 1</p>
            <p className="text-2xs text-text2">Option 2</p>
            <p className="text-2xs text-text2">Option 3</p>
          </div>
        )}
        {activeDemo === "toast-enter" && (
          <div className="animate-toast-enter rounded-full border border-border2 bg-surface px-5 py-2 text-xs text-foreground shadow-[var(--shadow-lg)]">
            Toast slides up
          </div>
        )}
        {activeDemo === "toast-exit" && (
          <div className="animate-toast-exit rounded-full border border-border2 bg-surface px-5 py-2 text-xs text-foreground shadow-[var(--shadow-lg)]">
            Toast fades out
          </div>
        )}
        {activeDemo === "stagger" && (
          <div className="space-y-1.5 w-full max-w-[300px]">
            {["Task 1: Design review", "Task 2: Code refactor", "Task 3: Write tests", "Task 4: Deploy staging", "Task 5: QA pass"].map((item, i) => (
              <div
                key={item}
                className={`animate-list-stagger-in stagger-${i + 1} rounded border border-border bg-surface px-3 py-1.5 text-xs text-foreground`}
              >
                {item}
              </div>
            ))}
          </div>
        )}
        {activeDemo === "card-deal" && (
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`animate-card-deal-in deal-${i} h-20 w-14 rounded-lg border border-border bg-surface`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Post Composer */
function PostComposer() {
  const [text, setText] = useState("")
  const maxLen = 280
  const remaining = maxLen - text.length
  const pct = Math.min((text.length / maxLen) * 100, 100)

  return (
    <div className="max-w-md rounded-xl border border-border bg-surface p-4">
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-accent-porter text-sm font-bold text-white">P</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, maxLen))}
            placeholder="What's happening?"
            rows={3}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-text3 focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <div className="flex items-center gap-2">
              <button className="flex h-7 w-7 items-center justify-center rounded-md text-accent-porter hover:bg-accent-porter/10 transition-colors">
                <Image className="h-4 w-4" />
              </button>
              <button className="flex h-7 w-7 items-center justify-center rounded-md text-accent-porter hover:bg-accent-porter/10 transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <ProgressRing pct={pct} size={24} color={remaining < 20 ? "danger" : remaining < 50 ? "warning" : "accent-porter"} />
                {remaining <= 20 && (
                  <span className={`absolute inset-0 flex items-center justify-center text-2xs font-bold ${remaining < 0 ? "text-danger" : "text-warning"}`}>
                    {remaining}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                className="bg-accent-porter font-bold text-white hover:bg-accent-hover rounded-full px-4"
                disabled={text.length === 0}
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   INTERACTIVE COMPONENTS — BATCH 3
   ============================================================ */

/** Sortable Table with clickable column headers */
function SortableTable() {
  const [sortCol, setSortCol] = useState<string>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const data = [
    { name: "Porter", status: "online", model: "gpt-5.4", lastActive: "2 min ago", tasks: 42 },
    { name: "Maya", status: "working", model: "claude-opus", lastActive: "Just now", tasks: 18 },
    { name: "Dev", status: "online", model: "claude-opus", lastActive: "5 min ago", tasks: 31 },
    { name: "Sam", status: "offline", model: "qwen-2.5", lastActive: "3 hrs ago", tasks: 7 },
    { name: "Casey", status: "error", model: "gemini-2.0", lastActive: "1 hr ago", tasks: 12 },
  ]

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortCol as keyof typeof a]
    const bVal = b[sortCol as keyof typeof b]
    if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal
    return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
  })

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 text-text3 opacity-40" />
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-accent-porter" /> : <ArrowDown className="h-3 w-3 text-accent-porter" />
  }

  const cols = [
    { key: "name", label: "Name" },
    { key: "status", label: "Status" },
    { key: "model", label: "Model" },
    { key: "lastActive", label: "Last Active" },
    { key: "tasks", label: "Tasks" },
  ]

  return (
    <div className="max-w-2xl overflow-hidden rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface">
            {cols.map(c => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className="cursor-pointer px-3 py-2.5 text-left font-semibold text-text2 transition-colors hover:text-foreground select-none"
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  <SortIcon col={c.key} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={row.name} className="border-b border-border/30 transition-colors hover:bg-raised">
              <td className="px-3 py-2.5 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2.5">
                <Badge className={`text-2xs px-1.5 py-0 ${
                  row.status === "online" ? "bg-success/15 text-success" :
                  row.status === "working" ? "bg-accent-porter/15 text-accent-porter" :
                  row.status === "error" ? "bg-danger/15 text-danger" :
                  "bg-raised text-text3"
                }`}>{row.status}</Badge>
              </td>
              <td className="px-3 py-2.5 font-mono text-text2">{row.model}</td>
              <td className="px-3 py-2.5 text-text3">{row.lastActive}</td>
              <td className="px-3 py-2.5 font-medium text-foreground tabular-nums">{row.tasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** File Tree with expandable folders */
function FileTree() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "src/components"]))

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const tree = [
    { path: "src", type: "folder" as const, depth: 0, children: [
      { path: "src/components", type: "folder" as const, depth: 1, children: [
        { path: "src/components/Button.tsx", type: "tsx" as const, depth: 2 },
        { path: "src/components/Card.tsx", type: "tsx" as const, depth: 2 },
        { path: "src/components/Dialog.tsx", type: "tsx" as const, depth: 2 },
      ]},
      { path: "src/utils", type: "folder" as const, depth: 1, children: [
        { path: "src/utils/helpers.ts", type: "ts" as const, depth: 2 },
      ]},
      { path: "src/app.tsx", type: "tsx" as const, depth: 1 },
      { path: "src/index.css", type: "css" as const, depth: 1 },
    ]},
    { path: "public", type: "folder" as const, depth: 0, children: [
      { path: "public/favicon.svg", type: "image" as const, depth: 1 },
    ]},
    { path: "package.json", type: "json" as const, depth: 0 },
    { path: "tsconfig.json", type: "json" as const, depth: 0 },
  ]

  const iconForType = (type: string) => {
    if (type === "tsx" || type === "ts") return <FileCode className="h-3.5 w-3.5 text-accent-porter" />
    if (type === "css") return <FileText className="h-3.5 w-3.5 text-chart-2" />
    if (type === "json") return <FileJson className="h-3.5 w-3.5 text-warning" />
    if (type === "image") return <FileImage className="h-3.5 w-3.5 text-success" />
    return <FileText className="h-3.5 w-3.5 text-text3" />
  }

  type TreeItem = {
    path: string
    type: string
    depth: number
    children?: TreeItem[]
  }

  function renderItem(item: TreeItem): React.ReactNode {
    const isFolder = item.type === "folder"
    const isOpen = expanded.has(item.path)
    const name = item.path.split("/").pop()!

    return (
      <div key={item.path}>
        <button
          onClick={() => isFolder && toggle(item.path)}
          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-raised ${isFolder ? "cursor-pointer" : "cursor-default"}`}
          style={{ paddingLeft: `${item.depth * 16 + 8}px` }}
        >
          {isFolder ? (
            <>
              <ChevronRight className={`h-3 w-3 text-text3 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
              {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-warning" /> : <FolderClosed className="h-3.5 w-3.5 text-warning" />}
            </>
          ) : (
            <>
              <span className="w-3" />
              {iconForType(item.type)}
            </>
          )}
          <span className={`${isFolder ? "font-medium text-foreground" : "text-text2"}`}>{name}</span>
        </button>
        {isFolder && isOpen && item.children?.map(child => renderItem(child))}
      </div>
    )
  }

  return (
    <div className="w-[280px] rounded-lg border border-border bg-surface p-2 space-y-0.5">
      {tree.map(item => renderItem(item))}
    </div>
  )
}

/** Tag Input with removable tags */
function TagInput() {
  const [tags, setTags] = useState(["react", "typescript", "porter"])
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setInput("")
    }
  }

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border2 bg-raised px-2.5 py-2 max-w-md cursor-text transition-colors focus-within:border-accent-porter focus-within:ring-1 focus-within:ring-accent-porter"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-accent-porter/15 px-2 py-0.5 text-2xs font-medium text-accent-porter">
          {tag}
          <button onClick={() => removeTag(tag)} className="rounded-sm hover:bg-accent-porter/20 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag() } if (e.key === "Backspace" && !input && tags.length) removeTag(tags[tags.length - 1]) }}
        placeholder={tags.length ? "" : "Add tags..."}
        className="flex-1 min-w-[80px] bg-transparent text-xs text-foreground placeholder:text-text3 focus:outline-none"
      />
    </div>
  )
}

/** Password Input with strength indicator */
function PasswordInput() {
  const [show, setShow] = useState(false)
  const [value, setValue] = useState("")

  const strength = (() => {
    if (!value) return { level: 0, label: "", color: "" }
    let score = 0
    if (value.length >= 6) score++
    if (value.length >= 10) score++
    if (/[A-Z]/.test(value)) score++
    if (/[0-9]/.test(value)) score++
    if (/[^A-Za-z0-9]/.test(value)) score++
    if (score <= 1) return { level: 1, label: "Weak", color: "bg-danger" }
    if (score <= 3) return { level: 2, label: "Medium", color: "bg-warning" }
    return { level: 3, label: "Strong", color: "bg-success" }
  })()

  return (
    <div className="max-w-xs space-y-1.5">
      <Label className="text-xs font-medium text-text2">Password</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Enter password..."
          className="bg-raised border-border2 text-foreground placeholder:text-text3 pr-10 focus-visible:ring-accent-porter"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text2 transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {value && (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.level ? strength.color : "bg-raised"}`} />
            ))}
          </div>
          <p className={`text-2xs font-medium ${strength.level === 1 ? "text-danger" : strength.level === 2 ? "text-warning" : "text-success"}`}>
            {strength.label}
          </p>
        </div>
      )}
    </div>
  )
}

/** File Upload Dropzone */
function FileDropzone() {
  const [state, setState] = useState<"idle" | "dragover" | "uploaded">("idle")
  const [fileName, setFileName] = useState("")

  return (
    <div
      className={`max-w-md rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200 cursor-pointer ${
        state === "dragover"
          ? "border-accent-porter bg-accent-porter/5 scale-[1.01]"
          : state === "uploaded"
          ? "border-success/40 bg-success/5"
          : "border-border2 bg-raised hover:border-border2/80 hover:bg-raised/80"
      }`}
      onDragOver={e => { e.preventDefault(); setState("dragover") }}
      onDragLeave={() => setState(state === "uploaded" ? "uploaded" : "idle")}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFileName(f.name); setState("uploaded") } }}
      onClick={() => {
        if (state === "uploaded") { setState("idle"); setFileName(""); return }
        const input = document.createElement("input"); input.type = "file"; input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { setFileName(f.name); setState("uploaded") } }; input.click()
      }}
    >
      {state === "uploaded" ? (
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
            <Check className="h-5 w-5 text-success" />
          </div>
          <div className="text-left">
            <p className="text-xs font-medium text-foreground">{fileName}</p>
            <p className="text-2xs text-text3">Click to remove</p>
          </div>
        </div>
      ) : (
        <>
          <Upload className={`mx-auto h-8 w-8 transition-colors ${state === "dragover" ? "text-accent-porter" : "text-text3"}`} />
          <p className="mt-2 text-xs font-medium text-text2">
            {state === "dragover" ? "Drop to upload" : "Drop files here or click to browse"}
          </p>
          <p className="mt-0.5 text-2xs text-text3">PDF, PNG, JPG up to 10MB</p>
        </>
      )}
    </div>
  )
}

/** Slider demo with value display */
function SliderDemo() {
  const [temp, setTemp] = useState([0.7])
  return (
    <div className="max-w-xs space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-text2">Temperature</Label>
        <span className="text-xs font-mono font-bold text-accent-porter">{temp[0].toFixed(1)}</span>
      </div>
      <Slider value={temp} onValueChange={setTemp} min={0} max={1} step={0.1} className="w-full" />
      <div className="flex justify-between text-2xs text-text3">
        <span>Precise (0)</span>
        <span>Creative (1)</span>
      </div>
    </div>
  )
}

/** Command Palette Demo */
function CommandPaletteDemo() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(o => !o) }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text3 transition-colors hover:bg-raised hover:text-text2"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="ml-4 rounded border border-border bg-raised px-1.5 py-0.5 font-mono text-2xs text-text3">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Projects">
            <CommandItem><FolderKanban className="mr-2 h-4 w-4" /><span>Marketing Site</span></CommandItem>
            <CommandItem><FolderKanban className="mr-2 h-4 w-4" /><span>API Integration</span></CommandItem>
            <CommandItem><FolderKanban className="mr-2 h-4 w-4" /><span>Brand Guide</span></CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Agents">
            <CommandItem><Bot className="mr-2 h-4 w-4" /><span>Porter</span><CommandShortcut>orchestrator</CommandShortcut></CommandItem>
            <CommandItem><Bot className="mr-2 h-4 w-4" /><span>Maya</span><CommandShortcut>designer</CommandShortcut></CommandItem>
            <CommandItem><Bot className="mr-2 h-4 w-4" /><span>Dev</span><CommandShortcut>developer</CommandShortcut></CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem><Plus className="mr-2 h-4 w-4" /><span>New Project</span><CommandShortcut>⌘N</CommandShortcut></CommandItem>
            <CommandItem><Send className="mr-2 h-4 w-4" /><span>Message Porter</span><CommandShortcut>⌘/</CommandShortcut></CommandItem>
            <CommandItem><Settings className="mr-2 h-4 w-4" /><span>Settings</span><CommandShortcut>⌘,</CommandShortcut></CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem><Moon className="mr-2 h-4 w-4" /><span>Toggle Dark Mode</span></CommandItem>
            <CommandItem><Shield className="mr-2 h-4 w-4" /><span>View Logs</span></CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

/** Step Indicator */
function StepIndicator() {
  const steps = ["Account", "Workspace", "Agents", "Deploy"]
  const active = 1 // Step 2 active (0-indexed)

  return (
    <div className="flex items-center gap-0 max-w-lg">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
              i < active
                ? "border-success bg-success/15"
                : i === active
                ? "border-accent-porter bg-accent-porter/15 animate-pulse-badge"
                : "border-border2 bg-raised"
            }`}>
              {i < active ? (
                <Check className="h-4 w-4 text-success" />
              ) : i === active ? (
                <span className="text-xs font-bold text-accent-porter">{i + 1}</span>
              ) : (
                <span className="text-xs font-medium text-text3">{i + 1}</span>
              )}
            </div>
            <span className={`text-2xs font-medium ${
              i < active ? "text-success" : i === active ? "text-accent-porter" : "text-text3"
            }`}>{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mt-[-18px] rounded-full transition-colors ${
              i < active ? "bg-success" : "bg-border"
            }`} />
          )}
        </div>
      ))}
    </div>
  )
}

/** Pagination */
function PaginationDemo() {
  const [page, setPage] = useState(3)
  const total = 10

  const pages = (() => {
    const result: (number | "...")[] = []
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    result.push(1)
    if (page > 3) result.push("...")
    for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) result.push(i)
    if (page < total - 2) result.push("...")
    result.push(total)
    return result
  })()

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
        className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text2 transition-colors hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-3.5 w-3.5" />Previous
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="px-1.5 text-xs text-text3">...</span>
        ) : (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-all duration-150 ${
              page === p
                ? "bg-accent-porter text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
                : "text-text2 hover:bg-raised"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => setPage(p => Math.min(total, p + 1))}
        disabled={page === total}
        className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text2 transition-colors hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next<ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}


/** Streaming Text Demo — CSS typewriter effect */
function StreamingTextDemo() {
  const [key, setKey] = useState(0)
  const text = "Porter is analyzing your project requirements and assembling the optimal agent team. Each agent brings specialized skills — design, development, content, and QA — working in concert to deliver results."

  return (
    <div className="space-y-3">
      <button
        onClick={() => setKey(k => k + 1)}
        className="flex items-center gap-1.5 rounded-md bg-accent-porter/10 px-3 py-1.5 text-2xs font-medium text-accent-porter hover:bg-accent-porter/20 transition-colors"
      >
        <Play className="h-3 w-3" />Replay
      </button>
      <div className="max-w-lg rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#F59E0B" hairStyle="short" size="sm" />
          <span className="text-xs font-bold text-foreground">Porter</span>
          <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0">responding</Badge>
        </div>
        <p key={key} className="text-sm leading-relaxed text-foreground streaming-text" style={{ "--char-count": text.length } as React.CSSProperties}>
          {text}
        </p>
      </div>
    </div>
  )
}

/** Chat Session List */
function ChatSessionList() {
  const [active, setActive] = useState(0)
  const sessions = [
    { title: "Marketing site planning", preview: "Let's start with the homepage layout...", time: "2 min ago", unread: true, group: "Today" },
    { title: "API integration help", preview: "The webhook endpoint needs HMAC...", time: "1 hr ago", unread: false, group: "Today" },
    { title: "Brand guide feedback", preview: "I've updated the color palette to...", time: "Yesterday", unread: false, group: "Yesterday" },
    { title: "Deploy v0.34", preview: "All tests passing, ready to ship...", time: "Yesterday", unread: false, group: "Yesterday" },
    { title: "Agent team setup", preview: "Created Maya, Dev, and Sam with...", time: "Mar 18", unread: false, group: "This Week" },
  ]

  let lastGroup = ""
  return (
    <div className="w-[280px] rounded-lg border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">Conversations</span>
        <button className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2 hover:bg-raised transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-1.5 space-y-0.5">
        {sessions.map((s, i) => {
          const showGroup = s.group !== lastGroup
          lastGroup = s.group
          return (
            <div key={i}>
              {showGroup && (
                <p className="px-2 pt-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-text3">{s.group}</p>
              )}
              <button
                onClick={() => setActive(i)}
                className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                  active === i ? "bg-accent-porter/10" : "hover:bg-raised"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className={`flex-1 text-xs truncate ${active === i ? "font-bold text-accent-porter" : "font-medium text-foreground"}`}>{s.title}</p>
                  {s.unread && <div className="h-2 w-2 rounded-full bg-accent-porter shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="flex-1 text-2xs text-text3 truncate">{s.preview}</p>
                  <span className="text-2xs text-text3 shrink-0">{s.time}</span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
   DESIGN SYSTEM PAGE
   ============================================================ */
export default function DesignSystemPage() {
  return (
      <div className="overflow-y-auto p-4 flex-1">
        <DesignSystemContent />
      </div>
  )
}

function DesignSystemContent() {
  const theme = typeof document !== "undefined" && document.documentElement.classList.contains("light") ? "light" : "dark"

  return (
    <TooltipProvider>
      <Tabs defaultValue="foundation">
        <TabsList variant="file" className="w-full justify-start mb-3 sticky top-0 z-10">
          <TabsTrigger value="foundation">Foundation</TabsTrigger>
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="navigation">Navigation</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="motion">Motion</TabsTrigger>
          <TabsTrigger value="screens">Screens</TabsTrigger>
          <TabsTrigger value="forge">Forge</TabsTrigger>
        </TabsList>

        {/* ── Foundation: Layout, Brand, Typography ── */}
        <TabsContent value="foundation">
          <div className="space-y-10">

            {/* ============================================================
                1. LAYOUT PRIMITIVES
                ============================================================ */}
            <Section id="layout" title="Layout Primitives">
              <Sub title="Page Shell">
                <div className="space-y-4">
                  <p className="text-xs text-text2">Standard page containers. Header zone (breadcrumb + actions), content area, optional footer.</p>

                  {/* Full-width variant */}
                  <div className="space-y-1.5">
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">Full-width</Badge>
                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-text2">
                          <Home className="h-3.5 w-3.5" />
                          <ChevronRight className="h-3 w-3 text-text3" />
                          <span>Projects</span>
                        </div>
                        <Button size="sm" className="bg-accent-porter text-white hover:bg-accent-hover h-7 text-2xs"><Plus className="mr-1 h-3 w-3" />New</Button>
                      </div>
                      <div className="px-4 py-6">
                        <div className="h-16 rounded-lg border border-dashed border-border2 bg-raised/30 flex items-center justify-center text-2xs text-text3">
                          Content area (full-width)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Max-width centered */}
                  <div className="space-y-1.5">
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">Max-width centered</Badge>
                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <div className="border-b border-border bg-surface px-4 py-2.5">
                        <div className="mx-auto max-w-[600px] flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">Settings</span>
                          <Button size="sm" variant="outline" className="h-7 text-2xs">Save</Button>
                        </div>
                      </div>
                      <div className="px-4 py-6">
                        <div className="mx-auto max-w-[600px] h-16 rounded-lg border border-dashed border-border2 bg-raised/30 flex items-center justify-center text-2xs text-text3">
                          Content area (max-w centered)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar + content split */}
                  <div className="space-y-1.5">
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">Sidebar + content</Badge>
                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <div className="border-b border-border bg-surface px-4 py-2.5">
                        <span className="text-xs font-semibold text-foreground">Project Detail</span>
                      </div>
                      <div className="flex">
                        <div className="w-[140px] shrink-0 border-r border-border bg-surface p-3 space-y-1">
                          {["Overview", "Files", "Settings"].map((item, i) => (
                            <div key={item} className={`rounded-md px-2 py-1 text-2xs ${i === 0 ? "bg-accent-porter/10 text-accent-porter font-medium" : "text-text3"}`}>{item}</div>
                          ))}
                        </div>
                        <div className="flex-1 p-4">
                          <div className="h-16 rounded-lg border border-dashed border-border2 bg-raised/30 flex items-center justify-center text-2xs text-text3">
                            Main content area
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Spacing Scale">
                <div className="space-y-1.5 max-w-xl">
                  {[
                    { px: 4, tw: "p-1" },
                    { px: 8, tw: "p-2" },
                    { px: 12, tw: "p-3" },
                    { px: 16, tw: "p-4" },
                    { px: 20, tw: "p-5" },
                    { px: 24, tw: "p-6" },
                    { px: 32, tw: "p-8" },
                    { px: 40, tw: "p-10" },
                    { px: 48, tw: "p-12" },
                    { px: 64, tw: "p-16" },
                  ].map(s => (
                    <div key={s.px} className="flex items-center gap-3">
                      <span className="w-10 text-right text-2xs font-mono text-text3">{s.px}px</span>
                      <div
                        className="h-3 rounded-sm bg-accent-porter/60 transition-all duration-300"
                        style={{ width: `${s.px * 3}px` }}
                      />
                      <code className="text-2xs font-mono text-accent-porter">{s.tw}</code>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Grid System">
                <div className="space-y-4 max-w-2xl">
                  {[1, 2, 3, 4].map(cols => (
                    <div key={cols}>
                      <p className="text-2xs text-text3 mb-1.5">{cols}-column</p>
                      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                        {Array.from({ length: cols }, (_, i) => (
                          <div key={i} className="h-10 rounded-md bg-accent-porter/15 border border-accent-porter/20 flex items-center justify-center text-2xs font-mono text-accent-porter">
                            {i + 1}/{cols}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Responsive Breakpoints">
                <div className="max-w-xl overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-3 py-2 text-left font-semibold text-text2">Breakpoint</th>
                        <th className="px-3 py-2 text-left font-semibold text-text2">Min Width</th>
                        <th className="px-3 py-2 text-left font-semibold text-text2">Prefix</th>
                        <th className="px-3 py-2 text-left font-semibold text-text2">Behavior</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: "Mobile", width: "0px", prefix: "(default)", behavior: "Single column, stacked layout" },
                        { name: "Small", width: "640px", prefix: "sm:", behavior: "Compact 2-col possible" },
                        { name: "Medium", width: "768px", prefix: "md:", behavior: "Sidebar collapses to rail" },
                        { name: "Large", width: "1024px", prefix: "lg:", behavior: "Full sidebar visible" },
                        { name: "XL", width: "1280px", prefix: "xl:", behavior: "Max-width container" },
                        { name: "2XL", width: "1400px", prefix: "2xl:", behavior: "Wide layout, extra spacing" },
                      ].map(bp => (
                        <tr key={bp.name} className="border-b border-border/30 transition-colors hover:bg-raised">
                          <td className="px-3 py-2 font-medium text-foreground">{bp.name}</td>
                          <td className="px-3 py-2 font-mono text-accent-porter">{bp.width}</td>
                          <td className="px-3 py-2"><code className="rounded bg-raised px-1.5 py-0.5 text-2xs font-mono text-text2">{bp.prefix}</code></td>
                          <td className="px-3 py-2 text-text2">{bp.behavior}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                2. BRAND
                ============================================================ */}
            <Section id="brand" title="Brand">
              <Sub title="Logo Variants">
                <div className="flex items-end gap-10">
                  <div className="text-center">
                    <PorterLogo size="lg" />
                    <p className="mt-2 text-2xs text-text3">Large (40px)</p>
                  </div>
                  <div className="text-center">
                    <PorterLogo size="md" />
                    <p className="mt-2 text-2xs text-text3">Medium (34px)</p>
                  </div>
                  <div className="text-center">
                    <PorterLogo size="sm" />
                    <p className="mt-2 text-2xs text-text3">Small (24px)</p>
                  </div>
                  <div className="text-center">
                    <PorterLogo size="lg" showText={false} />
                    <p className="mt-2 text-2xs text-text3">Mark only</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Favicon">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <img src="/favicon.svg" alt="Favicon SVG" className="h-8 w-8" />
                    <span className="text-xs text-text2">favicon.svg (primary)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <img src="/favicon.ico" alt="Favicon ICO" className="h-8 w-8" />
                    <span className="text-xs text-text2">favicon.ico (fallback)</span>
                  </div>
                </div>
              </Sub>

              <Sub title="Surfaces">
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { name: "background", cls: "bg-background", hex: theme === "dark" ? "#111827" : "#FFFFFF" },
                    { name: "surface", cls: "bg-surface", hex: theme === "dark" ? "#1E2736" : "#F3F4F8" },
                    { name: "raised", cls: "bg-raised", hex: theme === "dark" ? "#28344A" : "#E8EBF2" },
                    { name: "border", cls: "bg-border", hex: theme === "dark" ? "#374259" : "#D1D5DF" },
                    { name: "border2", cls: "bg-border2", hex: theme === "dark" ? "#4A5770" : "#B8BFD0" },
                  ].map(c => <Swatch key={c.name} {...c} />)}
                </div>
              </Sub>

              <Sub title="Text Hierarchy">
                <div className="space-y-1.5 rounded-lg bg-surface p-4">
                  <p className="text-sm text-text">Primary text -- high contrast, headings and body</p>
                  <p className="text-sm text-text2">Secondary text -- labels, descriptions, metadata</p>
                  <p className="text-sm text-text3">Tertiary text -- placeholders, disabled, captions</p>
                </div>
              </Sub>

              <Sub title="Accent & Semantic">
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { name: "accent", cls: "bg-accent-porter", hex: theme === "dark" ? "#6366F1" : "#4F46E5" },
                    { name: "accent-hover", cls: "bg-accent-hover", hex: theme === "dark" ? "#4F46E5" : "#4338CA" },
                    { name: "success", cls: "bg-success", hex: theme === "dark" ? "#22C55E" : "#16A34A" },
                    { name: "warning", cls: "bg-warning", hex: theme === "dark" ? "#F59E0B" : "#D97706" },
                    { name: "danger", cls: "bg-danger", hex: theme === "dark" ? "#EF4444" : "#DC2626" },
                  ].map(c => <Swatch key={c.name} {...c} />)}
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                2. TYPOGRAPHY
                ============================================================ */}
            <Section id="typography" title="Typography">
              <div className="mb-4 rounded-lg border border-border bg-raised px-4 py-3">
                <p className="text-xs font-semibold text-text2">Font Family: <span className="font-normal text-foreground">Geist Variable</span> <span className="text-text3">— by Vercel, free, variable weight (100-900)</span></p>
                <p className="mt-1 text-xs font-semibold text-text2">Monospace: <span className="font-mono font-normal text-foreground">System monospace</span> <span className="text-text3">— code blocks, file paths, log output</span></p>
              </div>
              <div className="space-y-4 rounded-lg bg-surface p-6">
                <div><p className="text-2xl font-bold tracking-tight">Display -- 24px bold</p><p className="text-2xs text-text3">Page titles, hero text</p></div>
                <div><p className="text-xl font-bold">Module Title -- 20px bold</p><p className="text-2xs text-text3">Module headers, wizard headings</p></div>
                <div><p className="text-base font-semibold">Heading -- 16px semibold</p><p className="text-2xs text-text3">Section headers, card titles</p></div>
                <div><p className="text-sm">Body -- 14px regular</p><p className="text-2xs text-text3">Default body text</p></div>
                <div><p className="text-sm">Chat / Nav -- 13px regular</p><p className="text-2xs text-text3">Chat messages, navigation items</p></div>
                <div><p className="text-xs font-medium text-text2">Label -- 12px medium</p><p className="text-2xs text-text3">Form labels, metadata</p></div>
                <div><p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text3">Section Header -- 11px semibold uppercase</p><p className="text-2xs text-text3">Nav group labels, section dividers</p></div>
                <div><p className="text-2xs text-text3">Caption -- 10px</p><p className="text-2xs text-text3">Timestamps, version badges</p></div>
                <div><p className="font-mono text-xs text-text2">Monospace -- 12px</p><p className="text-2xs text-text3">Code, log queries, file paths</p></div>
              </div>
            </Section>

          </div>
        </TabsContent>

        {/* ── Controls: Buttons, Inputs ── */}
        <TabsContent value="controls">
          <div className="space-y-10">

            {/* ============================================================
                3. BUTTONS
                ============================================================ */}
            <Section id="buttons" title="Buttons">
              <Sub title="Variants">
                <div className="flex flex-wrap items-center gap-3">
                  <Button className="bg-accent-porter font-bold text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all duration-150">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Danger</Button>
                  <Button disabled className="bg-accent-porter text-white">Disabled</Button>
                </div>
              </Sub>

              <Sub title="Sizes">
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" className="bg-accent-porter text-white hover:bg-accent-hover">Small</Button>
                  <Button className="bg-accent-porter text-white hover:bg-accent-hover">Default</Button>
                  <Button size="lg" className="bg-accent-porter text-white hover:bg-accent-hover">Large</Button>
                  <Button size="icon" className="bg-accent-porter text-white hover:bg-accent-hover"><Plus className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                </div>
              </Sub>

              <Sub title="With Icons">
                <div className="flex flex-wrap items-center gap-3">
                  <Button className="bg-accent-porter text-white hover:bg-accent-hover"><Plus className="mr-1.5 h-4 w-4" />New Project</Button>
                  <Button variant="outline"><Upload className="mr-1.5 h-4 w-4" />Upload</Button>
                  <Button variant="ghost"><RefreshCw className="mr-1.5 h-4 w-4" />Refresh</Button>
                  <Button variant="destructive"><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button>
                </div>
              </Sub>

              <Sub title="Send Button (Chat Composer)">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <button className="btn-send inline-flex items-center gap-2 px-5 py-2.5 text-2xs font-extrabold uppercase tracking-[0.08em]">
                      <Send className="h-3.5 w-3.5" />
                      Send
                    </button>
                    <p className="mt-2 text-2xs text-text3">Default</p>
                  </div>
                  <div className="text-center">
                    <button className="btn-send inline-flex items-center gap-2 px-5 py-2.5 text-2xs font-extrabold uppercase tracking-[0.08em] hover:-translate-y-px">
                      <Send className="h-3.5 w-3.5" />
                      Send Message
                    </button>
                    <p className="mt-2 text-2xs text-text3">With label (hover me)</p>
                  </div>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                4. INPUTS
                ============================================================ */}
            <Section id="inputs" title="Inputs">
              <div className="grid max-w-lg grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-text2">Text Input</Label>
                  <Input placeholder="Enter text..." className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-text2">With Value</Label>
                  <Input defaultValue="moe@porter.app" className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-text2">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3" />
                    <Input placeholder="Search..." className="bg-raised border-border2 pl-9 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-text2">Disabled</Label>
                  <Input disabled defaultValue="Read only" className="bg-raised border-border2 text-foreground opacity-50" />
                </div>
              </div>

              <Sub title="Textarea">
                <textarea
                  placeholder="Type your message..."
                  rows={3}
                  className="w-full max-w-lg resize-y rounded-lg border border-border2 bg-raised px-3 py-2.5 text-sm text-foreground placeholder:text-text3 focus:border-accent-porter focus:outline-none focus:ring-1 focus:ring-accent-porter"
                />
              </Sub>

              <Sub title="Combobox / Searchable Select">
                <p className="text-xs text-text2 mb-2">Porter-styled select with search. Replaces all native &lt;select&gt; elements. Used for model picker, agent picker, project picker.</p>
                <ModelCombobox />
              </Sub>

              <Sub title="Toggle Switch">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch defaultChecked />
                    <Label className="text-xs text-text2">Enabled</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch />
                    <Label className="text-xs text-text2">Disabled</Label>
                  </div>
                </div>
              </Sub>

              <Sub title="Combobox / Searchable Select">
                <ModelCombobox />
              </Sub>

              <Sub title="Checkbox">
                <div className="space-y-3">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Checkbox id="cb-checked" defaultChecked />
                      <Label htmlFor="cb-checked" className="text-xs text-text2">Checked</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="cb-unchecked" />
                      <Label htmlFor="cb-unchecked" className="text-xs text-text2">Unchecked</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="cb-indeterminate" checked="indeterminate" />
                      <Label htmlFor="cb-indeterminate" className="text-xs text-text2">Indeterminate</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="cb-disabled" disabled />
                      <Label htmlFor="cb-disabled" className="text-xs text-text3">Disabled</Label>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Radio Group">
                <div className="flex gap-8">
                  <div>
                    <p className="text-2xs text-text3 mb-2">Vertical</p>
                    <RadioGroup defaultValue="claude">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="claude" id="r-claude" />
                        <Label htmlFor="r-claude" className="text-xs text-text2">Claude Opus</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="gpt" id="r-gpt" />
                        <Label htmlFor="r-gpt" className="text-xs text-text2">GPT-5.4</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="qwen" id="r-qwen" />
                        <Label htmlFor="r-qwen" className="text-xs text-text2">Qwen 2.5</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div>
                    <p className="text-2xs text-text3 mb-2">Horizontal</p>
                    <RadioGroup defaultValue="small" className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="small" id="r-sm" />
                        <Label htmlFor="r-sm" className="text-xs text-text2">Small</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="medium" id="r-md" />
                        <Label htmlFor="r-md" className="text-xs text-text2">Medium</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="large" id="r-lg" />
                        <Label htmlFor="r-lg" className="text-xs text-text2">Large</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </Sub>

              <Sub title="Slider / Range">
                <SliderDemo />
              </Sub>

              <Sub title="File Upload Dropzone">
                <FileDropzone />
              </Sub>

              <Sub title="Tag Input">
                <TagInput />
              </Sub>

              <Sub title="Password Input">
                <PasswordInput />
              </Sub>

              <Sub title="Form Validation">
                <div className="grid max-w-lg grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Error</Label>
                    <Input defaultValue="bad@" className="bg-raised border-danger text-foreground focus-visible:ring-danger" />
                    <p className="text-2xs text-danger">Invalid email address</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Warning</Label>
                    <Input defaultValue="admin" className="bg-raised border-warning text-foreground focus-visible:ring-warning" />
                    <p className="text-2xs text-warning">Username already taken</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Success</Label>
                    <div className="relative">
                      <Input defaultValue="moe@porter.app" className="bg-raised border-success text-foreground pr-8 focus-visible:ring-success" />
                      <Check className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-success" />
                    </div>
                    <p className="text-2xs text-success">Email verified</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Form Field Layout">
                <div className="max-w-sm space-y-1.5 rounded-lg border border-border bg-surface p-4">
                  <Label className="text-xs font-medium text-text2">
                    Agent Name <span className="text-danger">*</span>
                  </Label>
                  <Input placeholder="e.g. Maya" className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter" />
                  <p className="text-2xs text-text3">A unique name for your agent. Letters and numbers only.</p>
                </div>
              </Sub>
            </Section>


          </div>
        </TabsContent>

        {/* ── Cards: Calendar, Cards, Badges, Avatars ── */}
        <TabsContent value="cards">
          <div className="space-y-10">

            {/* ============================================================
                5b. CALENDAR
                ============================================================ */}
            <Section id="calendar" title="Calendar">
              <Sub title="Single Date">
                <p className="text-xs text-text2 mb-3">Date picker for deadlines, billing dates, trial expiry. Uses react-day-picker via shadcn.</p>
                <CalendarDemo mode="single" />
              </Sub>
              <Sub title="With Dropdown Navigation">
                <p className="text-xs text-text2 mb-3">Month/year dropdowns for navigating to distant dates (billing history, signup dates).</p>
                <CalendarDemo mode="single" dropdown />
              </Sub>
            </Section>

            {/* ============================================================
                6. CARDS
                ============================================================ */}
            <Section id="cards" title="Cards">
              <Sub title="Project Cards">
                <div className="flex flex-wrap gap-4">
                  {[
                    { name: "Marketing Site", desc: "Website redesign project", status: "active", type: "website", color: "accent-porter", pct: 72, sparkline: [3,5,4,7,6,8,5,9] },
                    { name: "API Integration", desc: "Third-party API setup", status: "paused", type: "app", color: "warning", pct: 35, sparkline: [2,3,2,1,0,0,1,0] },
                    { name: "Brand Guide", desc: "Visual identity system", status: "complete", type: "design", color: "success", pct: 100, sparkline: [6,7,8,8,9,8,7,6] },
                    { name: "Mobile App", desc: "iOS + Android build", status: "active", type: "app", color: "accent-porter", pct: 48, sparkline: [1,2,4,3,5,7,6,8] },
                  ].map((p, i) => (
                    <div
                      key={p.name}
                      className={`animate-card-deal-in deal-${i + 1} group w-[190px] cursor-pointer overflow-hidden rounded-[10px] border border-border bg-gradient-to-b from-surface to-background shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent-porter)_40%,var(--border))] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5`}
                    >
                      {/* Banner with gradient pattern */}
                      <div className={`relative h-14 overflow-hidden bg-${p.color}/15`}>
                        <div className="absolute inset-0 opacity-30" style={{ background: `repeating-linear-gradient(135deg, transparent, transparent 8px, var(--${p.color}) 8px, var(--${p.color}) 9px)` }} />
                        <div className="absolute right-2 top-2">
                          <Sparkline values={p.sparkline} color={p.color} />
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                        <p className="mt-0.5 text-2xs text-text2 truncate">{p.desc}</p>
                        <div className="mt-2 flex gap-1.5">
                          <Badge className={`text-2xs px-1.5 py-0 ${
                            p.status === "active" ? "bg-success/15 text-success" :
                            p.status === "paused" ? "bg-warning/15 text-warning" :
                            "bg-text3/15 text-text3"
                          }`}>{p.status}</Badge>
                          <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">{p.type}</Badge>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2.5">
                          <ProgressBar value={p.pct} color={p.color} thin />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Agent Cards (with Pixel Portraits)">
                <div className="flex flex-wrap items-end gap-5">
                  {[
                    { name: "Porter", role: "orchestrator", skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#F59E0B", hairStyle: "short" as const, status: "idle" as const, animated: false },
                    { name: "Alex", role: "developer", skin: "#D4A574", hair: "#1A1A2E", eyes: "#0F172A", shirt: "#6366F1", hairStyle: "mohawk" as const, status: "idle" as const, animated: false },
                    { name: "Sam", role: "writer", skin: "#FDBCB4", hair: "#8B4513", eyes: "#1A1A2E", shirt: "#22C55E", hairStyle: "curly" as const, status: "working" as const, animated: true },
                    { name: "Casey", role: "researcher", skin: "#F5D0A9", hair: "#D4A574", eyes: "#1A1A2E", shirt: "#EF4444", hairStyle: "long" as const, status: "error" as const, animated: false },
                    { name: "Jules", role: "designer", skin: "#C68642", hair: "#0F172A", eyes: "#1A1A2E", shirt: "#8B5CF6", hairStyle: "ponytail" as const, status: "offline" as const, animated: false },
                  ].map(a => (
                    <div key={a.name} className="group relative w-[110px] cursor-pointer text-center transition-transform duration-200 hover:-translate-y-1.5 hover:brightness-105 animate-agent-card-in">
                      <div className={`absolute -bottom-2 left-1/2 h-6 w-20 -translate-x-1/2 rounded-full blur-md transition-opacity group-hover:opacity-60 ${
                        a.status === "error" ? "bg-danger/15" : a.name === "Porter" ? "bg-warning/20" : "bg-accent-porter/15"
                      }`} />
                      <PixelPortrait
                        skin={a.skin}
                        hair={a.hair}
                        eyes={a.eyes}
                        shirt={a.shirt}
                        hairStyle={a.hairStyle}
                        size="lg"
                        isAnimated={a.animated}
                        status={a.status}
                      />
                      <p className="mt-1 text-xs font-bold text-foreground">{a.name}</p>
                      <p className="text-2xs text-text3">{a.role}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="People / CRM Cards">
                <div className="flex flex-wrap gap-4">
                  {[
                    { name: "Moe", initials: "MO", role: "operator", location: "Singapore", projects: 3, status: "active" },
                    { name: "Jacob", initials: "JK", role: "operator", location: "London", projects: 1, status: "active" },
                  ].map(p => (
                    <div key={p.name} className="w-[250px] overflow-hidden rounded-xl border border-border bg-gradient-to-b from-surface to-background p-3 shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent-porter)_30%,var(--border))] hover:shadow-[var(--shadow-card-crm-hover)]">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-accent-porter text-sm font-bold text-white">{p.initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                          <p className="text-2xs text-text3">{p.role} · {p.location}</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0">{p.projects} projects</Badge>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">{p.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Service Health Cards">
                <div className="flex flex-wrap gap-3">
                  {[
                    { name: "Ollama", model: "qwen2.5", status: "up", ms: 11 },
                    { name: "OpenClaw", model: "gpt-5.4", status: "up", ms: 145 },
                    { name: "Database", model: "SQLite", status: "up", ms: 2 },
                    { name: "Gemini", model: "2.0-flash", status: "down", ms: null },
                  ].map(s => (
                    <div key={s.name} className="w-[180px] rounded-[10px] border border-border bg-surface p-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${s.status === "up" ? "bg-success" : "bg-danger"}`} />
                        <span className="text-xs font-semibold text-foreground">{s.name}</span>
                      </div>
                      <p className="mt-1 text-2xs text-text3">{s.model}</p>
                      <p className="mt-0.5 text-2xs text-text3">{s.ms !== null ? `${s.ms}ms` : "unreachable"}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Auth Card (Login)">
                <Card className="w-[360px] border-border bg-surface shadow-[var(--shadow-auth)]" style={{ borderRadius: "14px" }}>
                  <CardContent className="p-10">
                    <div className="mb-6 flex justify-center"><PorterLogo size="lg" /></div>
                    <div className="space-y-3">
                      <Input placeholder="Username" className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter" />
                      <Input type="password" placeholder="Password" className="bg-raised border-border2 text-foreground placeholder:text-text3 focus-visible:ring-accent-porter" />
                      <Button className="w-full bg-accent-porter font-bold text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all duration-150">Sign in</Button>
                    </div>
                    <div className="mt-4 flex justify-center gap-4">
                      <span className="text-sm text-text2 transition-colors hover:text-accent-porter cursor-pointer">Create account</span>
                      <span className="text-sm text-text2 transition-colors hover:text-accent-porter cursor-pointer">Forgot password?</span>
                    </div>
                  </CardContent>
                </Card>
              </Sub>

              <Sub title="Skeleton / Loading Cards">
                <div className="flex gap-4">
                  {[1, 2].map(n => (
                    <div key={n} className="w-[190px] overflow-hidden rounded-[10px] border border-border bg-surface">
                      <div className="h-14 animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-from)] via-[var(--shimmer-via)] to-[var(--shimmer-from)] bg-[length:200%_100%] skeleton-shimmer" />
                      <div className="space-y-2 p-3">
                        <div className="h-3 w-3/4 animate-[shimmer_1.5s_ease-in-out_infinite] rounded bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                        <div className="h-2.5 w-1/2 animate-[shimmer_1.5s_ease-in-out_infinite] rounded bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Project Type Extension Cards">
                <p className="text-xs text-text2 mb-3">Specialized cards for different project types. Each shows domain-relevant metadata and visual cues.</p>
                <div className="flex flex-wrap gap-4">
                  {/* Music project card */}
                  <div className="w-[200px] overflow-hidden rounded-[10px] border border-border bg-gradient-to-b from-surface to-background shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent-porter)_40%,var(--border))] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 group cursor-pointer">
                    <div className="relative h-16 bg-chart-5/20 overflow-hidden flex items-end justify-center px-3 pb-2 gap-[3px]">
                      {[40,65,45,80,55,70,35,60,75,50,85,40,55,70,45,80,60,50,65,35].map((h, i) => (
                        <div key={i} className="w-[3px] rounded-t-sm bg-accent-porter/60 transition-all group-hover:bg-accent-porter" style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }} />
                      ))}
                      <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="h-3.5 w-3.5 text-accent-porter ml-0.5" />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-foreground">Album Master</p>
                      <p className="mt-0.5 text-2xs text-text2">Production & mixing</p>
                      <div className="mt-2 flex gap-1.5">
                        <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0">128 BPM</Badge>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">music</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Design project card */}
                  <div className="w-[200px] overflow-hidden rounded-[10px] border border-border bg-gradient-to-b from-surface to-background shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent-porter)_40%,var(--border))] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 cursor-pointer">
                    <div className="relative h-16 bg-chart-2/15 overflow-hidden flex items-center justify-center">
                      <div className="flex gap-2">
                        {["#6366F1", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6"].map((c, i) => (
                          <div key={i} className="h-5 w-5 rounded-full border-2 border-background shadow-sm" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-foreground">Brand Identity</p>
                      <p className="mt-0.5 text-2xs text-text2">Visual design system</p>
                      <div className="mt-2 flex gap-1.5">
                        <Badge className="bg-chart-2/15 text-chart-2 text-2xs px-1.5 py-0">24 assets</Badge>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">design</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Website project card */}
                  <div className="w-[200px] overflow-hidden rounded-[10px] border border-border bg-gradient-to-b from-surface to-background shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent-porter)_40%,var(--border))] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 cursor-pointer">
                    <div className="relative h-16 bg-success/10 overflow-hidden flex items-center justify-center gap-3">
                      <Laptop className="h-5 w-5 text-text2" />
                      <Tablet className="h-4 w-4 text-text3" />
                      <Smartphone className="h-3.5 w-3.5 text-text3" />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-foreground flex-1">Marketing Site</p>
                        <div className="h-2 w-2 rounded-full bg-success" />
                      </div>
                      <p className="mt-0.5 text-2xs text-text2">askporter.app</p>
                      <div className="mt-2 flex gap-1.5">
                        <Badge className="bg-success/15 text-success text-2xs px-1.5 py-0">live</Badge>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">website</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Video project card */}
                  <div className="w-[200px] overflow-hidden rounded-[10px] border border-border bg-gradient-to-b from-surface to-background shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent-porter)_40%,var(--border))] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 group cursor-pointer">
                    <div className="relative h-16 bg-warning/10 overflow-hidden flex items-center justify-center">
                      <div className="h-full w-full bg-raised/50" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm opacity-70 group-hover:opacity-100 transition-opacity">
                          <Play className="h-3.5 w-3.5 text-foreground ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-foreground">Launch Video</p>
                      <p className="mt-0.5 text-2xs text-text2">Product announcement</p>
                      <div className="mt-2 flex gap-1.5">
                        <Badge className="bg-warning/15 text-warning text-2xs px-1.5 py-0">2:34</Badge>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">4K</Badge>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">video</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Content project card */}
                  <div className="w-[200px] overflow-hidden rounded-[10px] border border-border bg-gradient-to-b from-surface to-background shadow-[inset_0_1px_0_var(--inset-highlight)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent-porter)_40%,var(--border))] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 cursor-pointer">
                    <div className="relative h-16 bg-chart-3/10 overflow-hidden flex items-center justify-center">
                      <div className="space-y-1 w-[70%]">
                        <div className="h-1.5 w-full rounded bg-text3/20" />
                        <div className="h-1.5 w-[85%] rounded bg-text3/15" />
                        <div className="h-1.5 w-[65%] rounded bg-text3/10" />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-foreground">Blog Series</p>
                      <p className="mt-0.5 text-2xs text-text2">Technical articles</p>
                      <div className="mt-2 flex gap-1.5">
                        <Badge className="bg-chart-3/15 text-chart-3 text-2xs px-1.5 py-0">4,200 words</Badge>
                        <Badge className="bg-success/15 text-success text-2xs px-1.5 py-0">A+</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                6. BADGES & STATUS
                ============================================================ */}
            <Section id="badges" title="Badges & Status">
              <Sub title="Badge Variants">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-accent-porter text-white">Active</Badge>
                  <Badge className="bg-success/15 text-success">Online</Badge>
                  <Badge className="bg-warning/15 text-warning">Pending</Badge>
                  <Badge className="bg-danger/15 text-danger">Error</Badge>
                  <Badge className="bg-raised text-text2">Idle</Badge>
                  <Badge variant="outline" className="border-border2 text-text2">Draft</Badge>
                </div>
              </Sub>

              <Sub title="Status Dots">
                <div className="flex items-center gap-8">
                  {[
                    { label: "Online", color: "bg-success" },
                    { label: "Working", color: "bg-accent-porter animate-pulse-badge" },
                    { label: "Warning", color: "bg-warning" },
                    { label: "Error", color: "bg-danger" },
                    { label: "Offline", color: "bg-text3" },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${s.color}`} />
                      <span className="text-xs text-text2">{s.label}</span>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Heartbeat Pills">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-[color-mix(in_srgb,#10b981_30%,var(--border))] bg-[color-mix(in_srgb,var(--background)_65%,transparent)] px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-success">live</span>
                  <span className="rounded-full border border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[color-mix(in_srgb,var(--background)_65%,transparent)] px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-warning">warn</span>
                  <span className="rounded-full border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-[color-mix(in_srgb,var(--background)_65%,transparent)] px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-danger">err</span>
                </div>
              </Sub>

              <Sub title="Nav Counter">
                <div className="flex items-center gap-3">
                  <Badge className="bg-accent-porter text-white text-2xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">2</Badge>
                  <Badge className="bg-danger text-white text-2xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">5</Badge>
                  <Badge className="bg-raised text-text3 text-2xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">0</Badge>
                </div>
              </Sub>

              <Sub title="Animated Nav Counter">
                <AnimatedBadgeCounter />
              </Sub>

              <Sub title="Inline Counter">
                <div className="flex items-center gap-6">
                  <span className="text-sm text-foreground">Projects <span className="text-text3">(3)</span></span>
                  <span className="text-sm text-foreground">Agents <span className="text-text3">(7)</span></span>
                  <span className="text-sm text-foreground">Tasks <span className="text-text3">(12)</span></span>
                </div>
              </Sub>

              <Sub title="Dot-only Indicator">
                <div className="flex items-center gap-6">
                  <div className="relative inline-flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-text2" />
                    <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" />
                    <span className="ml-2 text-xs text-text2">With new</span>
                  </div>
                  <div className="relative inline-flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-text2" />
                    <span className="ml-2 text-xs text-text2">Without</span>
                  </div>
                </div>
              </Sub>

              <Sub title="Animated Digit Counter">
                <AnimatedDigitCounter />
              </Sub>
            </Section>

            {/* ============================================================
                7. AVATARS
                ============================================================ */}
            <Section id="avatars" title="Avatars">
              <Sub title="Sizes & Colors">
                <div className="flex items-center gap-4">
                  {[
                    { size: "h-7 w-7", text: "text-2xs", initials: "M", color: "bg-accent-porter" },
                    { size: "h-8 w-8", text: "text-xs", initials: "MO", color: "bg-accent-porter" },
                    { size: "h-10 w-10", text: "text-sm", initials: "P", color: "bg-success" },
                    { size: "h-10 w-10", text: "text-sm", initials: "AI", color: "bg-warning" },
                    { size: "h-12 w-12", text: "text-base", initials: "JK", color: "bg-danger" },
                  ].map((a, i) => (
                    <Avatar key={i} className={a.size}>
                      <AvatarFallback className={`${a.color} ${a.text} font-bold text-white`}>{a.initials}</AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </Sub>

              <Sub title="Pixel Portraits (All Hair Styles)">
                <div className="flex flex-wrap items-end gap-4">
                  {(["short", "long", "mohawk", "bald", "parted", "buzz", "curly", "ponytail"] as const).map(hs => (
                    <div key={hs} className="text-center">
                      <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#6366F1" hairStyle={hs} size="md" />
                      <p className="mt-1 text-2xs text-text3">{hs}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Portrait Editor">
                <p className="text-xs text-text2 mb-3">Customise agent appearance — hair style, skin, hair color, eyes, shirt. Changes reflect live across all sizes.</p>
                <PixelPortraitEditorDemo />
              </Sub>
            </Section>

          </div>
        </TabsContent>

        {/* ── Navigation: Nav, Tabs ── */}
        <TabsContent value="navigation">
          <div className="space-y-10">

            {/* ============================================================
                8. NAVIGATION
                ============================================================ */}
            <Section id="navigation" title="Navigation">
              <div className="flex gap-8">
                {/* Full sidebar */}
                <div className="w-[220px] rounded-lg bg-surface">
                  <div className="flex items-center justify-between border-b border-border p-3">
                    <PorterLogo size="sm" />
                    <button className="flex h-7 w-7 items-center justify-center rounded text-text3 hover:text-text2"><Menu className="h-4 w-4" /></button>
                  </div>
                  <nav className="space-y-0.5 p-2">
                    <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-text3">Work</p>
                    <button className="flex w-full items-center gap-[9px] rounded-md bg-accent-porter/10 px-2.5 py-[7px] text-sm font-medium text-accent-porter">
                      <FolderKanban className="h-[15px] w-[15px]" strokeWidth={2} />Projects
                    </button>
                    {[
                      { icon: Bot, label: "AI Agents" },
                      { icon: FileText, label: "Files" },
                      { icon: Users, label: "People" },
                    ].map(item => (
                      <button key={item.label} className="flex w-full items-center gap-[9px] rounded-md px-2.5 py-[7px] text-sm text-text2 transition-colors duration-[120ms] hover:bg-raised">
                        <item.icon className="h-[15px] w-[15px]" strokeWidth={2} />{item.label}
                      </button>
                    ))}

                    <p className="px-2.5 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.06em] text-text3">System</p>
                    <button className="flex w-full items-center gap-[9px] rounded-md px-2.5 py-[7px] text-sm text-text2 transition-colors duration-[120ms] hover:bg-raised">
                      <Box className="h-[15px] w-[15px]" strokeWidth={2} />Models
                      <Badge className="ml-auto bg-accent-porter text-white text-2xs px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full">2</Badge>
                    </button>
                    {[
                      { icon: Monitor, label: "Tools" },
                      { icon: Link, label: "Connections" },
                    ].map(item => (
                      <button key={item.label} className="flex w-full items-center gap-[9px] rounded-md px-2.5 py-[7px] text-sm text-text2 transition-colors duration-[120ms] hover:bg-raised">
                        <item.icon className="h-[15px] w-[15px]" strokeWidth={2} />{item.label}
                      </button>
                    ))}

                    <p className="px-2.5 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.06em] text-text3">Inspect</p>
                    {[
                      { icon: Brain, label: "Memory" },
                      { icon: Shield, label: "Logs" },
                    ].map(item => (
                      <button key={item.label} className="flex w-full items-center gap-[9px] rounded-md px-2.5 py-[7px] text-sm text-text2 transition-colors duration-[120ms] hover:bg-raised">
                        <item.icon className="h-[15px] w-[15px]" strokeWidth={2} />{item.label}
                      </button>
                    ))}
                  </nav>

                  <div className="border-t border-border p-3">
                    <div className="mb-2"><button className="flex h-7 w-7 items-center justify-center rounded text-text3 transition-colors hover:text-text2"><Moon className="h-4 w-4" /></button></div>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7"><AvatarFallback className="bg-accent-porter text-2xs font-bold text-white">M</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground truncate">moe</p><p className="text-2xs text-text3">operator</p></div>
                      <button className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2"><Settings className="h-3.5 w-3.5" /></button>
                      <button className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-text2"><LogOut className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="mt-2.5 text-center text-2xs uppercase tracking-widest text-text3">Porter v0.34.23</p>
                  </div>
                </div>

                {/* Collapsed rail */}
                <div className="flex w-[52px] flex-col items-center rounded-lg bg-surface py-3">
                  <PorterLogo size="sm" showText={false} className="mb-3" />
                  <Separator className="mb-2 bg-border" />
                  {[FolderKanban, Bot, FileText, Users].map((Icon, i) => (
                    <button key={i} className={`mb-0.5 flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-[120ms] ${i === 0 ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:bg-raised hover:text-text2"}`}>
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                    </button>
                  ))}
                  <Separator className="my-2 bg-border" />
                  {[Box, Monitor, Link].map((Icon, i) => (
                    <button key={i} className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-md text-text3 transition-colors hover:bg-raised hover:text-text2">
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                    </button>
                  ))}
                  <Separator className="my-2 bg-border" />
                  {[Brain, Shield].map((Icon, i) => (
                    <button key={i} className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-md text-text3 transition-colors hover:bg-raised hover:text-text2">
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                    </button>
                  ))}
                </div>
              </div>

              <Sub title="Breadcrumbs">
                <div className="flex items-center gap-1.5 text-xs">
                  <a href="#" className="text-text2 hover:text-accent-porter transition-colors">Home</a>
                  <ChevronRight className="h-3 w-3 text-text3" />
                  <a href="#" className="text-text2 hover:text-accent-porter transition-colors">Projects</a>
                  <ChevronRight className="h-3 w-3 text-text3" />
                  <a href="#" className="text-text2 hover:text-accent-porter transition-colors truncate max-w-[120px]">Marketing Site</a>
                  <ChevronRight className="h-3 w-3 text-text3" />
                  <span className="font-medium text-foreground">Timeline</span>
                </div>
              </Sub>

              <Sub title="Pagination">
                <PaginationDemo />
              </Sub>

              <Sub title="Step Indicator">
                <StepIndicator />
              </Sub>

              <Sub title="Command Palette">
                <CommandPaletteDemo />
              </Sub>


              <Sub title="Mobile Bottom Tab Bar">
                <div className="relative mx-auto w-[375px] rounded-2xl border border-border bg-background overflow-hidden">
                  <div className="h-20 flex items-center justify-center text-2xs text-text3">App content area</div>
                  <div className="border-t border-border bg-surface px-2 pb-1 pt-1.5">
                    <div className="flex items-center justify-around">
                      {[
                        { icon: FolderKanban, label: "Projects", active: false, badge: 0 },
                        { icon: Bot, label: "Agents", active: false, badge: 0 },
                        { icon: MessagesSquare, label: "Chat", active: true, badge: 3 },
                        { icon: FileText, label: "Files", active: false, badge: 0 },
                        { icon: MoreHorizontal, label: "More", active: false, badge: 0 },
                      ].map(tab => (
                        <button key={tab.label} className="relative flex flex-col items-center gap-0.5 py-1 px-3">
                          <div className="relative">
                            <tab.icon className={`h-5 w-5 ${tab.active ? "text-accent-porter" : "text-text3"}`} />
                            {tab.badge > 0 && (
                              <div className="absolute -right-1.5 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-2xs font-bold text-white">{tab.badge}</div>
                            )}
                          </div>
                          <span className={`text-2xs ${tab.active ? "font-semibold text-accent-porter" : "text-text3"}`}>{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Touch Target Guide">
                <p className="text-xs text-text2 mb-3">Minimum 44x44px touch areas on interactive elements for mobile usability.</p>
                <div className="flex items-center gap-8">
                  <div className="relative">
                    <button className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-porter text-white">
                      <Plus className="h-4 w-4" />
                    </button>
                    <div className="absolute inset-[-8px] rounded-lg border-2 border-dashed border-danger/40 pointer-events-none" />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-2xs text-text3">44 x 44px</div>
                  </div>
                  <div className="relative">
                    <button className="flex h-11 w-11 items-center justify-center rounded-md bg-accent-porter text-white">
                      <Plus className="h-4 w-4" />
                    </button>
                    <div className="absolute inset-0 rounded-lg border-2 border-dashed border-success/40 pointer-events-none" />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-2xs text-success">44 x 44px</div>
                  </div>
                </div>
              </Sub>
              <Sub title="Back Button">
                <div className="flex items-center gap-4">
                  <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text2 transition-colors hover:bg-raised hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />Back to Projects
                  </button>
                  <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text2 transition-colors hover:bg-raised hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />Back to Agents
                  </button>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                10. TABS
                ============================================================ */}
            <Section id="tabs" title="Tabs">
              <p className="text-xs text-text2 mb-4">3 variants with sliding animated indicator. 280ms cubic-bezier transition.</p>
              <Sub title="Page Tabs (6+ tabs)">
                <p className="text-xs text-text2 mb-3">Primary page navigation. Frosted glass, taller, indigo glow indicator.</p>
                <Tabs defaultValue="overview">
                  <TabsList variant="page">
                    <TabsTrigger value="overview"><Layers className="size-3.5" /> Overview</TabsTrigger>
                    <TabsTrigger value="profile"><CircleUser className="size-3.5" /> Profile</TabsTrigger>
                    <TabsTrigger value="activity"><Activity className="size-3.5" /> Activity</TabsTrigger>
                    <TabsTrigger value="insights"><BrainCircuit className="size-3.5" /> Insights</TabsTrigger>
                    <TabsTrigger value="billing"><CreditCard className="size-3.5" /> Billing</TabsTrigger>
                    <TabsTrigger value="settings"><Settings className="size-3.5" /> Settings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="pt-3 text-xs text-text2">Overview — revenue, stats, signals.</TabsContent>
                  <TabsContent value="profile" className="pt-3 text-xs text-text2">Profile — CRM fields, contact info.</TabsContent>
                  <TabsContent value="activity" className="pt-3 text-xs text-text2">Activity — logins, token usage.</TabsContent>
                  <TabsContent value="insights" className="pt-3 text-xs text-text2">AI Insights — scores, agent tasks.</TabsContent>
                  <TabsContent value="billing" className="pt-3 text-xs text-text2">Billing — invoices, subscription.</TabsContent>
                  <TabsContent value="settings" className="pt-3 text-xs text-text2">Settings — preferences, API keys.</TabsContent>
                </Tabs>
              </Sub>
              <Sub title="Content Tabs (2-4 tabs)">
                <p className="text-xs text-text2 mb-3">In-section navigation. Compact, subtle indigo tint indicator.</p>
                <Tabs defaultValue="chat" className="max-w-lg">
                  <TabsList variant="content">
                    <TabsTrigger value="chat"><MessagesSquare className="size-3.5" /> Chat</TabsTrigger>
                    <TabsTrigger value="jobs"><Activity className="size-3.5" /> Jobs</TabsTrigger>
                    <TabsTrigger value="concepts"><BrainCircuit className="size-3.5" /> Concepts</TabsTrigger>
                  </TabsList>
                  <TabsContent value="chat" className="pt-3 text-xs text-text2">Chat workspace for this agent.</TabsContent>
                  <TabsContent value="jobs" className="pt-3 text-xs text-text2">Job history and queue.</TabsContent>
                  <TabsContent value="concepts" className="pt-3 text-xs text-text2">Learned concepts and memory.</TabsContent>
                </Tabs>
              </Sub>
              <Sub title="File Tabs (7+ tabs, scrollable)">
                <p className="text-xs text-text2 mb-3">Browser-style tabs. Uppercase tracking, scrollable overflow, strong glow.</p>
                <Tabs defaultValue="soul" className="max-w-xl">
                  <TabsList variant="file">
                    <TabsTrigger value="soul">SOUL.md</TabsTrigger>
                    <TabsTrigger value="identity">IDENTITY.md</TabsTrigger>
                    <TabsTrigger value="role">ROLE_CARD.md</TabsTrigger>
                    <TabsTrigger value="skills">SKILLS.md</TabsTrigger>
                    <TabsTrigger value="user">USER.md</TabsTrigger>
                    <TabsTrigger value="deliver">DELIVERABLES.md</TabsTrigger>
                    <TabsTrigger value="memory">MEMORY.md</TabsTrigger>
                  </TabsList>
                  <TabsContent value="soul" className="pt-3 text-xs text-text2">Agent soul — core personality and values.</TabsContent>
                  <TabsContent value="identity" className="pt-3 text-xs text-text2">Identity — name, archetype, appearance.</TabsContent>
                  <TabsContent value="role" className="pt-3 text-xs text-text2">Role card — responsibilities and scope.</TabsContent>
                  <TabsContent value="skills" className="pt-3 text-xs text-text2">Skills — capabilities and proficiencies.</TabsContent>
                  <TabsContent value="user" className="pt-3 text-xs text-text2">User guide — how to interact with this agent.</TabsContent>
                  <TabsContent value="deliver" className="pt-3 text-xs text-text2">Deliverables — expected outputs and artifacts.</TabsContent>
                  <TabsContent value="memory" className="pt-3 text-xs text-text2">Memory — learned concepts and directives.</TabsContent>
                </Tabs>
              </Sub>
              <Sub title="Full Width (Content)">
                <Tabs defaultValue="signals">
                  <TabsList variant="content" className="w-full">
                    <TabsTrigger value="signals" className="flex-1">Signals</TabsTrigger>
                    <TabsTrigger value="projects" className="flex-1">Projects</TabsTrigger>
                    <TabsTrigger value="agents" className="flex-1">Agents</TabsTrigger>
                    <TabsTrigger value="billing" className="flex-1">Billing</TabsTrigger>
                  </TabsList>
                  <TabsContent value="signals" className="pt-3 text-xs text-text2">Anomalies and alerts.</TabsContent>
                  <TabsContent value="projects" className="pt-3 text-xs text-text2">Project list.</TabsContent>
                  <TabsContent value="agents" className="pt-3 text-xs text-text2">Created agents.</TabsContent>
                  <TabsContent value="billing" className="pt-3 text-xs text-text2">Billing events.</TabsContent>
                </Tabs>
              </Sub>
            </Section>


          </div>
        </TabsContent>

        {/* ── Chat ── */}
        <TabsContent value="chat">
          <div className="space-y-10">

            {/* ============================================================
                10. CHAT
                ============================================================ */}
            <Section id="chat" title="Chat">
              <Sub title="Message Bubbles">
                <div className="max-w-xl space-y-2.5 rounded-lg bg-background p-5">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-[10px] rounded-br-[2px] bg-accent-porter px-3.5 py-2.5 text-sm leading-relaxed text-white">
                      Create a new project for the marketing website
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      I'll set that up. What type of website -- landing page, full marketing site, or documentation?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-[10px] rounded-bl-[2px] border border-danger/30 bg-transparent px-3.5 py-2 text-xs italic text-danger">
                      Error: Connection timeout. Retrying...
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Thinking Indicator">
                <div className="flex gap-1 rounded-[10px] bg-raised px-4 py-3 w-fit">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-1.5 w-1.5 rounded-full bg-text3 animate-[chat-think_1.4s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </Sub>

              <Sub title="Chat Composer">
                <div className="composer-gradient max-w-xl rounded-2xl border border-[color-mix(in_srgb,var(--accent-porter)_28%,var(--border))] bg-gradient-to-b from-[color-mix(in_srgb,var(--surface)_98%,transparent)] to-[color-mix(in_srgb,var(--accent-porter)_3%,var(--background))] p-3 shadow-[inset_0_1px_0_var(--inset-highlight)]">
                  <div className="flex items-end gap-3">
                    <textarea
                      rows={1}
                      placeholder="Message Porter..."
                      className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-text3 focus:outline-none"
                    />
                    <button className="btn-send flex h-9 items-center gap-2 px-4 text-2xs font-extrabold uppercase tracking-[0.08em]">
                      <Send className="h-3.5 w-3.5" />Send
                    </button>
                  </div>
                </div>
              </Sub>

              <Sub title="Wizard Question Card">
                <div className="max-w-md space-y-2 rounded-xl border border-border bg-surface p-4">
                  <p className="text-sm font-medium text-foreground">What kind of website do you need?</p>
                  <div className="space-y-1.5">
                    {["Landing page -- single scroll", "Full marketing site -- multi-page", "Documentation -- technical docs"].map((opt, i) => (
                      <button key={i} className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150 ${i === 0 ? "border-accent-porter/40 bg-accent-porter/10 text-accent-porter" : "border-border text-text2 hover:border-border2 hover:bg-raised"}`}>
                        {i + 1}. {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </Sub>

              <Sub title="Proposal Card">
                <div className="max-w-lg rounded-xl border border-accent-porter/20 bg-surface p-5 shadow-[var(--shadow-proposal)]">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-accent-porter" />
                    <p className="text-sm font-bold text-foreground">Bakery Marketing Site</p>
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">website</Badge>
                  </div>
                  <p className="text-xs text-text2 mb-4">I'll assign a team of 3 agents to build your bakery's website with a menu showcase and online ordering.</p>
                  <div className="flex gap-4 mb-4">
                    {[
                      { name: "Maya", role: "designer", skin: "#FDBCB4", hair: "#8B4513", shirt: "#8B5CF6", hs: "long" as const },
                      { name: "Dev", role: "developer", skin: "#F5D0A9", hair: "#1A1A2E", shirt: "#6366F1", hs: "short" as const },
                      { name: "Copy", role: "writer", skin: "#D4A574", hair: "#2C1810", shirt: "#22C55E", hs: "curly" as const },
                    ].map(a => (
                      <div key={a.name} className="text-center">
                        <PixelPortrait skin={a.skin} hair={a.hair} eyes="#1A1A2E" shirt={a.shirt} hairStyle={a.hs} size="sm" />
                        <p className="text-2xs font-bold text-foreground">{a.name}</p>
                        <p className="text-2xs text-text3">{a.role}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mb-4 space-y-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-text3">Milestones</p>
                    {["Design homepage layout", "Build menu showcase", "Add contact form", "Deploy to production"].map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-text2">
                        <div className="h-1.5 w-1.5 rounded-full bg-border2" />{m}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-success/15 text-success text-2xs">Small (1-2 weeks)</Badge>
                    <Button size="sm" className="bg-accent-porter font-bold text-white hover:bg-accent-hover hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] transition-all duration-150">
                      <Check className="mr-1 h-3.5 w-3.5" />Approve & Start
                    </Button>
                  </div>
                </div>
              </Sub>

              <Sub title="Build Mode Toggle">
                <div className="flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5">
                  <BrainCircuit className="h-3.5 w-3.5 text-accent-porter" />
                  <span className="text-xs font-medium text-accent-porter">Build Mode</span>
                  <div className="ml-1 h-4 w-7 rounded-full bg-accent-porter p-0.5"><div className="h-3 w-3 rounded-full bg-white translate-x-3 transition-transform" /></div>
                </div>
              </Sub>

              <Sub title="Orbiting Dots (Thinking)">
                <div className="relative h-8 w-8">
                  {[1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className={`absolute h-2 w-2 rounded-full bg-accent-porter animate-orbit-dot-${i}`}
                    />
                  ))}
                </div>
              </Sub>

              <Sub title="Code Block">
                <div className="max-w-lg rounded-lg border border-border bg-[#0D1117] p-4 relative group">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-raised/50 text-text3 text-2xs px-1.5 py-0">typescript</Badge>
                    <button className="flex items-center gap-1 text-2xs text-text3 hover:text-text2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Copy className="h-3 w-3" />Copy
                    </button>
                  </div>
                  <pre className="text-sm leading-relaxed font-mono overflow-x-auto">
                    <code>
                      <span style={{ color: "#C678DD" }}>const</span>{" "}
                      <span style={{ color: "#E06C75" }}>porter</span>{" "}
                      <span style={{ color: "#56B6C2" }}>=</span>{" "}
                      <span style={{ color: "#C678DD" }}>await</span>{" "}
                      <span style={{ color: "#61AFEF" }}>dispatch</span>
                      <span style={{ color: "#ABB2BF" }}>({"{"}</span>{"\n"}
                      {"  "}<span style={{ color: "#E06C75" }}>task</span>
                      <span style={{ color: "#ABB2BF" }}>:</span>{" "}
                      <span style={{ color: "#98C379" }}>"Design landing page"</span>
                      <span style={{ color: "#ABB2BF" }}>,</span>{"\n"}
                      {"  "}<span style={{ color: "#E06C75" }}>agent</span>
                      <span style={{ color: "#ABB2BF" }}>:</span>{" "}
                      <span style={{ color: "#98C379" }}>"maya"</span>{"\n"}
                      <span style={{ color: "#ABB2BF" }}>{"}"})</span>
                    </code>
                  </pre>
                </div>
              </Sub>

              <Sub title="Inline Table">
                <div className="max-w-lg">
                  <div className="rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5">
                    <p className="text-sm leading-relaxed text-foreground mb-2">Here are the current model costs:</p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-1.5 pr-4 text-left font-semibold text-text2">Model</th>
                          <th className="py-1.5 pr-4 text-left font-semibold text-text2">Input</th>
                          <th className="py-1.5 text-left font-semibold text-text2">Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { model: "Claude Opus", input: "$15/M", output: "$75/M" },
                          { model: "GPT-5.4", input: "$10/M", output: "$30/M" },
                          { model: "Qwen 2.5", input: "Free", output: "Free" },
                        ].map(r => (
                          <tr key={r.model} className="border-b border-border/30">
                            <td className="py-1.5 pr-4 text-foreground">{r.model}</td>
                            <td className="py-1.5 pr-4 text-text2">{r.input}</td>
                            <td className="py-1.5 text-text2">{r.output}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Sub>

              <Sub title="File Type Icons">
                <p className="text-xs text-text2 mb-3">Auto-detected from file extension. Color-coded by type. Image files can show thumbnails.</p>
                <FileTypeIconGallery />
              </Sub>

              <Sub title="File Preview Card">
                <div className="flex flex-wrap gap-3">
                  {[
                    { name: "design-brief.pdf", size: "2.4 MB" },
                    { name: "hero-image.png", size: "1.1 MB" },
                    { name: "app.tsx", size: "48 KB" },
                    { name: "budget.xlsx", size: "320 KB" },
                    { name: "intro.mp4", size: "24 MB" },
                  ].map(f => (
                    <div key={f.name} className="flex items-center gap-3 w-[260px] cursor-pointer rounded-lg border border-border bg-surface p-2.5 transition-all hover:border-accent-porter/30 hover:shadow-[var(--shadow-sm)]">
                      <FileTypeIcon filename={f.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                        <p className="text-2xs text-text3">{f.size}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Link Preview Card">
                <div className="max-w-sm cursor-pointer rounded-lg border border-border bg-surface overflow-hidden transition-all hover:border-accent-porter/30 hover:shadow-[var(--shadow-sm)]">
                  <div className="h-28 bg-raised" />
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Globe className="h-3 w-3 text-text3" />
                      <span className="text-2xs text-text3">askporter.app</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">Porter -- AI Orchestration Platform</p>
                    <p className="mt-0.5 text-2xs text-text2 line-clamp-2">Build, deploy, and manage AI agent teams. Porter orchestrates multiple models to complete complex projects autonomously.</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Inline Progress">
                <div className="max-w-lg">
                  <div className="rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5">
                    <p className="text-sm text-foreground mb-2">Working on it...</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-medium text-text2 shrink-0">Step 3 of 5</span>
                      <div className="flex-1 h-2 rounded-full bg-background overflow-hidden">
                        <div className="h-full rounded-full bg-accent-porter transition-all duration-500" style={{ width: "60%" }} />
                      </div>
                      <span className="text-2xs font-medium text-accent-porter shrink-0">60%</span>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Agent Handoff">
                <div className="max-w-md flex items-center gap-3 rounded-lg border border-accent-porter/20 bg-accent-porter/5 px-4 py-3">
                  <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#F59E0B" hairStyle="short" size="sm" />
                  <div className="flex-1">
                    <p className="text-xs text-text2">Passing to <span className="font-bold text-foreground">Maya</span>...</p>
                    <p className="text-2xs text-text3">Design task requires visual specialist</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-accent-porter" />
                  <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="long" size="sm" />
                </div>
              </Sub>

              <Sub title="Collapsible Section">
                <CollapsibleChatSection />
              </Sub>

              <Sub title="Multi-agent Indicator">
                <div className="flex items-center gap-2 rounded-full bg-raised px-3 py-1.5 w-fit">
                  <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#F59E0B" hairStyle="short" size="sm" />
                  <span className="text-2xs text-text2">Porter is thinking about <span className="font-medium text-foreground">Marketing Site</span>...</span>
                  <Loader2 className="h-3 w-3 animate-spin text-accent-porter" />
                </div>
              </Sub>

              <Sub title="Message Actions Menu">
                <p className="text-xs text-text2 mb-3">Hover over a message to reveal contextual actions. Appears with a smooth fade-in.</p>
                <div className="max-w-xl rounded-lg bg-background p-5">
                  <div className="group relative flex justify-start">
                    <div className="max-w-[85%] rounded-[10px] rounded-bl-[2px] border border-border bg-raised px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      I've finished the homepage design. Want me to move on to the about page next?
                    </div>
                    <div className="absolute -top-8 left-4 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-0.5 shadow-[var(--shadow-md)] opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      {[
                        { icon: Copy, label: "Copy" },
                        { icon: MessageCircle, label: "Reply" },
                        { icon: Pin, label: "Pin" },
                        { icon: Trash2, label: "Delete" },
                      ].map(a => (
                        <Tooltip key={a.label}>
                          <TooltipTrigger asChild>
                            <button className="flex h-7 w-7 items-center justify-center rounded-md text-text3 hover:bg-raised hover:text-text2 transition-colors">
                              <a.icon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-2xs">{a.label}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Slash Commands / Autocomplete">
                <p className="text-xs text-text2 mb-3">Popup above the chat input showing available slash commands with descriptions.</p>
                <div className="max-w-md">
                  <div className="rounded-lg border border-border bg-surface shadow-[var(--shadow-dropdown)] overflow-hidden mb-2">
                    {[
                      { cmd: "/build", desc: "Start a build task", icon: Wrench, shortcut: null },
                      { cmd: "/search", desc: "Search across projects", icon: Search, shortcut: null },
                      { cmd: "/agent", desc: "Manage agents", icon: Bot, shortcut: "Tab" },
                      { cmd: "/help", desc: "Show available commands", icon: Info, shortcut: "?" },
                    ].map((c, i) => (
                      <button
                        key={c.cmd}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          i === 0 ? "bg-accent-porter/10" : "hover:bg-raised"
                        }`}
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${i === 0 ? "bg-accent-porter/15" : "bg-raised"}`}>
                          <c.icon className={`h-3.5 w-3.5 ${i === 0 ? "text-accent-porter" : "text-text3"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-mono font-bold ${i === 0 ? "text-accent-porter" : "text-foreground"}`}>{c.cmd}</span>
                          <span className="ml-2 text-2xs text-text3">{c.desc}</span>
                        </div>
                        {c.shortcut && (
                          <kbd className="rounded border border-border bg-raised px-1.5 py-0.5 font-mono text-2xs text-text3">{c.shortcut}</kbd>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="composer-gradient rounded-2xl border border-[color-mix(in_srgb,var(--accent-porter)_28%,var(--border))] bg-gradient-to-b from-[color-mix(in_srgb,var(--surface)_98%,transparent)] to-[color-mix(in_srgb,var(--accent-porter)_3%,var(--background))] p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-accent-porter font-mono">/</span>
                      <span className="text-sm text-text3">Type a command...</span>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Chat Session List">
                <ChatSessionList />
              </Sub>

              <Sub title="Chat Context Chips">
                <p className="text-xs text-text2 mb-3">Bar above the composer showing bound context. Each chip is removable.</p>
                <div className="max-w-xl space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    {[
                      { label: "Marketing Site", icon: FolderKanban, color: "bg-accent-porter/15 text-accent-porter border-accent-porter/20" },
                      { label: "Claude Opus", icon: Cpu, color: "bg-chart-2/15 text-chart-2 border-chart-2/20" },
                      { label: "Maya", icon: Bot, color: "bg-success/15 text-success border-success/20" },
                    ].map(chip => (
                      <div key={chip.label} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${chip.color}`}>
                        <chip.icon className="h-3 w-3" />
                        <span className="text-2xs font-medium">{chip.label}</span>
                        <button className="ml-0.5 rounded-full hover:bg-background/30 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="composer-gradient rounded-2xl border border-[color-mix(in_srgb,var(--accent-porter)_28%,var(--border))] bg-gradient-to-b from-[color-mix(in_srgb,var(--surface)_98%,transparent)] to-[color-mix(in_srgb,var(--accent-porter)_3%,var(--background))] p-3">
                    <div className="flex items-end gap-3">
                      <textarea rows={1} placeholder="Message Porter..." className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-text3 focus:outline-none" readOnly />
                      <button className="btn-send flex h-9 items-center gap-2 px-4 text-2xs font-extrabold uppercase tracking-[0.08em]">
                        <Send className="h-3.5 w-3.5" />Send
                      </button>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Model / Persona Selector">
                <p className="text-xs text-text2 mb-3">Inline bar in chat header showing active model and agent. Clickable to change.</p>
                <div className="max-w-lg flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#F59E0B" hairStyle="short" size="sm" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Porter</p>
                      <p className="text-2xs text-text3">orchestrator</p>
                    </div>
                  </div>
                  <Separator orientation="vertical" className="h-6 bg-border" />
                  <div className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1 hover:bg-raised transition-colors">
                    <Cpu className="h-3.5 w-3.5 text-accent-porter" />
                    <span className="text-xs font-medium text-foreground">Claude Opus</span>
                    <ChevronDown className="h-3 w-3 text-text3" />
                  </div>
                  <Separator orientation="vertical" className="h-6 bg-border" />
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-2xs text-text3">Connected</span>
                  </div>
                </div>
              </Sub>

            </Section>


          </div>
        </TabsContent>

        {/* ── Data: Activity, Charts, Tables ── */}
        <TabsContent value="data">
          <div className="space-y-10">

            {/* ============================================================
                11. ACTIVITY
                ============================================================ */}
            <Section id="activity" title="Activity">
              <Sub title="Activity Feed">
                <div className="max-w-lg space-y-3">
                  {/* Active */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <div className="h-2 w-2 animate-pulse-badge rounded-full bg-accent-porter" />Active
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0 rounded-full">1</Badge>
                  </div>
                  <div className="rounded-lg border border-accent-porter/20 bg-accent-porter/5 p-3">
                    <div className="flex items-center gap-2.5">
                      <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#22C55E" hairStyle="curly" size="sm" isAnimated />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-foreground">Sam is writing homepage copy</p>
                        <p className="text-2xs text-text3">Started 2 minutes ago</p>
                      </div>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-porter" />
                    </div>
                  </div>

                  {/* Completed */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <div className="h-2 w-2 rounded-full bg-success" />Completed
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0 rounded-full">2</Badge>
                  </div>
                  {[
                    { agent: "Maya", action: "Designed hero section layout", time: "15 minutes ago" },
                    { agent: "Dev", action: "Set up project scaffolding", time: "1 hour ago" },
                  ].map((e, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-3">
                      <div className="h-8 w-6 rounded bg-success/10" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-foreground">{e.agent}: {e.action}</p>
                        <p className="text-2xs text-text3">{e.time}</p>
                      </div>
                      <Check className="h-3.5 w-3.5 text-success" />
                    </div>
                  ))}

                  {/* Queued */}
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <div className="h-2 w-2 rounded-full bg-text3" />Queued
                    <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0 rounded-full">1</Badge>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-surface/50 p-3 opacity-60">
                    <div className="h-8 w-6 rounded bg-raised" />
                    <div className="flex-1">
                      <p className="text-xs text-text2">Copy: Write about page content</p>
                      <p className="text-2xs text-text3">Waiting for dependencies</p>
                    </div>
                    <Clock className="h-3.5 w-3.5 text-text3" />
                  </div>
                </div>
              </Sub>

              <Sub title="Agent Status Strip">
                <div className="flex gap-4">
                  {[
                    { name: "Porter", role: "orchestrator", status: "bg-success", skin: "#F5D0A9", hair: "#2C1810", shirt: "#F59E0B", hs: "short" as const },
                    { name: "Maya", role: "designer", status: "bg-accent-porter animate-pulse-badge", skin: "#FDBCB4", hair: "#8B4513", shirt: "#8B5CF6", hs: "long" as const },
                    { name: "Dev", role: "developer", status: "bg-success", skin: "#F5D0A9", hair: "#1A1A2E", shirt: "#6366F1", hs: "short" as const },
                    { name: "Sam", role: "writer", status: "bg-accent-porter animate-pulse-badge", skin: "#FDBCB4", hair: "#8B4513", shirt: "#22C55E", hs: "curly" as const },
                  ].map(a => (
                    <div key={a.name} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                      <PixelPortrait skin={a.skin} hair={a.hair} eyes="#1A1A2E" shirt={a.shirt} hairStyle={a.hs} size="sm" />
                      <div>
                        <p className="text-xs font-bold text-foreground">{a.name}</p>
                        <p className="text-2xs text-text3">{a.role}</p>
                      </div>
                      <div className={`ml-1 h-2 w-2 rounded-full ${a.status}`} />
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Rich Activity Feed">
                <RichActivityFeed />
              </Sub>
            </Section>

            {/* ============================================================
                12. DATA
                ============================================================ */}
            <Section id="data" title="Data">
              <Sub title="Decision Log Table">
                <div className="max-w-2xl overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[80px_100px_1fr_120px] gap-3 border-b border-border bg-surface px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-text3">
                    <span>Time</span><span>Type</span><span>Decision</span><span>Chosen</span>
                  </div>
                  {[
                    { time: "10:32", type: "model", decision: "Code analysis requires strong reasoning", chosen: "claude-opus" },
                    { time: "10:28", type: "routing", decision: "Short message, low complexity", chosen: "qwen-2.5" },
                    { time: "10:15", type: "model", decision: "Creative writing task detected", chosen: "gpt-5.4" },
                  ].map((d, i) => (
                    <div key={i} className="grid grid-cols-[80px_100px_1fr_120px] gap-3 border-b border-border/50 px-3 py-2.5 text-xs transition-colors hover:bg-raised">
                      <span className="font-mono text-text3">{d.time}</span>
                      <Badge className="w-fit bg-raised text-text3 text-2xs px-1.5 py-0">{d.type}</Badge>
                      <span className="text-text2">{d.decision}</span>
                      <span className="font-medium text-foreground">{d.chosen}</span>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Health Panel">
                <div className="grid max-w-xl grid-cols-4 gap-3">
                  {[
                    { label: "Uptime", value: "99.8%", color: "success" },
                    { label: "Avg Latency", value: "42ms", color: "accent-porter" },
                    { label: "Requests/h", value: "1,247", color: "accent-porter" },
                    { label: "Errors", value: "3", color: "danger" },
                  ].map(m => (
                    <div key={m.label} className="rounded-[10px] border border-border bg-surface p-3 text-center">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-text3">{m.label}</p>
                      <p className={`mt-1 text-lg font-bold text-${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Bar Chart (Token Usage)">
                <div className="max-w-md">
                  <BarChart data={[
                    { label: "Opus", value: 12400, color: "accent-porter" },
                    { label: "GPT-5.4", value: 8200, color: "warning" },
                    { label: "Qwen", value: 4100, color: "success" },
                    { label: "Gemini", value: 2800, color: "danger" },
                  ]} />
                </div>
              </Sub>

              <Sub title="Progress Bars">
                <div className="max-w-sm space-y-3">
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-2xs text-text2">Phase 1</span><span className="text-2xs font-medium text-foreground">72%</span></div>
                    <ProgressBar value={72} color="accent-porter" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-2xs text-text2">Phase 2</span><span className="text-2xs font-medium text-foreground">35%</span></div>
                    <ProgressBar value={35} color="warning" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-2xs text-text2">Phase 3</span><span className="text-2xs font-medium text-foreground">100%</span></div>
                    <ProgressBar value={100} color="success" />
                  </div>
                </div>
              </Sub>

              <Sub title="Sparklines">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <Sparkline values={[3,5,4,7,6,8,5,9,7,10,8,12]} color="accent-porter" />
                    <p className="mt-1 text-2xs text-text3">Requests</p>
                  </div>
                  <div className="text-center">
                    <Sparkline values={[8,6,7,5,3,4,2,3,1,2,1,0]} color="danger" />
                    <p className="mt-1 text-2xs text-text3">Errors</p>
                  </div>
                  <div className="text-center">
                    <Sparkline values={[2,3,3,4,5,5,6,7,7,8,8,9]} color="success" />
                    <p className="mt-1 text-2xs text-text3">Uptime</p>
                  </div>
                </div>
              </Sub>

              <Sub title="LLM Terminal">
                <p className="text-xs text-text3 mb-2">Activity feed / log viewer. Dark terminal aesthetic. Always fills its container height — use h-* or min-h-* on the component.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xs text-text3 mb-1">Default (content height)</p>
                    <LLMTerminal
                      title="agent log"
                      lines={[
                        { _key: 0, text: "now      Task started", color: "text-success" },
                        { _key: 1, text: "2s ago   Routing to claude-opus", color: "text-accent-porter" },
                        { _key: 2, text: "5s ago   Response received (342 tokens)", color: "text-text3" },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="text-2xs text-text3 mb-1">Fixed height (h-[200px]) — black fills container</p>
                    <LLMTerminal
                      title="activity"
                      className="h-[200px]"
                      lines={[
                        { _key: 0, text: "1h ago   Logged in 127.0.0.1", color: "text-success" },
                        { _key: 1, text: "2h ago   Project created", color: "text-accent-porter" },
                      ]}
                    />
                  </div>
                </div>
              </Sub>

              <Sub title="Status Gauge">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <StatusGauge segments={[
                      { pct: 65, color: "success" },
                      { pct: 20, color: "warning" },
                      { pct: 15, color: "danger" },
                    ]} />
                    <p className="mt-1.5 text-2xs text-text3">System health</p>
                  </div>
                  <div className="text-center">
                    <StatusGauge segments={[
                      { pct: 40, color: "accent-porter" },
                      { pct: 30, color: "chart-2" },
                      { pct: 20, color: "chart-3" },
                      { pct: 10, color: "chart-5" },
                    ]} />
                    <p className="mt-1.5 text-2xs text-text3">Model usage</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Progress Rings">
                <div className="flex items-center gap-6">
                  {[
                    { pct: 72, color: "accent-porter", label: "Tasks" },
                    { pct: 100, color: "success", label: "Tests" },
                    { pct: 35, color: "warning", label: "Deploy" },
                  ].map(r => (
                    <div key={r.label} className="text-center">
                      <div className="relative">
                        <ProgressRing pct={r.pct} color={r.color} />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">{r.pct}%</span>
                      </div>
                      <p className="mt-1 text-2xs text-text3">{r.label}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Timeline">
                <div className="max-w-lg">
                  {[
                    { title: "Project kickoff", desc: "Team assembled, scope defined", time: "Mar 1", status: "complete" as const },
                    { title: "Design phase", desc: "Wireframes and mockups approved", time: "Mar 8", status: "complete" as const },
                    { title: "Development sprint 1", desc: "Core features implementation", time: "Mar 15", status: "active" as const },
                    { title: "Testing & QA", desc: "Full regression test suite", time: "Mar 22", status: "upcoming" as const },
                    { title: "Production deploy", desc: "Launch to production environment", time: "Mar 29", status: "upcoming" as const },
                  ].map((item, i, arr) => (
                    <div key={i} className="flex gap-4">
                      {/* Vertical line + node */}
                      <div className="flex flex-col items-center">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                          item.status === "complete"
                            ? "border-success bg-success/15"
                            : item.status === "active"
                            ? "border-accent-porter bg-accent-porter/15 animate-timeline-pulse"
                            : "border-border2 bg-raised"
                        }`}>
                          {item.status === "complete" ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : item.status === "active" ? (
                            <div className="h-2 w-2 rounded-full bg-accent-porter" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-text3" />
                          )}
                        </div>
                        {i < arr.length - 1 && (
                          <div className={`w-0.5 flex-1 min-h-[32px] ${
                            item.status === "complete" ? "bg-success/40" : "bg-border"
                          }`} />
                        )}
                      </div>
                      {/* Content */}
                      <div className={`pb-6 ${item.status === "upcoming" ? "opacity-50" : ""}`}>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold ${item.status === "active" ? "text-accent-porter" : "text-foreground"}`}>{item.title}</p>
                          <span className="text-2xs text-text3">{item.time}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-text2">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Schedule List">
                <div className="max-w-md space-y-4">
                  {[
                    { day: "Today", items: [
                      { time: "10:00", title: "Design review with Maya", type: "agent", skin: "#FDBCB4", hair: "#8B4513", shirt: "#8B5CF6", hs: "long" as const },
                      { time: "14:30", title: "Sprint planning", type: "event", skin: "#F5D0A9", hair: "#2C1810", shirt: "#F59E0B", hs: "short" as const },
                    ]},
                    { day: "Tomorrow", items: [
                      { time: "09:00", title: "Deploy v0.34", type: "deadline", skin: "#D4A574", hair: "#1A1A2E", shirt: "#6366F1", hs: "mohawk" as const },
                    ]},
                    { day: "March 25", items: [
                      { time: "11:00", title: "Content review with Sam", type: "agent", skin: "#FDBCB4", hair: "#8B4513", shirt: "#22C55E", hs: "curly" as const },
                      { time: "16:00", title: "Client presentation", type: "event", skin: "#F5D0A9", hair: "#2C1810", shirt: "#F59E0B", hs: "short" as const },
                    ]},
                  ].map(group => (
                    <div key={group.day}>
                      <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text3 mb-1.5">{group.day}</p>
                      <div className="space-y-1">
                        {group.items.map((item, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 border-l-[3px] ${
                              item.type === "agent" ? "border-l-accent-porter" :
                              item.type === "deadline" ? "border-l-danger" :
                              "border-l-warning"
                            } ${i === 0 && group.day === "Today" ? "bg-accent-porter/5 border-accent-porter/20" : ""}`}
                          >
                            <span className="text-2xs font-mono text-text3 w-10 shrink-0">{item.time}</span>
                            <p className="flex-1 text-xs text-foreground">{item.title}</p>
                            <PixelPortrait skin={item.skin} hair={item.hair} eyes="#1A1A2E" shirt={item.shirt} hairStyle={item.hs} size="sm" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Availability Strip">
                <div className="max-w-2xl space-y-3">
                  {[
                    { agent: "Porter", blocks: [
                      { start: 0, end: 2, type: "free" }, { start: 2, end: 5, type: "busy" },
                      { start: 5, end: 7, type: "free" }, { start: 7, end: 9, type: "busy" },
                      { start: 9, end: 11, type: "free" }, { start: 11, end: 12, type: "blocked" },
                    ]},
                    { agent: "Maya", blocks: [
                      { start: 0, end: 3, type: "busy" }, { start: 3, end: 6, type: "free" },
                      { start: 6, end: 8, type: "busy" }, { start: 8, end: 10, type: "free" },
                      { start: 10, end: 12, type: "blocked" },
                    ]},
                    { agent: "Dev", blocks: [
                      { start: 0, end: 1, type: "free" }, { start: 1, end: 4, type: "busy" },
                      { start: 4, end: 5, type: "free" }, { start: 5, end: 10, type: "busy" },
                      { start: 10, end: 12, type: "free" },
                    ]},
                  ].map(row => (
                    <div key={row.agent} className="flex items-center gap-3">
                      <span className="w-14 text-right text-2xs font-medium text-text2 shrink-0">{row.agent}</span>
                      <div className="flex h-6 flex-1 overflow-hidden rounded-md">
                        {row.blocks.map((b, i) => (
                          <div
                            key={i}
                            className={`h-full ${
                              b.type === "busy" ? "bg-accent-porter/60" :
                              b.type === "blocked" ? "bg-danger/40" :
                              "bg-surface border-y border-border/30"
                            }`}
                            style={{ width: `${((b.end - b.start) / 12) * 100}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1 pl-[68px]">
                    {Array.from({ length: 13 }, (_, i) => (
                      <span key={i} className="text-2xs text-text3" style={{ width: `${100/12}%` }}>{8 + i}:00</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 pl-[68px]">
                    <div className="flex items-center gap-1.5"><div className="h-2.5 w-5 rounded-sm bg-accent-porter/60" /><span className="text-2xs text-text3">Busy</span></div>
                    <div className="flex items-center gap-1.5"><div className="h-2.5 w-5 rounded-sm bg-surface border border-border/30" /><span className="text-2xs text-text3">Free</span></div>
                    <div className="flex items-center gap-1.5"><div className="h-2.5 w-5 rounded-sm bg-danger/40" /><span className="text-2xs text-text3">Blocked</span></div>
                  </div>
                </div>
              </Sub>

              <Sub title="Sortable Table">
                <SortableTable />
              </Sub>

              <Sub title="Key-Value Pairs">
                <div className="flex gap-8">
                  {/* Horizontal layout */}
                  <div>
                    <p className="text-2xs text-text3 mb-2">Horizontal</p>
                    <div className="max-w-xs space-y-2">
                      {[
                        { key: "Model", value: "claude-opus" },
                        { key: "Temperature", value: "0.7" },
                        { key: "Max Tokens", value: "4096" },
                        { key: "Status", value: "Active" },
                      ].map(kv => (
                        <div key={kv.key} className="flex items-center justify-between gap-4">
                          <span className="text-xs text-text3 shrink-0">{kv.key}</span>
                          <span className="text-xs font-medium text-foreground">{kv.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Stacked layout */}
                  <div>
                    <p className="text-2xs text-text3 mb-2">Stacked</p>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: "Agent", value: "Maya" },
                        { key: "Role", value: "Designer" },
                        { key: "Tasks", value: "18" },
                        { key: "Uptime", value: "99.9%" },
                      ].map(kv => (
                        <div key={kv.key}>
                          <p className="text-2xs font-semibold uppercase tracking-wide text-text3">{kv.key}</p>
                          <p className="mt-0.5 text-sm font-medium text-foreground">{kv.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Log Viewer">
                <p className="text-xs text-text3 mb-2">Use <code className="text-2xs bg-raised px-1 py-0.5 rounded">LLMTerminal</code> from <code className="text-2xs bg-raised px-1 py-0.5 rounded">~/components/llm-terminal</code>. Dark terminal with traffic lights, live indicator, and streaming cursor on last line. Always fills container height — set h-* or min-h-* on the component.</p>
                <div className="grid grid-cols-2 gap-4 max-w-3xl">
                  <div>
                    <p className="text-2xs text-text3 mb-1">Content height</p>
                    <LLMTerminal
                      title="porter.log"
                      lines={[
                        { _key: 0, text: "[INFO]  Porter v2.0.1 started on port 3001", color: "text-success" },
                        { _key: 1, text: "[INFO]  PostgreSQL connected: localhost:5432/porter", color: "text-success" },
                        { _key: 2, text: "[WARN]  Gemini backend unreachable", color: "text-warning" },
                        { _key: 3, text: "[INFO]  Agent 'maya' spawned for marketing-site", color: "text-success" },
                        { _key: 4, text: "[ERROR] API call failed: 429 Too Many Requests", color: "text-danger" },
                        { _key: 5, text: "[INFO]  Task 'design-homepage' completed in 34.2s", color: "text-success" },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="text-2xs text-text3 mb-1">Fixed height (h-[240px]) — fills container</p>
                    <LLMTerminal
                      title="activity"
                      className="h-[240px]"
                      lines={[
                        { _key: 0, text: "1h ago   Logged in 127.0.0.1", color: "text-success" },
                        { _key: 1, text: "2h ago   Project 'First Mission' created", color: "text-accent-porter" },
                        { _key: 2, text: "NaNd ago Chat session hello", color: "text-chart-2" },
                      ]}
                    />
                  </div>
                </div>
              </Sub>


              <Sub title="Virtual List">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-2 py-0.5">Virtualized</Badge>
                    <span className="text-xs text-text2">Renders 1000+ items efficiently with windowed rendering</span>
                  </div>
                  <p className="text-2xs text-text3">The Sortable Table above supports virtualization for large datasets. Only visible rows are rendered in the DOM, keeping performance smooth regardless of list size.</p>
                </div>
              </Sub>
              <Sub title="File Tree">
                <FileTree />
              </Sub>
            </Section>

          </div>
        </TabsContent>

        {/* ── Feedback: Toasts, Empty States, Errors, Overlays ── */}
        <TabsContent value="feedback">
          <div className="space-y-10">

            {/* ============================================================
                14. FEEDBACK
                ============================================================ */}
            <Section id="feedback" title="Feedback">
              <Sub title="Toasts">
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full border border-border2 bg-surface px-5 py-2 text-sm text-foreground shadow-[var(--shadow-lg)] animate-[slideup_0.2s_ease]">
                    Project created successfully
                  </div>
                  <div className="rounded-full border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-surface px-5 py-2 text-sm text-success shadow-[var(--shadow-lg)]">
                    <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5" />Agent deployed</span>
                  </div>
                  <div className="rounded-full border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-surface px-5 py-2 text-sm text-danger shadow-[var(--shadow-lg)]">
                    <span className="flex items-center gap-2"><X className="h-3.5 w-3.5" />Connection failed</span>
                  </div>
                </div>
              </Sub>

              <Sub title="Empty States">
                <div className="flex gap-6">
                  <div className="flex w-[260px] flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
                    <FolderKanban className="h-10 w-10 text-text3 opacity-25" />
                    <p className="mt-3 text-sm font-medium text-text2">No projects yet</p>
                    <p className="mt-1 text-xs text-text3">Create your first project via chat</p>
                  </div>
                  <div className="flex w-[260px] flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
                    <Bot className="h-10 w-10 text-text3 opacity-25" />
                    <p className="mt-3 text-sm font-medium text-text2">No agents assigned</p>
                    <p className="mt-1 text-xs text-text3">Porter will assign agents when you create a project</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Error States">
                <div className="max-w-md space-y-3">
                  <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5">
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                    <p className="text-sm text-danger">Login failed. Check your credentials.</p>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    <p className="text-sm text-success">Password updated successfully.</p>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <p className="text-sm text-warning">Backend latency is elevated.</p>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-accent-porter/10 px-3 py-2.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-porter" />
                    <p className="text-sm text-accent-porter">New agent template available.</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Loading Spinners">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="flex items-center gap-2 text-text3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border2 border-t-accent-porter" />
                      <span className="text-sm">Loading...</span>
                    </div>
                    <p className="mt-2 text-2xs text-text3">Default spinner</p>
                  </div>
                  <div className="text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-[2.5px] border-border2 border-t-accent-porter" />
                    <p className="mt-2 text-2xs text-text3">Large spinner</p>
                  </div>
                  <div className="text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-accent-porter" />
                    <p className="mt-2 text-2xs text-text3">Icon spinner</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Progress Ring">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="relative">
                      <ProgressRing pct={65} size={56} color="accent-porter" />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">65%</span>
                    </div>
                    <p className="mt-1 text-2xs text-text3">Upload</p>
                  </div>
                  <div className="text-center">
                    <div className="relative">
                      <ProgressRing pct={100} size={56} color="success" />
                      <Check className="absolute inset-0 m-auto h-4 w-4 text-success" />
                    </div>
                    <p className="mt-1 text-2xs text-text3">Complete</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Banner / Alert Bar">
                <div className="max-w-xl space-y-2.5">
                  {[
                    { type: "info", icon: Info, color: "accent-porter", bg: "bg-accent-porter/10", border: "border-accent-porter/20", text: "New version available. Update to v0.35 for improved performance." },
                    { type: "warning", icon: AlertTriangle, color: "warning", bg: "bg-warning/10", border: "border-warning/20", text: "Backend latency elevated. Some operations may be slow." },
                    { type: "error", icon: XCircle, color: "danger", bg: "bg-danger/10", border: "border-danger/20", text: "Database connection lost. Attempting to reconnect..." },
                    { type: "success", icon: CheckCircle2, color: "success", bg: "bg-success/10", border: "border-success/20", text: "All agents deployed successfully. System operational." },
                  ].map(b => (
                    <div key={b.type} className={`flex items-center gap-2.5 rounded-lg border ${b.border} ${b.bg} px-3.5 py-2.5`}>
                      <b.icon className={`h-4 w-4 shrink-0 text-${b.color}`} />
                      <p className={`flex-1 text-xs text-${b.color}`}>{b.text}</p>
                      {b.type === "info" && (
                        <Button size="sm" variant="ghost" className={`h-6 px-2 text-2xs text-${b.color} hover:bg-${b.color}/10`}>Update</Button>
                      )}
                      <button className={`shrink-0 text-${b.color} opacity-60 hover:opacity-100 transition-opacity`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Connection Status">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 border border-border">
                    <div className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-xs font-medium text-success">Connected</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 border border-border">
                    <div className="h-2 w-2 rounded-full bg-warning animate-pulse-badge" />
                    <span className="text-xs font-medium text-warning">Reconnecting...</span>
                    <Loader2 className="h-3 w-3 animate-spin text-warning" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 border border-border">
                    <div className="h-2 w-2 rounded-full bg-danger" />
                    <span className="text-xs font-medium text-danger">Offline</span>
                    <button className="flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-2xs font-medium text-danger hover:bg-danger/20 transition-colors">
                      <RotateCw className="h-3 w-3" />Retry
                    </button>
                  </div>
                </div>
              </Sub>


              <Sub title="Skeleton Full Page">
                <div className="max-w-2xl rounded-lg border border-border bg-background overflow-hidden">
                  {/* Header skeleton */}
                  <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-28 rounded animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                        <div className="h-2 w-16 rounded animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                      </div>
                    </div>
                    <div className="h-7 w-16 rounded-md animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                  </div>
                  <div className="flex">
                    {/* Sidebar skeleton */}
                    <div className="w-[140px] shrink-0 border-r border-border bg-surface p-3 space-y-2">
                      {[80, 60, 70, 50].map((w, i) => (
                        <div key={i} className="h-2.5 rounded animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                    {/* Content skeleton */}
                    <div className="flex-1 p-4 space-y-4">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="rounded-lg border border-border bg-surface p-3 space-y-2">
                          <div className="h-3 w-3/4 rounded animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                          <div className="h-2.5 w-1/2 rounded animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                          <div className="h-2 w-2/3 rounded animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-[var(--shimmer-bar-from)] via-[var(--shimmer-bar-via)] to-[var(--shimmer-bar-from)] bg-[length:200%_100%]" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Confirmation Feedback">
                <p className="text-xs text-text2 mb-3">Success animation: green check scales in with a ring pulse. CSS-only.</p>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-success animate-[confirmation-ring_0.6s_ease-out_forwards]" />
                      <Check className="h-7 w-7 text-success animate-[confirmation-check_0.4s_ease-out_0.2s_both]" />
                    </div>
                    <p className="mt-2 text-2xs text-text3">Task complete</p>
                  </div>
                  <div className="text-center">
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                      <Check className="h-5 w-5 text-success animate-[confirmation-check_0.4s_ease-out_both]" />
                    </div>
                    <p className="mt-2 text-2xs text-text3">Compact</p>
                  </div>
                </div>
              </Sub>
              <Sub title="Error Boundary">
                <div className="max-w-md rounded-xl border border-border bg-surface p-10 text-center">
                  <AlertOctagon className="mx-auto h-12 w-12 text-text3 opacity-30" />
                  <h3 className="mt-4 text-base font-bold text-foreground">Something went wrong</h3>
                  <p className="mt-1.5 text-xs text-text2">An unexpected error occurred while loading this page.</p>
                  <details className="mt-3 text-left">
                    <summary className="cursor-pointer text-2xs text-text3 hover:text-text2 transition-colors">View error details</summary>
                    <pre className="mt-2 rounded-lg bg-[#0D1117] p-3 font-mono text-2xs text-danger overflow-x-auto">
                      TypeError: Cannot read properties of undefined{"\n"}  at AgentDispatch.route (dispatch.ts:142){"\n"}  at async handleRequest (server.ts:89)
                    </pre>
                  </details>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <Button size="sm" className="bg-accent-porter text-white hover:bg-accent-hover">
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Try again
                    </Button>
                    <Button size="sm" variant="ghost" className="text-text2">
                      <Home className="mr-1.5 h-3.5 w-3.5" />Go home
                    </Button>
                  </div>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                15. OVERLAYS
                ============================================================ */}
            <Section id="overlays" title="Overlays">
              <Sub title="Modal / Dialog">
                <div className="flex items-center gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Open Dialog</Button>
                    </DialogTrigger>
                    <DialogContent className="bg-surface border-border">
                      <DialogHeader>
                        <DialogTitle>Create New Agent</DialogTitle>
                        <DialogDescription className="text-text3">
                          Configure a new AI agent for your workspace.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-text2">Agent Name</Label>
                          <Input placeholder="e.g. Maya" className="bg-raised border-border2 text-foreground placeholder:text-text3" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-text2">Role</Label>
                          <Input placeholder="e.g. Designer" className="bg-raised border-border2 text-foreground placeholder:text-text3" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline">Cancel</Button>
                        <Button className="bg-accent-porter text-white hover:bg-accent-hover">Create Agent</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive">Destructive Dialog</Button>
                    </DialogTrigger>
                    <DialogContent className="bg-surface border-border">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-danger" />
                          Delete Agent
                        </DialogTitle>
                        <DialogDescription className="text-text3">
                          This action cannot be undone. All agent data, memory, and conversation history will be permanently deleted.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline">Cancel</Button>
                        <Button variant="destructive"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete Agent</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </Sub>

              <Sub title="Confirmation Dialog">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="border-danger/30 text-danger hover:bg-danger/10">
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete "Maya"
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-surface border-border max-w-sm">
                    <div className="flex flex-col items-center text-center pt-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
                        <AlertTriangle className="h-6 w-6 text-danger" />
                      </div>
                      <DialogTitle className="mt-3">Are you sure?</DialogTitle>
                      <DialogDescription className="mt-1.5 text-text3">
                        Deleting agent "Maya" will remove all her memory, conversation history, and assigned tasks. This cannot be undone.
                      </DialogDescription>
                    </div>
                    <DialogFooter className="mt-4 flex gap-2 sm:justify-center">
                      <Button variant="outline" className="flex-1">Cancel</Button>
                      <Button variant="destructive" className="flex-1">Delete</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </Sub>

              <Sub title="Drawer / Sheet">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline"><PanelRight className="mr-1.5 h-3.5 w-3.5" />Open Sheet</Button>
                  </SheetTrigger>
                  <SheetContent className="bg-surface border-border w-[400px]">
                    <SheetHeader>
                      <SheetTitle>Agent Configuration</SheetTitle>
                      <SheetDescription className="text-text3">
                        Configure Maya's model and behavior settings.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-raised p-3">
                        <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="long" size="md" />
                        <div>
                          <p className="text-sm font-bold text-foreground">Maya</p>
                          <p className="text-xs text-text3">Designer -- Active</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-text2">Primary Model</Label>
                          <ModelCombobox />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-text2">Temperature</Label>
                          <Slider defaultValue={[0.7]} min={0} max={1} step={0.1} />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-text2">Auto-delegate</Label>
                          <Switch defaultChecked />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-text2">Memory enabled</Label>
                          <Switch defaultChecked />
                        </div>
                      </div>
                      <Button className="w-full bg-accent-porter text-white hover:bg-accent-hover mt-4">Save Changes</Button>
                    </div>
                  </SheetContent>
                </Sheet>
              </Sub>

              <Sub title="Context Menu">
                <ContextMenu>
                  <ContextMenuTrigger className="flex h-28 w-64 items-center justify-center rounded-lg border border-dashed border-border2 bg-surface text-xs text-text3 transition-colors hover:border-accent-porter/30 hover:bg-raised">
                    Right-click here
                  </ContextMenuTrigger>
                  <ContextMenuContent className="bg-surface border-border">
                    <ContextMenuItem className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />View</ContextMenuItem>
                    <ContextMenuItem className="text-xs gap-2"><Settings className="h-3.5 w-3.5" />Edit</ContextMenuItem>
                    <ContextMenuItem className="text-xs gap-2"><Copy className="h-3.5 w-3.5" />Duplicate</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-xs gap-2"><FolderKanban className="h-3.5 w-3.5" />Archive</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-xs gap-2 text-danger focus:text-danger"><Trash2 className="h-3.5 w-3.5" />Delete</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </Sub>

              <Sub title="Dropdown Menu">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-surface border-border">
                    <DropdownMenuItem className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />View Details</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs gap-2"><Settings className="h-3.5 w-3.5" />Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs gap-2"><Share2 className="h-3.5 w-3.5" />Share</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs gap-2 text-danger focus:text-danger"><Trash2 className="h-3.5 w-3.5" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Sub>

              <Sub title="Command Palette Showcase">
                <div className="space-y-2">
                  <p className="text-xs text-text2">Full interactive command palette with categories, results, and keyboard navigation.</p>
                  <CommandPaletteDemo />
                  <p className="text-2xs text-text3">Press <kbd className="rounded border border-border bg-raised px-1 py-0.5 font-mono text-2xs">⌘K</kbd> or click the search box above to open.</p>
                </div>
              </Sub>
            </Section>


          </div>
        </TabsContent>

        {/* ── Motion: Animations, Timing ── */}
        <TabsContent value="motion">
          <div className="space-y-10">

            {/* ============================================================
                16. MOTION
                ============================================================ */}
            <Section id="motion" title="Motion">
              <Sub title="Agent Motion">
                <div className="flex items-end gap-10">
                  <div className="text-center">
                    <div className="mx-auto">
                      <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#6366F1" hairStyle="short" size="lg" isAnimated />
                    </div>
                    <p className="mt-2 text-2xs text-text3">pixel-walk</p>
                    <p className="text-2xs text-text3">1.2s steps(2)</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto h-20 w-14 animate-pixel-hero rounded-lg bg-warning/20" />
                    <p className="mt-2 text-2xs text-text3">pixel-hero</p>
                    <p className="text-2xs text-text3">1.8s ease-in-out</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Card Entrances">
                <div className="flex items-end gap-10">
                  <div className="text-center">
                    <div className="mx-auto h-20 w-14 animate-card-deal-in rounded-lg border border-border bg-surface" />
                    <p className="mt-2 text-2xs text-text3">card-deal-in</p>
                    <p className="text-2xs text-text3">0.32s ease</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto h-20 w-14 animate-agent-card-in rounded-lg border border-border bg-surface" />
                    <p className="mt-2 text-2xs text-text3">agent-card-in</p>
                    <p className="text-2xs text-text3">0.25s ease</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Status & Feedback">
                <div className="flex items-end gap-10">
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center justify-center"><div className="h-3 w-3 animate-pulse-badge rounded-full bg-accent-porter" /></div>
                    <p className="mt-2 text-2xs text-text3">pulse-badge</p>
                    <p className="text-2xs text-text3">2s ease-in-out</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="h-1.5 w-1.5 rounded-full bg-text3 animate-[chat-think_1.4s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                    <p className="mt-2 text-2xs text-text3">chat-think</p>
                    <p className="text-2xs text-text3">1.4s staggered</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-border2 border-t-accent-porter" /></div>
                    <p className="mt-2 text-2xs text-text3">spin-loader</p>
                    <p className="text-2xs text-text3">0.7s linear</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Special Effects">
                <div className="flex items-end gap-10">
                  <div className="text-center">
                    <div className="mx-auto h-20 w-14 animate-recall-evolve rounded-lg bg-accent-porter/20" />
                    <p className="mt-2 text-2xs text-text3">recall-evolve</p>
                    <p className="text-2xs text-text3">1.5s (memory evolution)</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center">
                      <div className="rounded-full border border-border2 bg-surface px-4 py-1.5 text-xs text-foreground shadow-[var(--shadow-lg)] animate-[slideup_0.2s_ease]">
                        Toast!
                      </div>
                    </div>
                    <p className="mt-2 text-2xs text-text3">slideup</p>
                    <p className="text-2xs text-text3">0.2s ease (toasts)</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto h-20 w-14 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-lg bg-gradient-to-r from-[var(--shimmer-from)] via-[var(--shimmer-via)] to-[var(--shimmer-from)] bg-[length:200%_100%]" />
                    <p className="mt-2 text-2xs text-text3">shimmer</p>
                    <p className="text-2xs text-text3">1.5s (skeleton loading)</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Heartbeat & Panel">
                <div className="flex items-end gap-10">
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center">
                      <div className="relative h-3 w-32 overflow-hidden rounded-full bg-raised">
                        <div className="absolute h-full w-4 animate-heartbeat-sweep rounded-full bg-accent-porter/60" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xs text-text3">heartbeat-sweep</p>
                    <p className="text-2xs text-text3">1.6s ease-in-out</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center">
                      <div className="h-14 w-14 animate-office-pulse rounded-lg border border-accent-porter/30 bg-surface text-accent-porter" />
                    </div>
                    <p className="mt-2 text-2xs text-text3">office-pulse</p>
                    <p className="text-2xs text-text3">2.5s (desk glow)</p>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto flex h-20 items-center">
                      <div className="h-14 w-14 animate-panel-fade-in rounded-lg border border-border bg-surface" />
                    </div>
                    <p className="mt-2 text-2xs text-text3">panel-fade-in</p>
                    <p className="text-2xs text-text3">0.3s ease</p>
                  </div>
                </div>
              </Sub>

              <Sub title="Full Motion Spec">
                <MotionSpecDemos />
              </Sub>

              <Sub title="Timing Tokens (CSS Custom Properties)">
                <div className="max-w-lg space-y-2">
                  {[
                    { token: "--duration-fast", value: "150ms", desc: "Hover, micro-interactions" },
                    { token: "--duration-normal", value: "250ms", desc: "Page transitions, slides" },
                    { token: "--duration-slow", value: "350ms", desc: "Complex entrances" },
                    { token: "--duration-page", value: "450ms", desc: "Full page transitions" },
                    { token: "--ease-default", value: "cubic-bezier(0.25, 0.1, 0.25, 1.0)", desc: "General purpose" },
                    { token: "--ease-spring", value: "cubic-bezier(0.34, 1.56, 0.64, 1)", desc: "Bouncy, playful" },
                    { token: "--ease-out", value: "cubic-bezier(0, 0, 0.2, 1)", desc: "Entering elements" },
                    { token: "--ease-in", value: "cubic-bezier(0.4, 0, 1, 1)", desc: "Exiting elements" },
                    { token: "--stagger-delay", value: "40ms", desc: "Between list items" },
                  ].map(t => (
                    <div key={t.token} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
                      <code className="text-2xs font-mono text-accent-porter shrink-0 w-[200px]">{t.token}</code>
                      <span className="text-2xs text-text2 flex-1">{t.value}</span>
                      <span className="text-2xs text-text3">{t.desc}</span>
                    </div>
                  ))}
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                15. NOTIFICATIONS
                ============================================================ */}
            <Section id="notifications" title="Notifications">
              <Sub title="Needs Your Attention Carousel">
                <NotificationCarousel />
              </Sub>
            </Section>

          </div>
        </TabsContent>

        {/* ── Screens: Social, Content & Media, Agent Screens, Project Screens, Settings ── */}
        <TabsContent value="screens">
          <div className="space-y-10">

            {/* ============================================================
                16. SOCIAL
                ============================================================ */}
            <Section id="social" title="Social">
              <Sub title="Post Composer">
                <PostComposer />
              </Sub>

              <Sub title="Post Preview Card">
                <div className="max-w-md rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-accent-porter text-sm font-bold text-white">P</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">Porter AI</span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-accent-porter" />
                        <span className="text-xs text-text3">@askporter</span>
                        <span className="text-xs text-text3">- 2h</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-foreground">
                        Just shipped v0.34 with the new design system. Every surface, every animation, every interaction -- built from scratch. The Porter way.
                      </p>
                      <div className="mt-3 h-40 rounded-lg bg-raised border border-border flex items-center justify-center">
                        <Image className="h-8 w-8 text-text3" />
                      </div>
                      <div className="mt-3 flex items-center gap-6">
                        <button className="flex items-center gap-1.5 text-text3 hover:text-accent-porter transition-colors">
                          <MessageCircle className="h-4 w-4" /><span className="text-xs">12</span>
                        </button>
                        <button className="flex items-center gap-1.5 text-text3 hover:text-success transition-colors">
                          <Repeat2 className="h-4 w-4" /><span className="text-xs">45</span>
                        </button>
                        <button className="flex items-center gap-1.5 text-text3 hover:text-danger transition-colors">
                          <Heart className="h-4 w-4" /><span className="text-xs">128</span>
                        </button>
                        <button className="flex items-center gap-1.5 text-text3 hover:text-text2 transition-colors">
                          <BarChart2 className="h-4 w-4" /><span className="text-xs">2.4K</span>
                        </button>
                        <button className="ml-auto text-text3 hover:text-text2 transition-colors">
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Thread Builder">
                <div className="max-w-md space-y-0">
                  {[
                    { num: 1, text: "We built Porter to solve a real problem: managing multiple AI models is chaos." },
                    { num: 2, text: "What if one orchestrator could route, delegate, and compose across any model? That's Porter." },
                    { num: 3, text: "v0.34 is live. Design system, agent teams, project management. Try it at askporter.app" },
                  ].map((post, i, arr) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-accent-porter text-2xs font-bold text-white">P</AvatarFallback>
                        </Avatar>
                        {i < arr.length - 1 && <div className="w-0.5 flex-1 bg-border" />}
                      </div>
                      <div className={`flex-1 ${i < arr.length - 1 ? "pb-4" : ""}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">Porter AI</span>
                          <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">{post.num}/{arr.length}</Badge>
                          <GripVertical className="ml-auto h-3.5 w-3.5 text-text3 cursor-grab" />
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-foreground">{post.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-center pt-2">
                    <button className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-text3 hover:border-accent-porter hover:text-accent-porter transition-colors">
                      <Plus className="h-3 w-3" />Add to thread
                    </button>
                  </div>
                </div>
              </Sub>

              <Sub title="Engagement Metrics Row">
                <div className="flex items-center gap-6 rounded-lg bg-surface px-4 py-2.5">
                  <div className="flex items-center gap-1.5 text-text2">
                    <MessageCircle className="h-4 w-4" /><span className="text-xs font-medium">12</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text2">
                    <Repeat2 className="h-4 w-4" /><span className="text-xs font-medium">45</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text2">
                    <Heart className="h-4 w-4" /><span className="text-xs font-medium">128</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-text2">
                    <Eye className="h-4 w-4" /><span className="text-xs font-medium">2.4K</span>
                  </div>
                </div>
              </Sub>

              <Sub title="Account Badge">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 border border-border">
                    <AtSign className="h-3 w-3 text-text3" />
                    <span className="text-xs font-medium text-foreground">askporter</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-porter" />
                    <div className="h-2 w-2 rounded-full bg-success" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 border border-border">
                    <AtSign className="h-3 w-3 text-text3" />
                    <span className="text-xs font-medium text-foreground">moeworks</span>
                    <div className="h-2 w-2 rounded-full bg-success" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 border border-border">
                    <AtSign className="h-3 w-3 text-text3" />
                    <span className="text-xs font-medium text-text2">unlinked</span>
                    <div className="h-2 w-2 rounded-full bg-text3" />
                  </div>
                </div>
              </Sub>
            </Section>


            {/* ============================================================
                CONTENT & MEDIA
                ============================================================ */}
            <Section id="content-media" title="Content & Media">
              <Sub title="Markdown Renderer">
                <p className="text-xs text-text2 mb-3">Styled markdown output using Porter tokens. All elements rendered with consistent typography.</p>
                <div className="max-w-2xl rounded-lg border border-border bg-surface p-6 space-y-4">
                  <h2 className="text-xl font-bold text-foreground">Getting Started with Porter</h2>
                  <p className="text-sm leading-relaxed text-text2">
                    Porter is an <strong className="font-semibold text-foreground">AI orchestration platform</strong> that manages multiple models to complete complex projects. It supports <em className="italic">any backend</em> and routes intelligently.
                  </p>
                  <h3 className="text-base font-semibold text-foreground">Key Features</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-text2">
                    <li>Multi-model routing with <strong className="text-foreground">intelligent dispatch</strong></li>
                    <li>Agent teams with specialized roles</li>
                    <li>Project management with milestones</li>
                    <li>Memory system for contextual awareness</li>
                  </ul>
                  <h3 className="text-base font-semibold text-foreground">Installation</h3>
                  <ol className="list-decimal pl-5 space-y-1 text-sm text-text2">
                    <li>Clone the repository</li>
                    <li>Install dependencies with <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-accent-porter">npm install</code></li>
                    <li>Run the development server</li>
                  </ol>
                  <div className="rounded-lg bg-[#0D1117] p-4 font-mono text-xs leading-relaxed">
                    <div><span style={{ color: "#7C3AED" }}>$</span> <span style={{ color: "#ABB2BF" }}>git clone https://github.com/porter/porter.git</span></div>
                    <div><span style={{ color: "#7C3AED" }}>$</span> <span style={{ color: "#ABB2BF" }}>cd porter && npm install</span></div>
                    <div><span style={{ color: "#7C3AED" }}>$</span> <span style={{ color: "#ABB2BF" }}>npm run dev</span></div>
                  </div>
                  <blockquote className="border-l-[3px] border-accent-porter pl-4 italic text-sm text-text2">
                    "Porter doesn't replace your models -- it orchestrates them. Think of it as the conductor of your AI orchestra."
                  </blockquote>
                  <p className="text-sm text-text2">
                    For more information, visit the <a href="#" className="text-accent-porter underline hover:text-accent-hover transition-colors">documentation</a> or join the community.
                  </p>
                  <hr className="border-border" />
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-raised">
                          <th className="px-3 py-2 text-left font-semibold text-text2">Feature</th>
                          <th className="px-3 py-2 text-left font-semibold text-text2">Free</th>
                          <th className="px-3 py-2 text-left font-semibold text-text2">Pro</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/30"><td className="px-3 py-1.5 text-foreground">Agents</td><td className="px-3 py-1.5 text-text2">3</td><td className="px-3 py-1.5 text-text2">Unlimited</td></tr>
                        <tr className="border-b border-border/30"><td className="px-3 py-1.5 text-foreground">Projects</td><td className="px-3 py-1.5 text-text2">5</td><td className="px-3 py-1.5 text-text2">Unlimited</td></tr>
                        <tr><td className="px-3 py-1.5 text-foreground">Memory</td><td className="px-3 py-1.5 text-text2">Basic</td><td className="px-3 py-1.5 text-text2">Full V2</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </Sub>

              <Sub title="Streaming Text">
                <StreamingTextDemo />
              </Sub>

              <Sub title="Video Player">
                <p className="text-xs text-text2 mb-3">Porter-styled video player card. Visual demo only.</p>
                <div className="max-w-lg overflow-hidden rounded-xl border border-border bg-surface">
                  {/* Thumbnail area */}
                  <div className="relative h-52 bg-[#0D1117] flex items-center justify-center group cursor-pointer">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
                      <Play className="h-6 w-6 text-white ml-1" />
                    </div>
                    <Badge className="absolute top-3 right-3 bg-black/60 text-white text-2xs px-2 py-0.5 backdrop-blur-sm">4K</Badge>
                    <Badge className="absolute bottom-3 right-3 bg-black/60 text-white text-2xs px-2 py-0.5 backdrop-blur-sm font-mono">2:34</Badge>
                  </div>
                  {/* Controls */}
                  <div className="px-3 py-2 space-y-2">
                    {/* Progress bar */}
                    <div className="relative h-1 w-full rounded-full bg-raised cursor-pointer group/progress">
                      <div className="h-full rounded-full bg-accent-porter transition-all" style={{ width: "35%" }} />
                      <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-accent-porter shadow-sm opacity-0 group-hover/progress:opacity-100 transition-opacity" style={{ left: "35%" }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-text2 hover:bg-raised hover:text-foreground transition-colors">
                          <Play className="h-4 w-4 ml-0.5" />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-text2 hover:bg-raised hover:text-foreground transition-colors">
                          <SkipForward className="h-4 w-4" />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-text2 hover:bg-raised hover:text-foreground transition-colors">
                          <Volume2 className="h-4 w-4" />
                        </button>
                        <span className="text-2xs font-mono text-text3">0:53 / 2:34</span>
                      </div>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md text-text2 hover:bg-raised hover:text-foreground transition-colors">
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Audio Player">
                <p className="text-xs text-text2 mb-3">Compact horizontal audio player with waveform visualization.</p>
                <div className="max-w-md flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                  <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-porter text-white hover:bg-accent-hover transition-colors">
                    <Play className="h-4 w-4 ml-0.5" />
                  </button>
                  {/* Waveform */}
                  <div className="flex-1 flex items-center gap-[2px] h-8">
                    {[30,50,35,70,45,80,55,40,65,75,50,35,60,45,70,55,80,40,50,65,35,45,70,55,40,60,75,50,35,55,45,70].map((h, i) => (
                      <div
                        key={i}
                        className={`w-[3px] rounded-sm transition-all ${i < 12 ? "bg-accent-porter" : "bg-text3/30"}`}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-2xs font-mono text-text2">1:12</span>
                    <span className="text-2xs font-mono text-text3"> / 3:45</span>
                  </div>
                  <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text3 hover:text-text2 hover:bg-raised transition-colors">
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Sub>

              <Sub title="Image Gallery">
                <p className="text-xs text-text2 mb-3">Grid of image thumbnails with lightbox expand on click.</p>
                <div className="grid grid-cols-3 gap-2 max-w-md">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <div key={n} className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-border bg-raised transition-all hover:border-accent-porter/30 hover:shadow-[var(--shadow-sm)]">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Image className="h-8 w-8 text-text3/30" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="h-5 w-5 text-foreground" />
                      </div>
                      <Badge className="absolute bottom-1.5 right-1.5 bg-black/50 text-white text-2xs px-1.5 py-0 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">IMG-{n}</Badge>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Code Block Component">
                <p className="text-xs text-text2 mb-3">Proper code display with line numbers, language badge, and copy button.</p>
                <div className="max-w-2xl overflow-hidden rounded-lg border border-border bg-[#0D1117] relative group">
                  <div className="flex items-center justify-between border-b border-border/30 px-4 py-1.5">
                    <span className="text-2xs text-text3/60 font-mono">agent.ts</span>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-raised/30 text-text3 text-2xs px-1.5 py-0">TypeScript</Badge>
                      <button className="flex items-center gap-1 text-2xs text-text3 hover:text-text2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Copy className="h-3 w-3" />Copy
                      </button>
                    </div>
                  </div>
                  <div className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
                    {[
                      { num: 1, code: <><span style={{ color: "#C678DD" }}>import</span> {"{"} <span style={{ color: "#E06C75" }}>Agent</span>, <span style={{ color: "#E06C75" }}>AgentConfig</span> {"}"} <span style={{ color: "#C678DD" }}>from</span> <span style={{ color: "#98C379" }}>'./types'</span></> },
                      { num: 2, code: <><span style={{ color: "#C678DD" }}>import</span> {"{"} <span style={{ color: "#E06C75" }}>dispatch</span> {"}"} <span style={{ color: "#C678DD" }}>from</span> <span style={{ color: "#98C379" }}>'./porter'</span></> },
                      { num: 3, code: <></> },
                      { num: 4, code: <><span style={{ color: "#C678DD" }}>export</span> <span style={{ color: "#C678DD" }}>class</span> <span style={{ color: "#E5C07B" }}>WorkerAgent</span> <span style={{ color: "#C678DD" }}>implements</span> <span style={{ color: "#E5C07B" }}>Agent</span> {"{"}</> },
                      { num: 5, code: <>  <span style={{ color: "#C678DD" }}>private</span> <span style={{ color: "#E06C75" }}>config</span>: <span style={{ color: "#E5C07B" }}>AgentConfig</span></> },
                      { num: 6, code: <>  <span style={{ color: "#C678DD" }}>private</span> <span style={{ color: "#E06C75" }}>memory</span>: <span style={{ color: "#E5C07B" }}>Map</span>{"<"}<span style={{ color: "#E5C07B" }}>string</span>, <span style={{ color: "#E5C07B" }}>any</span>{">"}</> },
                      { num: 7, code: <></> },
                      { num: 8, code: <>  <span style={{ color: "#C678DD" }}>async</span> <span style={{ color: "#61AFEF" }}>execute</span>(<span style={{ color: "#E06C75" }}>task</span>: <span style={{ color: "#E5C07B" }}>string</span>): <span style={{ color: "#E5C07B" }}>Promise</span>{"<"}<span style={{ color: "#E5C07B" }}>Result</span>{">"} {"{"}</> },
                      { num: 9, code: <>    <span style={{ color: "#C678DD" }}>const</span> <span style={{ color: "#E06C75" }}>result</span> = <span style={{ color: "#C678DD" }}>await</span> <span style={{ color: "#61AFEF" }}>dispatch</span>({"{"}task, agent: <span style={{ color: "#C678DD" }}>this</span>{"}"})</> },
                      { num: 10, code: <>    <span style={{ color: "#C678DD" }}>return</span> result</> },
                    ].map(line => (
                      <div key={line.num} className="flex gap-4 hover:bg-white/[0.03] -mx-4 px-4">
                        <span className="w-6 text-right text-text3/30 select-none shrink-0">{line.num}</span>
                        <span className="text-[#ABB2BF]">{line.code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                AGENT SCREENS
                ============================================================ */}
            <Section id="agent-screens" title="Agent Screens">
              <Sub title="Agent Workspace Layout">
                <p className="text-xs text-text2 mb-3">Complete agent detail view shell: header, tab bar, and content area.</p>
                <div className="max-w-3xl rounded-lg border border-border bg-background overflow-hidden">
                  {/* Agent header */}
                  <div className="flex items-center gap-4 border-b border-border bg-surface px-5 py-4">
                    <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="long" size="lg" isAnimated />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-foreground">Maya</h2>
                        <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0">working</Badge>
                      </div>
                      <p className="text-xs text-text3">Designer -- Specializes in UI/UX, visual identity, and brand systems</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-2xs"><Settings className="mr-1 h-3 w-3" />Config</Button>
                      <Button size="sm" className="bg-accent-porter text-white hover:bg-accent-hover h-7 text-2xs"><Send className="mr-1 h-3 w-3" />Message</Button>
                    </div>
                  </div>
                  {/* Tab bar */}
                  <div className="border-b border-border bg-surface px-5">
                    <div className="flex gap-1 py-1">
                      {["Chat", "Jobs", "Activity", "Concepts"].map((t, i) => (
                        <button key={t} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${i === 0 ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {/* Content area placeholder */}
                  <div className="p-6">
                    <div className="h-32 rounded-lg border border-dashed border-border2 bg-raised/30 flex items-center justify-center text-2xs text-text3">
                      Active tab content renders here
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Agent Config Panel">
                <p className="text-xs text-text2 mb-3">Form layout for agent configuration with Porter-styled controls.</p>
                <div className="max-w-md rounded-lg border border-border bg-surface p-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Primary Model</Label>
                    <ModelCombobox />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Personality</Label>
                    <textarea
                      defaultValue="You are Maya, a detail-oriented designer who creates clean, modern interfaces."
                      rows={3}
                      className="w-full resize-y rounded-lg border border-border2 bg-raised px-3 py-2.5 text-sm text-foreground placeholder:text-text3 focus:border-accent-porter focus:outline-none focus:ring-1 focus:ring-accent-porter"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Focus Area</Label>
                    <Input defaultValue="UI/UX design, visual identity" className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-text2">Communication Style</Label>
                    <div className="flex gap-1 rounded-lg bg-raised p-1">
                      {["Concise", "Detailed", "Technical", "Casual"].map((s, i) => (
                        <button key={s} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${i === 0 ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <Separator className="bg-border" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium text-text2">Memory enabled</Label>
                        <p className="text-2xs text-text3">Agent retains context across sessions</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium text-text2">Auto-delegate</Label>
                        <p className="text-2xs text-text3">Can pass tasks to other agents</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Agent Log Viewer">
                <div className="max-w-2xl overflow-hidden rounded-lg border border-border bg-[#0D1117]">
                  <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <PixelPortrait skin="#FDBCB4" hair="#8B4513" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="long" size="sm" />
                      <span className="text-2xs font-mono text-text3">maya.log</span>
                    </div>
                    <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0 animate-pulse-badge">Live</Badge>
                  </div>
                  <div className="p-3 font-mono text-2xs leading-relaxed space-y-0.5 max-h-[160px] overflow-y-auto">
                    {[
                      { level: "INFO", color: "#22C55E", msg: "Maya assigned to project 'marketing-site'" },
                      { level: "INFO", color: "#22C55E", msg: "Loading design context from memory..." },
                      { level: "INFO", color: "#22C55E", msg: "Using model: claude-opus (design task)" },
                      { level: "DEBUG", color: "#64748B", msg: "Generating homepage wireframe layout" },
                      { level: "INFO", color: "#22C55E", msg: "Wireframe draft complete (3 sections)" },
                      { level: "WARN", color: "#F59E0B", msg: "Hero section exceeds viewport height" },
                      { level: "INFO", color: "#22C55E", msg: "Revised layout: compact hero + CTA" },
                      { level: "INFO", color: "#22C55E", msg: "Design approved, passing to Dev" },
                    ].map((log, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-text3/60 shrink-0">{`14:${String(15 + i).padStart(2, "0")}:${String(i * 11 % 60).padStart(2, "0")}`}</span>
                        <span className="shrink-0 font-bold" style={{ color: log.color }}>[{log.level}]</span>
                        <span className="text-[#ABB2BF]">{log.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Sub>

              <Sub title="Run History">
                <div className="max-w-2xl overflow-hidden rounded-lg border border-border">
                  <div className="border-b border-border bg-surface px-3 py-2">
                    <span className="text-xs font-semibold text-foreground">Recent Runs</span>
                  </div>
                  {[
                    { status: "success", task: "Design homepage layout", duration: "34.2s", tokens: "12,400", time: "2 min ago" },
                    { status: "success", task: "Create navigation component", duration: "18.7s", tokens: "6,200", time: "15 min ago" },
                    { status: "error", task: "Generate responsive grid", duration: "8.1s", tokens: "3,100", time: "1 hr ago" },
                    { status: "success", task: "Update color palette", duration: "5.4s", tokens: "1,800", time: "2 hr ago" },
                    { status: "success", task: "Review brand guidelines", duration: "22.3s", tokens: "9,500", time: "3 hr ago" },
                  ].map((run, i) => (
                    <div key={i} className="flex items-center gap-3 border-b border-border/30 px-3 py-2.5 text-xs transition-colors hover:bg-raised">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${run.status === "success" ? "bg-success" : "bg-danger"}`} />
                      <span className="flex-1 font-medium text-foreground truncate">{run.task}</span>
                      <span className="text-text3 font-mono shrink-0">{run.duration}</span>
                      <span className="text-text3 shrink-0 w-16 text-right">{run.tokens} tok</span>
                      <span className="text-text3 shrink-0 w-16 text-right">{run.time}</span>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Skill Cards">
                <p className="text-xs text-text2 mb-3">Agent capabilities displayed as compact cards with source badges.</p>
                <div className="grid grid-cols-3 gap-2 max-w-md">
                  {[
                    { name: "UI Design", icon: Paintbrush, source: "built-in" },
                    { name: "Prototyping", icon: Layers, source: "built-in" },
                    { name: "CSS Systems", icon: Code2, source: "learned" },
                    { name: "Brand Identity", icon: Palette, source: "built-in" },
                    { name: "Responsive", icon: MonitorSmartphone, source: "assigned" },
                    { name: "Animation", icon: Play, source: "learned" },
                  ].map(skill => (
                    <div key={skill.name} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:bg-raised">
                      <skill.icon className="h-4 w-4 text-accent-porter shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-2xs font-medium text-foreground truncate">{skill.name}</p>
                        <Badge className={`text-2xs px-1 py-0 ${
                          skill.source === "built-in" ? "bg-accent-porter/15 text-accent-porter" :
                          skill.source === "learned" ? "bg-success/15 text-success" :
                          "bg-warning/15 text-warning"
                        }`}>{skill.source}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Agent Creation Wizard">
                <p className="text-xs text-text2 mb-3">Multi-step wizard combining step indicator with form layout.</p>
                <div className="max-w-lg rounded-xl border border-border bg-surface p-6">
                  {/* Step indicator */}
                  <div className="flex items-center gap-0 mb-6">
                    {["Name", "Role", "Model", "Review"].map((step, i) => (
                      <div key={step} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all text-2xs font-bold ${
                            i < 1 ? "border-success bg-success/15 text-success" :
                            i === 1 ? "border-accent-porter bg-accent-porter/15 text-accent-porter" :
                            "border-border2 bg-raised text-text3"
                          }`}>
                            {i < 1 ? <Check className="h-3 w-3" /> : i + 1}
                          </div>
                          <span className={`text-2xs font-medium ${
                            i < 1 ? "text-success" : i === 1 ? "text-accent-porter" : "text-text3"
                          }`}>{step}</span>
                        </div>
                        {i < 3 && <div className={`flex-1 h-0.5 mx-1.5 mt-[-14px] rounded-full ${i < 1 ? "bg-success" : "bg-border"}`} />}
                      </div>
                    ))}
                  </div>
                  {/* Current step form */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-foreground">What role will this agent fill?</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { role: "Designer", desc: "UI/UX, visual", icon: Paintbrush },
                        { role: "Developer", desc: "Code, APIs", icon: Code2 },
                        { role: "Writer", desc: "Content, copy", icon: BookOpen },
                        { role: "Researcher", desc: "Analysis, data", icon: Search },
                      ].map((r, i) => (
                        <button
                          key={r.role}
                          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-all ${
                            i === 0 ? "border-accent-porter/40 bg-accent-porter/10" : "border-border hover:border-border2 hover:bg-raised"
                          }`}
                        >
                          <r.icon className={`h-4 w-4 ${i === 0 ? "text-accent-porter" : "text-text3"}`} />
                          <div>
                            <p className={`text-xs font-bold ${i === 0 ? "text-accent-porter" : "text-foreground"}`}>{r.role}</p>
                            <p className="text-2xs text-text3">{r.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between pt-2">
                      <Button size="sm" variant="outline" className="h-8 text-2xs"><ChevronLeft className="mr-1 h-3 w-3" />Back</Button>
                      <Button size="sm" className="bg-accent-porter text-white hover:bg-accent-hover h-8 text-2xs">Next<ChevronRight className="ml-1 h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                PROJECT SCREENS
                ============================================================ */}
            <Section id="project-screens" title="Project Screens">
              <Sub title="Project Overview Layout">
                <p className="text-xs text-text2 mb-3">Full project detail view with header, progress, and tab navigation.</p>
                <div className="max-w-3xl rounded-lg border border-border bg-background overflow-hidden">
                  {/* Project header */}
                  <div className="border-b border-border bg-surface px-5 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-base font-bold text-foreground">Marketing Site</h2>
                      <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0">website</Badge>
                      <Badge className="bg-success/15 text-success text-2xs px-1.5 py-0">active</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <ProgressBar value={72} color="accent-porter" thin />
                      </div>
                      <span className="text-xs font-medium text-foreground">72%</span>
                    </div>
                  </div>
                  {/* Tab bar */}
                  <div className="border-b border-border">
                    <div className="flex px-5">
                      {["Now", "Plan", "Timeline", "Records"].map((t, i) => (
                        <button key={t} className={`px-4 py-2.5 text-xs font-semibold transition-colors ${i === 0 ? "border-b-2 border-accent-porter text-accent-porter" : "text-text3 hover:text-text2"}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {/* Content area */}
                  <div className="p-6">
                    <div className="h-24 rounded-lg border border-dashed border-border2 bg-raised/30 flex items-center justify-center text-2xs text-text3">
                      Active tab content renders here
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="Kanban Board">
                <p className="text-xs text-text2 mb-3">Three-column board with draggable cards for task management.</p>
                <div className="flex gap-3 max-w-3xl">
                  {[
                    { title: "To Do", color: "text3", cards: [
                      { name: "Write about page copy", assignee: "S", priority: "bg-warning" },
                      { name: "Design contact form", assignee: "M", priority: "bg-accent-porter" },
                    ]},
                    { title: "In Progress", color: "accent-porter", cards: [
                      { name: "Build homepage layout", assignee: "D", priority: "bg-danger" },
                      { name: "Create nav component", assignee: "D", priority: "bg-accent-porter" },
                      { name: "Draft blog post", assignee: "S", priority: "bg-warning" },
                    ]},
                    { title: "Done", color: "success", cards: [
                      { name: "Setup project repo", assignee: "D", priority: "bg-text3" },
                      { name: "Define color palette", assignee: "M", priority: "bg-text3" },
                    ]},
                  ].map(col => (
                    <div key={col.title} className="flex-1 rounded-lg bg-raised/50 p-2">
                      <div className="flex items-center gap-2 px-1 mb-2">
                        <div className={`h-2 w-2 rounded-full bg-${col.color}`} />
                        <span className="text-xs font-semibold text-foreground">{col.title}</span>
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0 rounded-full ml-auto">{col.cards.length}</Badge>
                      </div>
                      <div className="space-y-1.5">
                        {col.cards.map((card, i) => (
                          <div key={i} className="rounded-lg border border-border bg-surface p-2.5 cursor-grab transition-all hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5 active:cursor-grabbing">
                            <p className="text-xs font-medium text-foreground">{card.name}</p>
                            <div className="flex items-center justify-between mt-2">
                              <div className={`h-1.5 w-1.5 rounded-full ${card.priority}`} />
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="bg-accent-porter text-2xs font-bold text-white">{card.assignee}</AvatarFallback>
                              </Avatar>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Deliverables List">
                <div className="max-w-lg space-y-1.5">
                  {[
                    { title: "Homepage wireframe", assignee: "Maya", due: "Mar 15", done: true },
                    { title: "Navigation component", assignee: "Dev", due: "Mar 18", done: true },
                    { title: "Contact form", assignee: "Dev", due: "Mar 20", done: false },
                    { title: "About page copy", assignee: "Sam", due: "Mar 22", done: false },
                    { title: "SEO meta tags", assignee: "Sam", due: "Mar 25", done: false },
                  ].map((d, i) => (
                    <div key={i} className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-raised ${d.done ? "opacity-60" : ""}`}>
                      <Checkbox checked={d.done} className={d.done ? "data-[state=checked]:bg-success data-[state=checked]:border-success" : ""} />
                      <span className={`flex-1 text-xs ${d.done ? "line-through text-text3" : "font-medium text-foreground"}`}>{d.title}</span>
                      <span className="text-2xs text-text3">{d.assignee}</span>
                      <span className="text-2xs text-text3 w-12">{d.due}</span>
                      {d.done && <Check className="h-3 w-3 text-success" />}
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="Milestone Tracker">
                <div className="max-w-lg space-y-1">
                  {[
                    { title: "Project kickoff", date: "Mar 1", done: true },
                    { title: "Design phase complete", date: "Mar 10", done: true },
                    { title: "Development sprint 1", date: "Mar 18", done: false },
                    { title: "QA & testing", date: "Mar 25", done: false },
                    { title: "Production launch", date: "Apr 1", done: false },
                  ].map((m, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-raised">
                      <Checkbox checked={m.done} className={m.done ? "data-[state=checked]:bg-success data-[state=checked]:border-success" : ""} />
                      <span className={`flex-1 text-xs ${m.done ? "text-text3 line-through" : "font-medium text-foreground"}`}>{m.title}</span>
                      <span className={`text-2xs ${m.done ? "text-text3" : "text-text2"}`}>{m.date}</span>
                      {m.done ? (
                        <Badge className="bg-success/15 text-success text-2xs px-1.5 py-0">done</Badge>
                      ) : i === 2 ? (
                        <Badge className="bg-accent-porter/15 text-accent-porter text-2xs px-1.5 py-0">active</Badge>
                      ) : (
                        <Badge className="bg-raised text-text3 text-2xs px-1.5 py-0">upcoming</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </Sub>
            </Section>

            {/* ============================================================
                SETTINGS
                ============================================================ */}
            <Section id="settings" title="Settings">
              <Sub title="Settings Layout">
                <p className="text-xs text-text2 mb-3">Two-panel settings view: navigation on left, content on right.</p>
                <div className="max-w-3xl rounded-lg border border-border bg-background overflow-hidden">
                  <div className="flex">
                    {/* Settings nav */}
                    <div className="w-[180px] shrink-0 border-r border-border bg-surface p-3 space-y-0.5">
                      {[
                        { icon: CircleUser, label: "Profile", active: true },
                        { icon: Users, label: "Workspace", active: false },
                        { icon: Box, label: "Models", active: false },
                        { icon: Link, label: "Connections", active: false },
                        { icon: CreditCard, label: "Billing", active: false },
                      ].map(item => (
                        <button key={item.label} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors ${
                          item.active ? "bg-accent-porter/10 font-medium text-accent-porter" : "text-text2 hover:bg-raised"
                        }`}>
                          <item.icon className="h-3.5 w-3.5" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {/* Settings content */}
                    <div className="flex-1 p-5 space-y-4">
                      <h3 className="text-sm font-bold text-foreground">Profile</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-text2">Display Name</Label>
                          <Input defaultValue="Moe" className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-text2">Email</Label>
                          <Input defaultValue="moe@porter.app" className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" className="bg-accent-porter text-white hover:bg-accent-hover text-2xs">Save Changes</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Sub>

              <Sub title="API Key Input">
                <p className="text-xs text-text2 mb-3">Masked input with reveal toggle and copy button for sensitive credentials.</p>
                <div className="max-w-sm space-y-1.5">
                  <Label className="text-xs font-medium text-text2">OpenAI API Key</Label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Input type="password" defaultValue="sk-proj-abc123def456ghi789" className="bg-raised border-border2 text-foreground pr-10 font-mono text-xs focus-visible:ring-accent-porter" />
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text2 transition-colors">
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                    <Button size="icon" variant="outline" className="shrink-0 h-9 w-9">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-2xs text-text3">Your key is encrypted and never stored in plain text.</p>
                </div>
              </Sub>

              <Sub title="Danger Zone">
                <div className="max-w-lg rounded-lg border-2 border-danger/30 bg-danger/5 p-5">
                  <h4 className="text-sm font-bold text-danger">Danger Zone</h4>
                  <p className="mt-1 text-xs text-text2">Once you delete a workspace, there is no going back. All projects, agents, memories, and data will be permanently removed.</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">Delete Workspace</p>
                      <p className="text-2xs text-text3">Permanently delete "Porter Workspace"</p>
                    </div>
                    <Button size="sm" variant="destructive" className="text-2xs">
                      <Trash2 className="mr-1 h-3 w-3" />Delete Workspace
                    </Button>
                  </div>
                </div>
              </Sub>

              <Sub title="Preference Toggles">
                <div className="max-w-md space-y-0">
                  {[
                    { label: "Notifications", desc: "Receive alerts for agent completions and errors", checked: true },
                    { label: "Dark Mode", desc: "Use dark theme across the application", checked: true },
                    { label: "Auto-delegate", desc: "Porter automatically assigns tasks to agents", checked: true },
                    { label: "Memory enabled", desc: "Agents retain context across sessions", checked: false },
                  ].map((pref, i) => (
                    <div key={pref.label} className={`flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-raised ${i < 3 ? "border-b border-border/30" : ""}`}>
                      <div>
                        <p className="text-xs font-medium text-foreground">{pref.label}</p>
                        <p className="text-2xs text-text3">{pref.desc}</p>
                      </div>
                      <Switch defaultChecked={pref.checked} />
                    </div>
                  ))}
                </div>
              </Sub>
            </Section>
          </div>
        </TabsContent>

        {/* ── Forge: Agent Forge Design System ── */}
        <TabsContent value="forge">
          <div className="space-y-10">
            {/* Forge Palette */}
            <Section id="forge-palette" title="Forge Palette">
              <div className="grid grid-cols-5 gap-3">
                {[
                  { name: "--forge-bg", label: "Background", sample: "var(--forge-bg)" },
                  { name: "--forge-surface", label: "Surface", sample: "var(--forge-surface)" },
                  { name: "--forge-steel", label: "Steel", sample: "var(--forge-steel)" },
                  { name: "--forge-ember", label: "Ember", sample: "var(--forge-ember)" },
                  { name: "--forge-flame", label: "Flame", sample: "var(--forge-flame)" },
                  { name: "--forge-plasma", label: "Plasma", sample: "var(--forge-plasma)" },
                  { name: "--forge-mint", label: "Mint", sample: "var(--forge-mint)" },
                  { name: "--forge-danger", label: "Danger", sample: "var(--forge-danger)" },
                  { name: "--forge-team-marketing", label: "Marketing", sample: "var(--forge-team-marketing)" },
                  { name: "--forge-team-memory", label: "Memory", sample: "var(--forge-team-memory)" },
                ].map(c => (
                  <div key={c.name} className="rounded-lg border border-border overflow-hidden">
                    <div className="h-10" style={{ background: c.sample }} />
                    <div className="px-2 py-1.5 bg-surface">
                      <p className="text-2xs font-bold text-foreground">{c.label}</p>
                      <p className="text-2xs text-text3 font-mono">{c.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Forge Panel */}
            <Section id="forge-panel" title="ForgePanel">
              <div className="flex gap-3 flex-wrap">
                {(["default", "active", "plasma", "mint"] as const).map(v => (
                  <div key={v} className={`forge-panel ${v === "active" ? "forge-panel-active" : ""} ${v === "plasma" ? "border-[rgba(49,195,255,.25)] shadow-[var(--forge-glow-plasma)]" : ""} ${v === "mint" ? "border-[rgba(125,255,179,.25)] shadow-[var(--forge-glow-mint)]" : ""} rounded-xl p-4 w-[160px]`}>
                    <p className="text-xs font-bold text-text">{v}</p>
                    <p className="text-2xs text-text2 mt-1">Frosted glass container</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Model Badges */}
            <Section id="forge-model-badge" title="ModelBadge">
              <div className="flex items-center gap-2">
                <Badge className="text-2xs px-1.5 py-0 h-4 font-medium border-0 bg-[var(--forge-model-claude)]/15 text-[var(--forge-model-claude)]">Claude Opus</Badge>
                <Badge className="text-2xs px-1.5 py-0 h-4 font-medium border-0 bg-[var(--forge-model-gpt)]/15 text-[var(--forge-model-gpt)]">GPT-5.4</Badge>
                <Badge className="text-2xs px-1.5 py-0 h-4 font-medium border-0 bg-[var(--forge-model-gemini)]/15 text-[var(--forge-model-gemini)]">Gemini</Badge>
              </div>
            </Section>

            {/* Status Pulse */}
            <Section id="forge-status-pulse" title="StatusPulse">
              <div className="flex items-center gap-6">
                {(["born", "forging", "ghost", "error", "idle"] as const).map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="relative flex size-2">
                      {(s === "forging" || s === "error") && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-50 ${s === "forging" ? "bg-[var(--forge-ember)]" : "bg-[var(--forge-danger)]"}`} />}
                      <span className={`relative inline-flex size-2 rounded-full ${
                        s === "born" ? "bg-[var(--forge-mint)]" :
                        s === "forging" ? "bg-[var(--forge-ember)]" :
                        s === "ghost" ? "bg-[var(--forge-steel)]" :
                        s === "error" ? "bg-[var(--forge-danger)]" :
                        "bg-text3"
                      }`} />
                    </span>
                    <span className="text-xs text-text2">{s}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Pipeline Progress */}
            <Section id="forge-pipeline-progress" title="PipelineProgress">
              <div className="flex items-center gap-6">
                {[0, 1, 2, 3, 4].map(station => (
                  <div key={station} className="flex items-center gap-1">
                    <span className="text-2xs text-text3 w-14">Station {station}:</span>
                    <div className="flex items-center gap-0.5">
                      {["Q", "W", "T", "O"].map((label, i) => {
                        const done = i < station
                        const active = i === station && station < 4
                        return (
                          <div key={i} className="flex items-center gap-0.5">
                            <div className={`size-4 rounded-full flex items-center justify-center text-2xs font-bold ${
                              done ? "bg-success text-white" : active ? "bg-[var(--forge-ember)] text-white animate-pulse" : "bg-raised text-text3"
                            }`}>
                              {done ? "✓" : label}
                            </div>
                            {i < 3 && <div className={`w-2 h-px ${done ? "bg-success" : "bg-raised"}`} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Animations */}
            <Section id="forge-animations" title="Forge Animations">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { name: "heat-pulse", cls: "animate-forge-heat", desc: "Active station glow" },
                  { name: "ghost-shimmer", cls: "animate-forge-ghost border border-dashed border-[var(--forge-line)]", desc: "Unborn node" },
                  { name: "birth-resolve", cls: "animate-forge-birth", desc: "Portrait materializing" },
                  { name: "stamp-in", cls: "animate-forge-stamp", desc: "Birth stamp landing" },
                ].map(a => (
                  <div key={a.name} className={`rounded-lg p-4 bg-[var(--forge-surface)] border border-[var(--forge-line)] ${a.cls}`}>
                    <p className="text-xs font-bold text-text">{a.name}</p>
                    <p className="text-2xs text-text2 mt-0.5">{a.desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Conveyor */}
            <Section id="forge-conveyor-line" title="ConveyorLine">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-text3">Idle:</span>
                  <svg width={80} height={4}><line x1={0} y1={2} x2={80} y2={2} stroke="var(--forge-line)" strokeWidth={2} /></svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-text3">Active:</span>
                  <svg width={80} height={4}>
                    <line x1={0} y1={2} x2={80} y2={2} stroke="var(--forge-line)" strokeWidth={2} />
                    <line x1={0} y1={2} x2={80} y2={2} stroke="var(--forge-ember)" strokeWidth={2} strokeDasharray="8 12" className="animate-forge-conveyor" style={{ opacity: 0.7 }} />
                  </svg>
                </div>
              </div>
            </Section>

            {/* Component inventory */}
            <Section id="forge-inventory" title="Component Inventory">
              <div className="grid grid-cols-3 gap-2">
                {[
                  "ForgePanel", "StationCard", "ConveyorLine", "OrgNode", "OrgConnector",
                  "StatusPulse", "ModelBadge", "QualityScore", "PipelineProgress",
                  "TextScramble", "BurnRate", "BirthAnimation",
                ].map(name => (
                  <div key={name} className="rounded-lg border border-border bg-surface px-3 py-2">
                    <p className="text-xs font-bold text-foreground">{name}</p>
                    <p className="text-2xs text-text3 font-mono">components/forge/{name.replace(/([A-Z])/g, (m, c, i) => i ? `-${c.toLowerCase()}` : c.toLowerCase())}.tsx</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </TabsContent>

      </Tabs>

    </TooltipProvider>
  )
}
