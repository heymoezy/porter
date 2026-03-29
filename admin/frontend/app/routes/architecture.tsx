import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { ChatPanel } from "~/components/chat-panel"
import { PixelPortrait } from "~/components/pixel-portrait"
import { useChatPanel } from "~/hooks/use-chat-panel"
import { Badge } from "~/components/ui/badge"
import {
  Database, Server, Globe,
  ArrowRight, ArrowDown, Shield,
  Brain, Zap, Route,
  CheckCircle, XCircle,
} from "lucide-react"

// ── Shared Components ─────────────────────────────────

function Node({ icon: Icon, label, sub, color, badge }: {
  icon: typeof Server; label: string; sub: string; color: string; badge?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <span className="text-xs font-bold text-foreground">{label}</span>
      <span className="text-2xs text-text3">{sub}</span>
      {badge && <Badge className="text-2xs px-1.5 py-0 bg-raised text-text3">{badge}</Badge>}
    </div>
  )
}

function Arrow({ direction = "right" }: { direction?: "right" | "down" }) {
  return direction === "down"
    ? <ArrowDown className="h-4 w-4 text-border2 mx-auto" />
    : <ArrowRight className="h-4 w-4 text-border2" />
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

function ApiGroup({ title, color, endpoints }: { title: string; color: string; endpoints: string[] }) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface p-3">
      <p className={`text-2xs font-semibold uppercase tracking-wide ${color} mb-2`}>{title}</p>
      <div className="space-y-0.5">
        {endpoints.map(e => <p key={e} className="font-mono text-2xs text-text2 leading-relaxed">{e}</p>)}
      </div>
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

        {/* ── Live Status ── */}
        {(health || sys) && (
          <div className="flex items-center gap-4 text-2xs">
            {health && (
              <div className="flex items-center gap-1.5">
                {health.db === "connected" ? <CheckCircle className="size-3 text-success" /> : <XCircle className="size-3 text-danger" />}
                <span className="font-bold text-foreground">v{health.version}</span>
                <span className="text-text3">· {health.service} · DB {health.db}</span>
              </div>
            )}
            {sys && (
              <div className="flex items-center gap-3 text-text3">
                <span>CPU {Math.round(sys.cpu.load1m / sys.cpu.cores * 100)}%</span>
                <span>MEM {sys.memory.pct}%</span>
                <span>DSK {sys.disk.pct}%</span>
                <span>Up {Math.floor(sys.uptime / 3600)}h</span>
                <span>{sys.sessions.concurrent} online</span>
              </div>
            )}
          </div>
        )}

        {/* ── Platform Topology ── */}
        <Section title="Platform Topology">
          <div className="rounded-xl border border-border bg-surface p-8 space-y-4">
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <Node icon={Server} label="Porter Brain" sub=":3001" color="border-success text-success bg-success/10" badge="BACKEND" />
              <Arrow />
              <Node icon={Database} label="PostgreSQL 16" sub=":5432/porter" color="border-success text-success bg-success/10" badge="SSOT" />
            </div>
            <Arrow direction="down" />
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <Node icon={Shield} label="Control Plane" sub=":5175" color="border-warning text-warning bg-warning/10" badge="ADMIN" />
            </div>
            <Arrow direction="down" />
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <Node icon={Route} label="Bridge" sub="5 gateways · circuit breakers" color="border-warning text-warning bg-warning/10" />
              <Node icon={Zap} label="AI Router" sub="DB-driven routing · prompt pipeline" color="border-accent-porter text-accent-porter bg-accent-porter/10" />
              <Node icon={Brain} label="Memory V3" sub="directives · concepts · notes" color="border-success text-success bg-success/10" />
              <Node icon={Globe} label="SSE Hub" sub="Real-time events" color="border-chart-2 text-chart-2 bg-chart-2/10" />
            </div>
            <p className="text-center text-2xs text-text3 mt-2">Porter = Brain + Admin. One monorepo, one product. Any future UI is just an API customer.</p>
          </div>
        </Section>

        {/* ── Admin API Surface — 87 endpoints ── */}
        <Section title="Admin API Surface (87 endpoints)">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <ApiGroup title="Health & System" color="text-success" endpoints={[
              "GET /health",
              "GET /health/version",
              "GET /health/logs",
              "GET /health/dashboard",
              "GET /system",
              "POST /diagnostics/report",
              "GET /diagnostics",
              "POST /diagnostics/:id/resolve",
            ]} />
            <ApiGroup title="Users & Customers" color="text-accent-porter" endpoints={[
              "GET /users",
              "GET /users/:username",
              "PUT /users/:username/role",
              "POST /users/:username/purge-sessions",
              "PUT /users/:username/suspend",
              "GET /customers/:u/notes | tasks | tags",
              "POST /customers/:u/notes | tasks | tags",
              "GET /customers/:u/timeline",
              "GET /customers/segments",
              "PATCH /customers/:u/stage",
            ]} />
            <ApiGroup title="Bridge & Gateways" color="text-warning" endpoints={[
              "GET /bridge",
              "GET /bridge/models",
              "GET /bridge/dispatch-log",
              "GET /bridge/costs",
              "GET /bridge/attribution",
              "GET /bridge/agent-stats",
              "POST /bridge/gateways (CRUD)",
              "POST /bridge/routing-rules (CRUD)",
              "POST /bridge/speed-test",
              "POST /bridge/workspace-config",
              "GET /bridge/user-keys",
            ]} />
            <ApiGroup title="Forge Pipeline" color="text-danger" endpoints={[
              "GET /forge",
              "GET /forge/stats | wave-summary",
              "GET /forge/events (SSE)",
              "POST /forge/start | stop | reset",
              "POST /forge/queue",
              "POST /forge/approve-wave",
              "POST /forge/:id/retry",
              "PATCH /forge/settings",
            ]} />
            <ApiGroup title="Agents & Templates" color="text-chart-2" endpoints={[
              "GET /agents",
              "GET /agents/:id",
              "PUT /agents/:id/files/:file",
              "GET /agents/tasks",
              "POST /agents/tasks/:id/execute",
              "GET /templates",
              "GET /templates/:id",
              "GET /templates/stats",
            ]} />
            <ApiGroup title="Skills · Tools · Models" color="text-chart-3" endpoints={[
              "GET /skills",
              "PUT /skills/:persona/:skill/toggle",
              "GET /tools",
              "PUT /tools/:key/toggle",
              "GET /tools/connections",
              "GET /models",
              "GET /models/usage",
              "GET /models/config | flags",
            ]} />
            <ApiGroup title="Email & Billing" color="text-chart-4" endpoints={[
              "GET /email/config",
              "PUT /email/config",
              "GET /email/messages",
              "POST /email/messages",
              "GET /billing/subscriptions",
              "GET /billing/revenue",
              "GET /billing/stats",
            ]} />
            <ApiGroup title="Activity & Settings" color="text-text2" endpoints={[
              "GET /activity",
              "GET /activity/learnings",
              "GET /settings",
              "PUT /settings/:category",
              "POST /settings/test-connection/:p",
              "POST /settings/force-logout",
              "POST /porter/chat (SSE stream)",
            ]} />
          </div>
        </Section>

        {/* ── Data Layer ── */}
        <Section title="Data Layer">
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Database className="h-5 w-5 text-success" />
              <span className="text-xs font-bold text-foreground">PostgreSQL 16</span>
              <span className="text-2xs text-text3">localhost:5432/porter</span>
              <Badge className="bg-success/15 text-success text-2xs px-1.5 py-0">Single Source of Truth</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {[
                { table: "users / sessions", desc: "Auth + RBAC" },
                { table: "projects", desc: "Workspace registry" },
                { table: "personas", desc: "Agent instances" },
                { table: "agent_templates", desc: "103 blueprints" },
                { table: "chats / messages", desc: "Conversations" },
                { table: "contacts", desc: "CRM" },
                { table: "customer_scores", desc: "Health + conversion" },
                { table: "customer_notes / tasks", desc: "Annotations" },
                { table: "concepts / directives", desc: "Memory V3" },
                { table: "agent_notes / project_notes", desc: "Memory V3" },
                { table: "forge_pipeline", desc: "Agent assembly" },
                { table: "skills / agent_skills", desc: "Capabilities" },
                { table: "environment_tools", desc: "Detected tools" },
                { table: "workspace_connections", desc: "Integrations" },
                { table: "bridge_gateways", desc: "AI backends" },
                { table: "bridge_models", desc: "Model catalog" },
                { table: "bridge_dispatch_log", desc: "Routing decisions" },
                { table: "bridge_routing_rules", desc: "Custom rules" },
                { table: "token_usage_daily", desc: "Cost tracking" },
                { table: "error_log", desc: "Diagnostics" },
              ].map(t => (
                <div key={t.table} className="rounded-lg bg-background p-2.5 border border-border/50">
                  <p className="font-mono text-2xs font-bold text-foreground">{t.table}</p>
                  <p className="text-2xs text-text3">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Real-Time ── */}
        <Section title="Real-Time (SSE)">
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-center gap-4 mb-4">
              <Node icon={Zap} label="Brain SSE Hub" sub="/api/events" color="border-accent-porter text-accent-porter bg-accent-porter/10" />
              <Arrow />
              <Node icon={Globe} label="useAdminSSE" sub="React Query invalidation" color="border-success text-success bg-success/10" />
            </div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-text3 mb-2 text-center">Events → Cache Invalidation</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { event: "bridge:health", target: "gateway cards" },
                { event: "bridge:dispatch", target: "dispatch log (prepend)" },
                { event: "bridge:circuit-trip", target: "gateways + alert" },
                { event: "profile:updated", target: "customer detail" },
                { event: "agent:activity", target: "customers list" },
                { event: "agent:status", target: "customers list" },
              ].map(e => (
                <div key={e.event} className="flex items-center gap-1.5 rounded-lg bg-raised px-2 py-1">
                  <span className="font-mono text-2xs text-accent-porter">{e.event}</span>
                  <span className="text-2xs text-text3">→ {e.target}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>


        {/* ── Project Structure ── */}
        <Section title="Monorepo">
          <div className="rounded-xl border border-success/30 bg-surface p-5 font-mono text-2xs leading-[1.8] text-text2">
            <p className="text-success font-bold mb-1">heymoezy/porter <span className="text-text3 font-normal">monorepo · v3.2.0</span></p>
            <p className="ml-2">├── <span className="text-success">backend/</span> <span className="text-text3">Brain API :3001 — Fastify, routes, services, DB</span></p>
            <p className="ml-2">│   ├── src/services/bridge/ <span className="text-text3">5 gateway adapters</span></p>
            <p className="ml-2">│   ├── src/services/memory-injection.ts <span className="text-text3">Memory V3 pipeline</span></p>
            <p className="ml-2">│   └── src/db/ <span className="text-text3">Drizzle ORM, PostgreSQL</span></p>
            <p className="ml-2">├── <span className="text-warning">admin/</span> <span className="text-text3">Control Plane :5175</span></p>
            <p className="ml-2">│   ├── backend/src/routes/ <span className="text-text3">87 admin endpoints</span></p>
            <p className="ml-2">│   └── frontend/app/routes/ <span className="text-text3">18 pages (React 19)</span></p>
            <p className="ml-2">├── personas/ <span className="text-text3">Agent .md files</span></p>
            <p className="ml-2">├── tasks/checkpoint.md <span className="text-text3">Canonical checkpoint (all models)</span></p>
            <p className="ml-2">└── drizzle/ <span className="text-text3">Migrations</span></p>
          </div>
          <p className="text-center text-2xs text-text3">One monorepo, one product · Business model = API metering · Any future UI is a separate API customer</p>
        </Section>

        <div className="text-center text-2xs text-text3 pb-4">
          Porter Platform · v{health?.version ?? "..."} · {new Date().toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })}
        </div>
      </div>
      </div>}
      {chat.open ? (
        <ChatPanel
          streamEndpoint="/api/admin/porter/chat"
          context={{ scope: "architecture" }}
          systemContext="You are Porter. Architecture: Brain (:3001) + Admin (:5175) = two repos, one product. No separate UI repo. PostgreSQL SSOT (52+ tables, Drizzle ORM). Bridge layer: 5 gateway adapters (OpenClaw/GPT-5.4, Ollama/Qwen, Claude CLI, Codex CLI, Gemini CLI), routing engine, circuit breakers, fallback chains, dispatch logging. AI Router: DB-driven routing, system prompt pipeline, memory context injection. Memory V3: directives, concepts, agent_notes, project_notes, tiered injection. 87 admin API endpoints. 4 Bridge agents (Operator/Scout/Analyst/Controller). SSE real-time. Business model = API metering."
          placeholder="Ask about the architecture..."
          greeting="Porter = Brain + Admin. One monorepo, one product. What do you want to know?"
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
