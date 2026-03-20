# Architecture Research

**Domain:** AI orchestration platform — SaaS, multi-agent, collaborative
**Researched:** 2026-03-20
**Confidence:** HIGH (based on existing codebase, established migration patterns, verified Fastify ecosystem)

## Standard Architecture

### System Overview — Target State

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (React 19 + Vite)                  │
│  React Query (server state) + Zustand (UI state)                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP / SSE / WS
┌───────────────────────────▼─────────────────────────────────────┐
│              Fastify Backend  :3001  (TypeScript)                │
│  ┌───────────┐ ┌───────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │ Auth/RBAC │ │  Projects │ │  Agents/Jobs │ │  Real-time  │  │
│  │  routes   │ │  routes   │ │   scheduler  │ │  SSE + WS   │  │
│  └─────┬─────┘ └─────┬─────┘ └──────┬───────┘ └──────┬──────┘  │
│        └─────────────┴──────────────┴────────────────┘          │
│                           Drizzle ORM                            │
└───────────────┬────────────────────────────┬────────────────────┘
                │                            │ proxy unimplemented routes
                ▼                            ▼
          porter.db (SQLite)       porter.py :8877 (Python)
          (shared database)        (shrinking monolith)
```

**Migration state at any point in time:** Fastify owns routes it has implemented.
`@fastify/http-proxy` forwards all other routes upstream to `porter.py`.
Both processes share the same `porter.db` SQLite file via WAL mode.
The Python process shrinks; the proxy prefix list grows until porter.py is gone.

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| React frontend | UI rendering, optimistic updates, SSE consumption | React 19, React Query, Zustand |
| Fastify backend | HTTP routing, auth enforcement, business logic | Fastify 5, TypeScript, Drizzle ORM |
| Agent scheduler | Queued + interval-driven agent work | In-process job queue (see below) |
| SSE hub | Push events to connected browsers | `@fastify/sse-v2`, room-keyed Map |
| WebSocket hub | Bidirectional collaborative sessions | `@fastify/websocket`, project rooms |
| porter.py proxy target | Unimplemented routes still served | Python, port 8877 (internal only) |
| porter.db | Shared persistent state | SQLite WAL, single file |
| openclaw gateway | External AI model routing | HTTP proxy at :18789 |

---

## Recommended Project Structure

```
backend/src/
├── index.ts                   # Fastify boot, plugin registration
├── config.ts                  # Runtime config (env vars, data dir)
├── db/
│   ├── client.ts              # Single db instance (better-sqlite3)
│   ├── schema.ts              # Drizzle table definitions (source of truth)
│   └── migrations/            # Drizzle migration files
├── plugins/
│   ├── auth.ts                # Session middleware, auth_check decorator
│   ├── realtime.ts            # SSE hub + WebSocket hub setup
│   └── proxy.ts               # @fastify/http-proxy fallback to porter.py
├── routes/
│   ├── auth.ts                # /login, /logout, /api/me
│   ├── projects.ts            # /api/projects/* (migrate from config JSON)
│   ├── agents.ts              # /api/agents/* , /api/personas/*
│   ├── chat.ts                # /api/chat (AI dispatch, streaming)
│   ├── tasks.ts               # /api/tasks/*
│   ├── files.ts               # /api/files/*
│   ├── admin.ts               # /api/admin/* (platform_admin cap)
│   ├── events.ts              # /api/events (SSE stream)
│   └── connections.ts         # /api/connections/*
├── services/
│   ├── scheduler.ts           # Agent job queue + cron loop
│   ├── ai-router.ts           # Model selection, openclaw dispatch
│   ├── memory.ts              # Memory V2 operations
│   └── chat-actions.ts        # Post-response side-effects
└── types/
    └── index.ts               # Shared TypeScript interfaces
```

### Structure Rationale

- **`plugins/`:** Fastify decorators and hooks registered once, available everywhere. Auth middleware lives here as a `fastify.addHook('onRequest', ...)` so every route inherits it without per-route boilerplate.
- **`routes/`:** One file per domain boundary. Each file is a Fastify plugin registered with a prefix. Mirrors the existing porter.py route surface 1:1, making the proxy handoff clean.
- **`services/`:** Pure business logic with no Fastify coupling. Testable in isolation. Routes call services; services call `db` and `ai-router`.
- **`db/`:** Single `client.ts` exports one `Database` instance. Drizzle wraps it. Nothing else creates connections.

---

## Architectural Patterns

### Pattern 1: Strangler Fig via Proxy Fallback

**What:** Fastify starts as a thin proxy that forwards 100% of traffic to `porter.py`. New routes are implemented in Fastify and removed from the proxy passthrough list. The monolith shrinks route by route.

**When to use:** Always — this is the migration spine. Every new feature goes into Fastify. Every ported feature is deleted from porter.py.

**Trade-offs:** Two processes running simultaneously (adds ~50MB RAM). Both share SQLite — must use WAL mode (already enabled). No big-bang risk; Playwright tests keep passing throughout.

**Implementation:**

```typescript
// plugins/proxy.ts
import proxy from '@fastify/http-proxy';

export default async function proxyPlugin(fastify: FastifyInstance) {
  // Register proxy LAST — after all real routes.
  // Any route not matched by a real handler falls through to porter.py.
  fastify.register(proxy, {
    upstream: 'http://127.0.0.1:8877',
    // Prefix-based exclusions are not needed — Fastify route priority handles it.
    // Real routes registered before this plugin always win.
  });
}
```

**Build order implication:** Proxy plugin must be the last registered plugin in `index.ts`. Every new route file added displaces one route from the proxy.

---

### Pattern 2: Single Shared SQLite Connection (WAL)

**What:** One `better-sqlite3` `Database` instance created at process startup, wrapped by Drizzle, injected via Fastify's `decorate`. No per-request connection creation. WAL journal mode set once.

**When to use:** Required for correctness. Two separate connection pools hitting SQLite WAL simultaneously (Fastify + porter.py) cause lock contention. Minimize Fastify-side connections to one.

**Trade-offs:** SQLite WAL allows concurrent readers + one writer. One writer means Fastify and porter.py will occasionally block each other on writes — acceptable at current load, insufficient at >50 concurrent write requests/second.

**Implementation:**

```typescript
// db/client.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const dbPath = process.env.PORTER_DATA_DIR
  ? path.join(process.env.PORTER_DATA_DIR, 'porter.db')
  : path.join(process.env.HOME!, '.porter', 'porter.db');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 30000');  // 30s, not 5s

export const db = drizzle(sqlite, { schema });
export { sqlite };
```

---

### Pattern 3: In-Process Agent Scheduler

**What:** A `setInterval`-based job runner inside Fastify that picks up pending agent jobs from a `agent_jobs` database table. No external queue (Redis, BullMQ) needed at current scale.

**When to use:** Until Porter has >10 concurrent agent runs. In-process is simpler, shares the same db transaction scope as the rest of Fastify, and avoids operational complexity.

**Trade-offs:** Cannot distribute work across multiple Node processes. Single-process failure drops in-flight jobs. Acceptable for a 2-vCPU VPS with one Porter instance. Add BullMQ when multi-instance is needed.

**Data flow:**

```
User triggers agent work (project creation / scheduled run)
    ↓
INSERT INTO agent_jobs (agent_id, project_id, type, status='pending', payload)
    ↓
scheduler.ts polls every 2s → SELECT WHERE status='pending' LIMIT 5
    ↓
UPDATE status='running' (atomic UPDATE ... RETURNING to prevent double-pickup)
    ↓
ai-router.ts dispatches to openclaw gateway → streams response
    ↓
chat-actions.ts applies side effects (create task, update memory, emit SSE event)
    ↓
UPDATE agent_jobs SET status='complete'
    ↓
SSE hub pushes { event: 'job_complete', agent_id, project_id } to subscribed clients
```

**Schema required:**

```typescript
export const agentJobs = sqliteTable('agent_jobs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  projectId: text('project_id'),
  type: text('type').notNull(),         // 'scheduled' | 'triggered' | 'reactive'
  status: text('status').default('pending'), // pending | running | complete | failed
  payload: text('payload'),             // JSON
  result: text('result'),               // JSON
  error: text('error'),
  createdAt: real('created_at').default(sql`(strftime('%s','now'))`),
  startedAt: real('started_at'),
  completedAt: real('completed_at'),
  retries: integer('retries').default(0),
});
```

---

### Pattern 4: SSE Hub for Real-Time Push

**What:** A `Map<string, Set<SSEConnection>>` keyed by `project_id` (or `user_id` for global notifications). Routes call `sseHub.emit(projectId, event)` after any state change. The SSE endpoint at `/api/events` subscribes the client to relevant rooms.

**When to use:** Agent job progress, memory changes, collaborative cursor presence, background workflow status. All unidirectional server-to-client push uses SSE. Only use WebSocket when the client also needs to send high-frequency data back (e.g., cursor positions in collaborative editing).

**Trade-offs:** SSE is HTTP/1.1 — limited to 6 connections per browser per domain in HTTP/1.1. With HTTP/2 (via reverse proxy like nginx), limit is ~100. For Porter's single-tab-per-project use pattern, SSE is sufficient.

**Implementation sketch:**

```typescript
// plugins/realtime.ts
export const sseHub = new Map<string, Set<(data: string) => void>>();

export function emitToRoom(roomId: string, event: object) {
  const room = sseHub.get(roomId);
  if (!room) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  room.forEach(send => send(payload));
}
```

---

### Pattern 5: Projects Migrated to Database (Not Config JSON)

**What:** Projects are currently stored in `porter_config.json` as a JSON array. This is the most critical data migration: move projects to a `projects` table in SQLite with proper foreign keys to tasks, members, milestones, and artifacts.

**Why critical:** The JSON config is the root cause of slow startup (full parse on load), no query capability, and the fragile dual-state problem (config vs. `project_content` table). This is Phase 1 of the migration.

**Migration approach:**

```
1. Add projects table to Drizzle schema
2. Write one-time migration script: read porter_config.json projects → INSERT
3. Fastify routes for /api/projects/* read from DB (not config)
4. porter.py STILL reads from config initially (dual-write period)
5. Add dual-write: when Fastify mutates a project, also update config JSON
6. After all project routes are in Fastify: remove config JSON project storage
7. porter.py reads projects from DB via shared SQLite connection
```

---

## Data Flow

### Authenticated Request Flow (Fastify routes)

```
Browser → POST /api/projects
    ↓
Fastify onRequest hook (auth.ts plugin)
    → read porter_session cookie
    → SELECT session FROM sessions WHERE token = ?
    → SELECT user FROM users WHERE username = session.username
    → if invalid: 401
    → if valid: request.user = { username, role, caps }
    ↓
Route handler (projects.ts)
    → validate body (TypeBox schema)
    → call service (services/projects.ts)
    ↓
Service
    → db.insert(schema.projects).values(...)
    → emitToRoom(projectId, { event: 'project_updated' })
    ↓
Route handler → reply.send({ ok: true, project })
    ↓
SSE clients subscribed to projectId receive push notification
```

### Agent Execution Flow

```
User creates project
    ↓
Fastify POST /api/projects → INSERT project
    ↓
INSERT agent_jobs (type='project_kickoff', status='pending')
    ↓
scheduler.ts poll (2s interval)
    → SELECT pending jobs WHERE started_at IS NULL LIMIT 5
    → UPDATE status='running', started_at=now WHERE id=? AND status='pending'
    → (atomic: prevents double-pickup)
    ↓
ai-router.ts
    → _smart_route() equivalent: score models, select backend
    → POST http://127.0.0.1:18789/v1/chat/completions (openclaw)
    → stream response tokens
    ↓
chat-actions.ts
    → parse action blocks in response
    → apply side effects: create tasks, update memory, add artifacts
    ↓
emitToRoom(projectId, { event: 'agent_complete', agentId, jobId })
    ↓
Browser SSE stream receives event → React Query invalidates project cache
```

### Proxy Fallback Flow (unimplemented routes)

```
Browser → GET /api/admin/health  (not yet in Fastify)
    ↓
Fastify: no matching route handler
    ↓
@fastify/http-proxy catches unmatched requests
    → forward to http://127.0.0.1:8877/api/admin/health
    → porter.py handles, returns response
    → proxy streams response back to browser
    ↓
Browser receives response (unaware of proxy hop)
```

### Real-Time Collaboration Flow

```
User A opens project → GET /api/events?project_id=abc
    → SSE connection established, added to sseHub["abc"]

User B (collaborator) opens same project
    → SSE connection established, added to sseHub["abc"]

User A sends chat message → POST /api/chat
    → message saved to DB
    → emitToRoom("abc", { event: "chat_message", from: "userA", ... })
    → User B's SSE stream receives event → UI updates without polling
```

---

## Build Order (Dependency-Driven)

The following order is dictated by what depends on what, not by feature priority.

**Phase prerequisite: Infrastructure layer**

All phases depend on this foundation:
1. `db/client.ts` — shared SQLite instance with WAL + 30s timeout
2. `db/schema.ts` — complete schema in Drizzle (add missing tables incrementally)
3. `plugins/auth.ts` — session validation decorator (all routes need this)
4. `plugins/proxy.ts` — fallback to porter.py (must be last registered)
5. `config.ts` — env-var driven config (no hardcoded paths)

**Phase 1: Core domain routes (migrate from config JSON)**

Depends on: infrastructure layer
- `routes/auth.ts` — replaces Python login/logout (session table already in schema)
- `routes/projects.ts` — requires projects DB migration from config JSON
- `routes/tasks.ts` — depends on projects existing in DB

**Phase 2: Agent execution**

Depends on: Phase 1 (projects in DB)
- `db/schema.ts` — add `agent_jobs` table
- `services/scheduler.ts` — poll + dispatch loop
- `services/ai-router.ts` — model selection, openclaw HTTP client
- `services/chat-actions.ts` — side effect processor
- `routes/agents.ts` — agent CRUD, job triggering

**Phase 3: Real-time layer**

Depends on: Phase 2 (jobs emit events)
- `plugins/realtime.ts` — SSE hub Map
- `routes/events.ts` — SSE subscription endpoint
- Frontend: React Query `invalidateQueries` on SSE events (replaces polling)
- Collaborative session membership: `project_members` table, invite flow

**Phase 4: External connections**

Depends on: Phase 1 (projects in DB), Phase 3 (events for sync status)
- `routes/connections.ts` — GitHub, email, calendar OAuth/token flows
- Connection credential storage (encrypted at rest in connections table)

**Phase 5: Memory V2 completion**

Depends on: Phase 2 (agent execution triggers memory writes)
- `services/memory.ts` — directive/concept/episode/signal operations
- Memory injection into agent dispatch context
- Noise filtering (exclude login events, file uploads)

---

## Anti-Patterns

### Anti-Pattern 1: Per-Request Database Connections

**What people do:** Call `new Database(path)` in each route handler or service function, mirroring the Python `_db_conn()` pattern.

**Why it's wrong:** `better-sqlite3` is synchronous. Creating connections is cheap but unnecessary. More critically, multiple `Database` instances hitting the same WAL file can cause `SQLITE_BUSY` under concurrent write load since each instance has its own WAL read lock.

**Do this instead:** Single `Database` instance in `db/client.ts`, decorated onto `fastify` via `fastify.decorate('db', db)`. All routes access `fastify.db`.

---

### Anti-Pattern 2: Migrating Everything Before Shipping

**What people do:** Attempt to port all porter.py routes to Fastify before any user-facing value is delivered.

**Why it's wrong:** porter.py has ~900KB of logic. A full migration takes weeks. The proxy fallback exists precisely to avoid this. New features (agent autonomy, collaborative sessions) can ship in Fastify immediately while legacy routes remain proxied.

**Do this instead:** Migrate routes only when a feature requires rewriting them or when a route is on the critical path for a new feature. Projects, auth, and agents are Phase 1 because agent autonomy depends on them. Admin routes can stay proxied for months.

---

### Anti-Pattern 3: Polling Instead of SSE for Agent Progress

**What people do:** Frontend polls `/api/agents/status?job_id=X` every 2 seconds while waiting for agent work.

**Why it's wrong:** Porter's VPS has 2 vCPU. Polling 10 active browser tabs generates 300 requests/minute of pure overhead. With streaming agent responses, latency perception is worse because users see nothing until the poll fires.

**Do this instead:** SSE push from `sseHub.emit(projectId, ...)` at each job lifecycle event. Frontend subscribes once to `/api/events?project_id=X` and updates React Query cache on event. Zero polling.

---

### Anti-Pattern 4: Shared Mutable State in Module Scope

**What people do:** Replicate porter.py's `_sessions`, `_wf_registry`, `_config` globals as TypeScript module-level `let` variables.

**Why it's wrong:** Module-level state in Node.js is process-global. Impossible to test, prone to race conditions between async route handlers, and makes future multi-process deployment impossible.

**Do this instead:** All state in SQLite. The scheduler's in-memory `Map<jobId, AbortController>` (for cancellation) is the only acceptable runtime state. Everything else persists to DB.

---

### Anti-Pattern 5: Dual-Write Without Coordination Period

**What people do:** Have Fastify write to DB and porter.py continue writing to config JSON independently, without a defined handoff point.

**Why it's wrong:** Creates split-brain: project mutations from Fastify routes don't propagate back to porter.py, which still serves some routes. Data diverges silently.

**Do this instead:** Define an explicit dual-write period for each entity. During dual-write, the Fastify service writes to both DB and config JSON. After porter.py routes for that entity are removed, stop the dual-write. The `projects.ts` service should have `DUAL_WRITE_PROJECTS = true` feature flag that can be disabled once migration is complete.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| openclaw gateway (:18789) | HTTP POST with Bearer token, stream response | Single `ai-router.ts` service owns this. Never call openclaw directly from routes. |
| Ollama (:11434) | HTTP POST /api/generate or /api/chat | Fallback model; use same ai-router abstraction |
| porter.py (:8877) | `@fastify/http-proxy` passthrough | Internal only. Never expose porter.py port externally. |
| GitHub OAuth | OAuth 2.0 code flow, token stored in `connections` table | Per project or per workspace scope |
| WhatsApp (future) | Webhook receiver (Twilio/Meta API) → agent_jobs INSERT | Route webhook to relevant agent via project_id lookup |

### Internal Boundaries

| Boundary | Communication | Rule |
|----------|---------------|------|
| routes/ ↔ services/ | Direct TypeScript function call | Routes own HTTP concerns; services own business logic. No Fastify types in services. |
| services/ ↔ db/ | Drizzle query builder via injected `db` | Services import `db` from `db/client.ts` directly (or receive as param). |
| scheduler ↔ routes | `agent_jobs` table only | Routes insert jobs; scheduler polls. No direct function calls between them. |
| SSE hub ↔ services | `emitToRoom(roomId, event)` function call | Services call emit after state changes. Hub knows nothing about business logic. |
| Fastify ↔ porter.py | HTTP proxy (no shared memory) | They share SQLite but must not share in-memory state or call each other's internal functions. |

---

## Scaling Considerations

| Scale | Architecture State |
|-------|--------------------|
| Current (1-10 users) | Monolith + proxy pattern. SQLite WAL. In-process scheduler. Porter.py doing most work. |
| Near-term (10-100 users) | Fastify owns most routes. Porter.py retired or running minimal surface. In-process scheduler still fine. |
| Medium-term (100-1k users) | Move scheduler to BullMQ + Redis. Extract ai-router to separate process for isolation. PostgreSQL replaces SQLite. |
| Long-term (1k+ users) | Multi-instance Fastify behind nginx. Redis pub/sub for SSE fan-out across instances. Separate agent worker pool. |

### First bottlenecks in order

1. **SQLite write serialization** — concurrent agent runs block each other on writes. Mitigation: in-process scheduler with `LIMIT 5` concurrency cap. Fix: PostgreSQL.
2. **SSE connections per process** — Node.js handles ~10k SSE connections, well above near-term needs.
3. **AI model latency** — streaming helps perception, but openclaw gateway becomes the bottleneck. Mitigation: response streaming, model benchmarking in ai-router.
4. **Memory V2 consolidation** — the Python `_memory_v2_consolidation_pass()` full-table-scan issue carries over to TypeScript unless batching is implemented. Implement batched consolidation from the start.

---

## Migration Strategy — Concrete Sequencing

```
Week 0 (foundation)
    porter.py running on :8877 (unchanged)
    Fastify on :3001 → 100% proxy to :8877
    All 35 Playwright tests pass (proxy is transparent)

Week 1-2 (Phase 1: core routes)
    Fastify implements auth routes → proxy no longer forwards /login, /logout, /api/me
    Projects migrated to DB → Fastify implements /api/projects/*
    Dual-write: Fastify also updates config JSON during transition
    porter.py still serves everything else via proxy

Week 3-4 (Phase 2: agent execution)
    agent_jobs table added to schema
    Scheduler running inside Fastify
    New feature: agent autonomy built natively in Fastify (never in porter.py)

Week 5+ (Phase 3+: real-time, connections, memory)
    SSE hub online → polling replaced
    External connections in Fastify
    Porter.py proxy surface shrinks with each sprint
    Target: porter.py retired when proxy passthrough list reaches zero
```

**Key invariant throughout migration:** The frontend never knows which backend serves a given request. The proxy ensures this. Tests pass throughout.

---

## Sources

- `@fastify/http-proxy` — proxy plugin for strangler fig pattern: https://github.com/fastify/fastify-http-proxy
- Strangler Fig Pattern, AWS Prescriptive Guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html
- Drizzle ORM SQLite documentation: https://orm.drizzle.team/docs/get-started-sqlite
- `@fastify/sse-v2` — SSE support for Fastify: https://github.com/mpetrunic/fastify-sse-v2
- Fastify WebSocket guide: https://betterstack.com/community/guides/scaling-nodejs/fastify-websockets/
- Fastify + Drizzle ORM NX setup reference: https://medium.com/@tomas.gabrs/setting-up-drizzle-orm-with-fastify-in-an-nx-monorepo-fdd34229254c
- AI agent orchestration patterns (Azure): https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns
- Real-time WebSocket collaboration architecture: https://dev.to/hexshift/building-a-multi-room-websocket-chat-server-with-user-presence-in-nodejs-1a3d

---

*Architecture research for: Porter — AI orchestration platform migration (Python monolith → Fastify)*
*Researched: 2026-03-20*
