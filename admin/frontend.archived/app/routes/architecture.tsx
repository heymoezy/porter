import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { ChatPanel } from "~/components/chat-panel"
import { PixelPortrait } from "~/components/pixel-portrait"
import { useChatPanel } from "~/hooks/use-chat-panel"
import { Badge } from "~/components/ui/badge"
import { OrgConnector } from "~/components/org-connector"
import {
  Database, Server, Globe,
  Brain, Zap, Route, Flame, BookOpen,
  CheckCircle, XCircle,
  Cpu, HardDrive, Shield, Cable,
} from "lucide-react"

// ── Shared Components ─────────────────────────────────

function PillarCard({ icon: Icon, name, tagline, color, children }: {
  icon: typeof Server; name: string; tagline: string; color: string; children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border-2 ${color} bg-surface overflow-hidden`}>
      <div className="px-5 py-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color} bg-opacity-10`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">{name}</h3>
          <p className="text-2xs text-text3">{tagline}</p>
        </div>
      </div>
      <div className="px-5 pb-4 text-2xs text-text2 space-y-2">
        {children}
      </div>
    </div>
  )
}

function Connector({ vertical = true }: { vertical?: boolean }) {
  return (
    <div className="flex justify-center">
      <OrgConnector direction={vertical ? "vertical" : "horizontal"} active length={vertical ? 20 : 32} team="product" />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="shrink-0 uppercase tracking-wide text-text3 text-2xs">{title}</span>
        <div className="h-px flex-1 bg-border" />
      </h2>
      {children}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────

interface HealthData {
  status: string; service: string; version: string; db: string
}
interface SystemData {
  memory: { pct: number }; disk: { pct: number }
  cpu: { cores: number; load1m: number }; uptime: number
  sessions: { active: number; concurrent: number }
}

// ── Page ──────────────────────────────────────────────

export default function ArchitecturePage() {
  const chat = useChatPanel()

  const { data: health } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => api<HealthData>("/api/admin/health"),
  })
  const { data: sys } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => api<SystemData>("/api/admin/system"),
  })

  return (
    <div className="flex h-full min-h-0">
      {!chat.expanded && <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-10">

        {/* ── The 3 Pillars ── */}
        <Section title="What is Porter?">
          <p className="text-xs text-text2 text-center max-w-2xl mx-auto">
            You plug in your AI models. Porter figures out which one to use, remembers what happened last time, and keeps everything running when things break. Three moving parts.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <PillarCard icon={Route} name="Bridge" tagline="The hub" color="border-success text-success">
              <p>Every AI model plugs into Porter. A smart router picks which model handles each request based on capability, cost, and health.</p>
              <div className="space-y-1 mt-2 font-mono text-text3">
                <p>5 gateway adapters</p>
                <p>Circuit breakers + fallback chains</p>
                <p>DB-driven routing rules</p>
                <p>Dispatch logging + cost tracking</p>
                <p>Session-aware re-routing</p>
              </div>
            </PillarCard>
            <PillarCard icon={Flame} name="Forge" tagline="The factory" color="border-danger text-danger">
              <p>Create agents from templates, train them on your domain, evolve them with feedback. An agent starts generic and becomes yours.</p>
              <div className="space-y-1 mt-2 font-mono text-text3">
                <p>103 agent templates</p>
                <p>3-station assembly pipeline</p>
                <p>Skills + tools registry</p>
                <p>Unique avatar for each agent</p>
                <p>Feedback-driven evolution</p>
              </div>
            </PillarCard>
            <PillarCard icon={BookOpen} name="Recall" tagline="The shared brain" color="border-accent-porter text-accent-porter">
              <p>Every model and agent reads from and writes to the same memory. Global rules, agent knowledge, project context. Nothing starts cold.</p>
              <div className="space-y-1 mt-2 font-mono text-text3">
                <p>Directives — global operating rules</p>
                <p>Concepts — durable project truths</p>
                <p>Agent notes — per-worker knowledge</p>
                <p>Project notes — per-project state</p>
                <p>Tiered injection (token-budgeted)</p>
              </div>
            </PillarCard>
          </div>
        </Section>

        {/* ── How it works ── */}
        <Section title="How it works">
          <p className="text-xs text-text2 text-center max-w-2xl mx-auto">
            Bridge connects the models. Forge creates the workers. Recall makes them all remember. Here's how they fit together.
          </p>
          <div className="rounded-xl border border-border bg-surface p-6 space-y-4 mt-4">
            {/* Top: what talks to Porter */}
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {[
                { name: "CLI Sessions", icon: Cpu },
                { name: "API Consumers", icon: Cable },
                { name: "Agents", icon: Flame },
              ].map(c => (
                <div key={c.name} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5">
                  <c.icon className="size-3 text-text3" />
                  <span className="text-2xs font-bold text-foreground">{c.name}</span>
                </div>
              ))}
            </div>
            <Connector />

            {/* Middle: Porter with Recall running through everything */}
            <div className="relative rounded-xl border-2 border-success bg-success/5 p-5">
              <div className="text-center mb-3">
                <span className="text-xs font-bold text-success">Porter</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-success/30 bg-surface p-3 text-center">
                  <Route className="h-4 w-4 text-success mx-auto mb-1" />
                  <p className="text-2xs font-bold text-foreground">Bridge</p>
                  <p className="text-2xs text-text3">Routes dispatches</p>
                </div>
                <div className="rounded-lg border border-accent-porter/30 bg-surface p-3 text-center">
                  <BookOpen className="h-4 w-4 text-accent-porter mx-auto mb-1" />
                  <p className="text-2xs font-bold text-foreground">Recall</p>
                  <p className="text-2xs text-text3">Injects memory into every call</p>
                </div>
                <div className="rounded-lg border border-danger/30 bg-surface p-3 text-center">
                  <Flame className="h-4 w-4 text-danger mx-auto mb-1" />
                  <p className="text-2xs font-bold text-foreground">Forge</p>
                  <p className="text-2xs text-text3">Creates workers</p>
                </div>
              </div>
              {/* Recall connecting line */}
              <div className="mt-3 flex items-center justify-center gap-2">
                <div className="h-px flex-1 bg-accent-porter/30" />
                <span className="text-2xs text-accent-porter font-mono">shared memory layer</span>
                <div className="h-px flex-1 bg-accent-porter/30" />
              </div>
            </div>
            <Connector />

            {/* Bottom: gateways */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {[
                { name: "OpenClaw", sub: "GPT-5.4" },
                { name: "Ollama", sub: "Qwen 1.5B" },
                { name: "Claude", sub: "Anthropic" },
                { name: "Codex", sub: "OpenAI" },
                { name: "Gemini", sub: "Google" },
              ].map(gw => (
                <div key={gw.name} className="rounded-lg border border-border bg-background px-3 py-2 text-center">
                  <p className="text-2xs font-bold text-foreground">{gw.name}</p>
                  <p className="text-2xs text-text3">{gw.sub}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              <Database className="size-3 text-success" />
              <span className="text-2xs text-text3">PostgreSQL — single source of truth for all 3 pillars</span>
            </div>
          </div>
        </Section>

        {/* ── Monorepo ── */}
        <Section title="Repository">
          <div className="rounded-xl border border-border bg-surface p-5 font-mono text-2xs leading-[1.8] text-text2">
            <p className="text-success font-bold mb-1">heymoezy/porter <span className="text-text3 font-normal">v{health?.version ?? "..."}</span></p>
            <p className="ml-2">├── <span className="text-warning">backend/</span> <span className="text-text3">Fastify API — Bridge + Forge + Recall + Admin</span></p>
            <p className="ml-2">│   ├── src/services/bridge/ <span className="text-text3">5 gateway adapters</span></p>
            <p className="ml-2">│   ├── src/services/memory-injection.ts <span className="text-text3">Recall pipeline</span></p>
            <p className="ml-2">│   ├── src/routes/v1/ <span className="text-text3">Brain API</span></p>
            <p className="ml-2">│   └── src/routes/admin/ <span className="text-text3">Admin API (87 endpoints)</span></p>
            <p className="ml-2">├── <span className="text-accent-porter">admin/frontend/</span> <span className="text-text3">React 19 control plane (served at /admin/)</span></p>
            <p className="ml-2">├── personas/ <span className="text-text3">Agent definitions</span></p>
            <p className="ml-2">├── src/cli/ <span className="text-text3">porter setup + session hooks</span></p>
            <p className="ml-2">└── tasks/checkpoint.md <span className="text-text3">Shared state (all models)</span></p>
          </div>
        </Section>

        <div className="text-center text-2xs text-text3 pb-4">
          Porter · v{health?.version ?? "..."} · {new Date().toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })}
        </div>
      </div>
      </div>}
      {chat.open ? (
        <ChatPanel
          streamEndpoint="/api/admin/porter/chat"
          context={{ scope: "architecture" }}
          systemContext="You are Porter. Architecture has 3 pillars: Bridge (hub — 5 gateway adapters, smart routing, circuit breakers, fallback chains, dispatch logging), Forge (factory — 103 templates, 3-station pipeline, skills/tools registry, feedback evolution), Recall (shared brain — directives, concepts, agent_notes, project_notes, tiered injection). Single monorepo (heymoezy/porter), one Fastify process on :3001, PostgreSQL SSOT. Business model = API metering. CLI is the product, web is the window."
          placeholder="Ask about the architecture..."
          greeting="Bridge, Forge, Recall. What do you want to know?"
          storageKey="chat_arch"
          {...chat.chatProps}
        />
      ) : (
        <button onClick={chat.reopen} className="shrink-0 w-8 border-l border-border bg-background flex items-center justify-center hover:bg-raised transition-colors" title="Open chat">
          <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="short" size="xs" />
        </button>
      )}
    </div>
  )
}
