# Porter Migration: Python to Node.js Architecture Research

**Date:** 2026-02-28
**Subject:** Migrating Porter (725KB / 15,000-line single-file Python web app) to a production Node.js stack
**Current state:** ~99 route handlers, embedded HTML/CSS/JS, stdlib-only Python, JSON file storage

---

## 1. Node.js Framework Selection

### Candidates Evaluated

| Framework | SSR | WebSocket | API Routes | Self-Host Story | Maturity |
|-----------|-----|-----------|------------|-----------------|----------|
| **Next.js** | Native (RSC, SSR, SSG) | Via custom server only | App Router `route.ts` | Standalone output + Docker | Highest (68% market share) |
| **Fastify + @fastify/react** | Vite-powered SSR | @fastify/websocket (native) | Schema-validated routes | Direct Node process | High (Fastify), low (@fastify/react) |
| **Remix** | Native (loader/action pattern) | Via custom server | File-based routes | Standard Node server | Moderate (merged with React Router v7) |
| **Express + React** | Manual setup | socket.io or ws | express.Router | Standard Node process | Highest, but stagnant |
| **Hono** | HonoX (JSX SSR) | @hono/node-ws | Web-standard routes | Any runtime | Rising fast, thinner ecosystem |

### Recommendation: **Fastify + React (Vite SSR)**

**Why not Next.js (the obvious pick):**
- Next.js is optimized for Vercel deployment. Self-hosting requires `output: 'standalone'`, but you lose image optimization, edge middleware, ISR caching, and CDN integration out of the box.
- The framework imposes opinions that fight Porter's architecture: Porter is a self-contained single-server app, not a Jamstack site.
- Performance tax: Benchmarks show @fastify/react achieves **271 req/s vs Next.js at 51 req/s** for identical SSR workloads (5x+ faster). For a self-hosted tool, this matters.
- Next.js middleware runs in an edge-lite runtime subset even when self-hosted, limiting what you can do (no native Node APIs in middleware).
- Heavy: A minimal Next.js standalone build pulls 100MB+. Porter should stay lean.

**Why Fastify + React:**
1. **Performance:** Fastify is the fastest mainstream Node.js framework. @fastify/react provides Vite-powered SSR without the Next.js overhead.
2. **WebSocket as first-class:** @fastify/websocket shares the same server instance. No secondary HTTP server. No hacks. You register WebSocket handlers the same way you register routes.
3. **Schema validation built-in:** Fastify uses JSON Schema for request/response validation. Every API route gets runtime type checking for free. This is a huge win for Porter's ~99 endpoints.
4. **Plugin architecture:** Fastify's encapsulated plugin system maps cleanly to Porter's domain modules (files, agents, memory, projects, etc.). Each domain becomes a Fastify plugin with its own routes, hooks, and decorators.
5. **No vendor lock-in:** Runs as a plain Node.js process. Deploy with systemd, Docker, PM2, or anything else. Exactly how Porter runs today.
6. **Mature ecosystem:** 30k+ GitHub stars, used by Microsoft, NASA, Platformatic. The plugin registry covers auth, CORS, rate limiting, static files, multipart uploads, and more.

**Why not the others:**
- **Remix:** Good framework, but its loader/action pattern is page-centric. Porter is API-heavy with a rich SPA frontend. Remix adds friction for API-first architectures.
- **Express:** Technically fine, but it's essentially unmaintained innovation-wise. No schema validation, no TypeScript-first design, middleware ordering is error-prone. Starting fresh on Express in 2026 is choosing legacy.
- **Hono:** Exciting, ultrafast, and portable. But the ecosystem for full-stack SSR (HonoX) is still young. WebSocket support on Node.js via @hono/node-ws works but is less battle-tested than Fastify's. If Porter needed edge/multi-runtime, Hono would be the pick. For a single VPS deployment, Fastify's maturity wins.

---

## 2. Frontend Stack

### UI Framework: **React**

Not because it is the best technically, but because it is the correct strategic choice:

- **Ecosystem depth:** shadcn/ui, Radix primitives, React Aria, thousands of components. Svelte and Vue ecosystems are 10-20x smaller for component libraries.
- **Hiring and contribution:** If Porter ever becomes open-source or needs contributors, React developers are 5x more available than Svelte developers.
- **SSR tooling:** @fastify/react, Vite's React SSR, and the entire React server ecosystem are mature. Svelte SSR (SvelteKit) is excellent but locks you into SvelteKit's opinions.
- **AI tooling:** Every code-generation AI (Claude, Copilot, Cursor) produces better React code than Svelte or Vue due to training data volume.
- **Bundle size concern is overblown:** Svelte produces 87KB bundles vs React's 487KB, but with code splitting and lazy loading, real-world differences shrink. Porter is a self-hosted tool, not a public website chasing Core Web Vitals.

**Note on Svelte:** If this were a greenfield project with a single developer who knew Svelte, I would pick Svelte. The DX is genuinely better. But for Porter's trajectory (potential open-source, team contributions, ecosystem needs), React is the pragmatic call.

### CSS: **Tailwind CSS v4**

- **v4 performance:** Full rebuilds under 100ms (Rust engine). Incremental builds in single-digit ms. Zero config needed for content detection.
- **CSS-native config:** Theme configuration moves to `@theme` directives in CSS. No JavaScript config file. Simpler mental model.
- **Component extraction:** Use `cn()` helper (from `clsx` + `tailwind-merge`) for conditional classes. Extract repeated patterns into React components, not CSS classes.
- **vs. current inline CSS:** Porter's current embedded CSS is ~2,000+ lines of hand-written CSS mixed into Python string literals. Tailwind eliminates the need for a separate CSS file structure while providing design-system consistency via tokens.
- **Design tokens:** Define all of Porter's colors, spacing, and typography as Tailwind theme tokens. Light/dark mode via CSS variables + `dark:` variants.

### Component Library: **shadcn/ui**

- **Not a dependency:** Components are copied into your project. You own the code. No version conflicts, no breaking updates.
- **Built on Radix primitives:** Accessible by default (keyboard nav, ARIA attributes, focus management).
- **Tailwind-styled:** Components use Tailwind classes. Consistent with the rest of the stack.
- **Base UI option:** As of December 2025, shadcn/ui supports both Radix and Base UI (from the MUI team) as underlying primitive libraries. Radix's future is uncertain after the WorkOS acquisition, so having Base UI as a fallback is valuable.
- **What you get for free:** Dialog, Dropdown, Command palette, Tabs, Toast, Table, Form, Sheet (slide-over panel), and ~40 more production-ready components. This covers 80%+ of Porter's UI needs immediately.

### State Management: **Zustand + TanStack Query**

- **Zustand** for client-side UI state (active panel, selected files, sidebar state, preferences). Tiny (1KB), no boilerplate, no providers. Works with React 19.
- **TanStack Query (React Query)** for server state (API data fetching, caching, invalidation, optimistic updates). This replaces the current pattern of `fetch()` + manual state updates in Porter's JS.
- **Why not Redux:** Overkill. Porter doesn't need time-travel debugging or normalized stores. Zustand + TanStack Query is the standard lightweight combo in 2025-2026.
- **Why not Jotai/Valtio/Signals:** All fine, but Zustand has the largest ecosystem and mindshare for this use case.

---

## 3. Database

### Recommendation: **SQLite via better-sqlite3 for V1, with Drizzle ORM**

#### Why SQLite:

1. **Porter's current storage is JSON files.** SQLite is the natural next step: still a single file, still zero-config, but with proper querying, indexing, transactions, and concurrent read safety.
2. **No separate process:** No PostgreSQL daemon to install, configure, backup, or restart. The database is a file in `PORTER_DATA_DIR`.
3. **Performance:** better-sqlite3's synchronous API is actually faster for single-server apps than async PostgreSQL drivers because there is no connection pool overhead, no TCP round-trips, and no serialization/deserialization.
4. **Backup:** `cp porter.db porter.db.bak` or use SQLite's online backup API. Dead simple for a self-hosted tool.
5. **Migration path:** If Porter ever needs multi-user/multi-server, Turso/LibSQL is a drop-in replacement for better-sqlite3 (the `@libsql/client` package has a better-sqlite3-compatible API).

#### Why NOT PostgreSQL for V1:

- Porter is explicitly designed as a single-user, self-hosted tool. PostgreSQL adds operational complexity (daemon management, connection strings, auth config) for zero benefit at this scale.
- It violates Porter's core principle: "A first-time Porter user has nothing configured. Porter must work from zero."

#### Why Drizzle ORM (not raw SQL, not Prisma):

- **Code-first schema:** Define tables in TypeScript. No separate schema language.
- **SQL-close:** Drizzle's query builder generates predictable SQL. No magic, no N+1 surprises.
- **Tiny runtime:** ~57KB vs Prisma's 2MB+. Porter should stay lean.
- **SQLite-native:** Drizzle has first-class better-sqlite3 support. Prisma's SQLite support is secondary.
- **Migration tooling:** `drizzle-kit` generates and runs SQL migrations from schema diffs. Type-safe, versioned, auditable.

#### Schema Sketch:

```typescript
// packages/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  avatarPath: text('avatar_path'),
  preferences: text('preferences', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  path: text('path').notNull(),
  writable: integer('writable', { mode: 'boolean' }).default(true),
  sortOrder: integer('sort_order').default(0),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  config: text('config', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  title: text('title').notNull(),
  status: text('status').default('pending'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  path: text('path'),
  details: text('details', { mode: 'json' }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  status: text('status').default('active'),
  metadata: text('metadata', { mode: 'json' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
});

export const memory = sqliteTable('memory', {
  id: text('id').primaryKey(),
  namespace: text('namespace').notNull(),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

#### What Stays as Files:

Not everything belongs in SQLite. Keep these as files:
- **Uploaded files** (obviously)
- **Config files** (`porter_config.json`) — config should be human-editable
- **Runtime state** (PID files, lock files)
- **Large blobs** (avatars, exports) — reference by path in SQLite

---

## 4. Project Structure

### Recommended Layout: **pnpm + Turborepo Monorepo**

```
porter/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                  # Root: shared dev deps (biome, typescript)
├── .env.example
├── docker-compose.yml            # Dev environment
├── Dockerfile                    # Production build
│
├── apps/
│   └── server/                   # Fastify backend + SSR
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts          # Entry point: createServer() + listen()
│       │   ├── config.ts         # Env var parsing, defaults, validation
│       │   ├── server.ts         # Fastify instance factory
│       │   │
│       │   ├── plugins/          # Fastify plugins (cross-cutting)
│       │   │   ├── auth.ts       # Session/token auth
│       │   │   ├── cors.ts
│       │   │   ├── static.ts     # Static file serving
│       │   │   └── websocket.ts  # WebSocket setup
│       │   │
│       │   ├── routes/           # API routes by domain
│       │   │   ├── files/
│       │   │   │   ├── index.ts      # Route registration
│       │   │   │   ├── list.ts       # GET /api/files/list
│       │   │   │   ├── upload.ts     # POST /api/files/upload
│       │   │   │   ├── download.ts   # GET /api/files/download
│       │   │   │   ├── delete.ts     # POST /api/files/delete
│       │   │   │   ├── rename.ts     # POST /api/files/rename
│       │   │   │   ├── mkdir.ts      # POST /api/files/mkdir
│       │   │   │   ├── move.ts       # POST /api/files/move
│       │   │   │   ├── copy.ts       # POST /api/files/copy
│       │   │   │   ├── write.ts      # POST /api/files/write
│       │   │   │   ├── zip.ts        # POST /api/files/zip
│       │   │   │   └── search.ts     # GET /api/files/search
│       │   │   │
│       │   │   ├── auth/
│       │   │   │   ├── index.ts
│       │   │   │   ├── login.ts
│       │   │   │   ├── logout.ts
│       │   │   │   ├── profile.ts
│       │   │   │   └── password.ts
│       │   │   │
│       │   │   ├── projects/
│       │   │   │   ├── index.ts
│       │   │   │   ├── list.ts
│       │   │   │   ├── dashboard.ts
│       │   │   │   └── tasks.ts
│       │   │   │
│       │   │   ├── agents/
│       │   │   │   ├── index.ts
│       │   │   │   ├── fleet.ts
│       │   │   │   ├── workspace.ts
│       │   │   │   ├── sessions.ts
│       │   │   │   └── usage.ts
│       │   │   │
│       │   │   ├── memory/
│       │   │   │   ├── index.ts
│       │   │   │   ├── overview.ts
│       │   │   │   ├── search.ts
│       │   │   │   ├── upsert.ts
│       │   │   │   └── pointer.ts
│       │   │   │
│       │   │   ├── integrations/
│       │   │   │   ├── index.ts
│       │   │   │   ├── openclaw.ts
│       │   │   │   ├── ollama.ts
│       │   │   │   └── tailscale.ts
│       │   │   │
│       │   │   ├── system/
│       │   │   │   ├── index.ts
│       │   │   │   ├── config.ts
│       │   │   │   ├── capabilities.ts
│       │   │   │   ├── locations.ts
│       │   │   │   ├── diskinfo.ts
│       │   │   │   ├── metrics.ts
│       │   │   │   └── audit.ts
│       │   │   │
│       │   │   └── runtime/
│       │   │       ├── index.ts
│       │   │       ├── checkpoint.ts
│       │   │       ├── heartbeat.ts
│       │   │       └── recover.ts
│       │   │
│       │   ├── services/          # Business logic (framework-independent)
│       │   │   ├── file-manager.ts
│       │   │   ├── auth-service.ts
│       │   │   ├── project-service.ts
│       │   │   ├── agent-service.ts
│       │   │   ├── memory-service.ts
│       │   │   ├── capability-detector.ts
│       │   │   ├── config-manager.ts
│       │   │   └── audit-logger.ts
│       │   │
│       │   ├── lib/               # Utilities
│       │   │   ├── safe-resolve.ts  # Path traversal prevention
│       │   │   ├── permissions.ts   # File ownership/writable checks
│       │   │   ├── mime.ts
│       │   │   └── errors.ts        # Custom error classes
│       │   │
│       │   └── ssr/               # Server-side rendering entry
│       │       ├── entry-server.tsx
│       │       └── template.html
│       │
│       └── test/
│           ├── routes/
│           ├── services/
│           └── helpers/
│
├── apps/
│   └── web/                       # React frontend (Vite client build)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx           # Client entry
│           ├── App.tsx
│           ├── router.tsx         # Client-side routing
│           │
│           ├── components/        # Shared UI components
│           │   ├── ui/            # shadcn/ui components (copied in)
│           │   │   ├── button.tsx
│           │   │   ├── dialog.tsx
│           │   │   ├── dropdown-menu.tsx
│           │   │   ├── input.tsx
│           │   │   ├── table.tsx
│           │   │   ├── tabs.tsx
│           │   │   ├── toast.tsx
│           │   │   └── ...
│           │   ├── layout/
│           │   │   ├── sidebar.tsx
│           │   │   ├── header.tsx
│           │   │   └── main-layout.tsx
│           │   └── common/
│           │       ├── file-icon.tsx
│           │       ├── status-badge.tsx
│           │       └── loading-spinner.tsx
│           │
│           ├── features/          # Feature modules (page-level)
│           │   ├── files/
│           │   │   ├── file-browser.tsx
│           │   │   ├── file-list.tsx
│           │   │   ├── file-upload.tsx
│           │   │   ├── file-preview.tsx
│           │   │   └── hooks/
│           │   │       ├── use-files.ts
│           │   │       └── use-file-actions.ts
│           │   │
│           │   ├── projects/
│           │   │   ├── project-list.tsx
│           │   │   ├── project-detail.tsx
│           │   │   ├── task-board.tsx
│           │   │   └── hooks/
│           │   │       └── use-projects.ts
│           │   │
│           │   ├── agents/
│           │   │   ├── agent-fleet.tsx
│           │   │   ├── agent-workspace.tsx
│           │   │   └── hooks/
│           │   │       └── use-agents.ts
│           │   │
│           │   ├── orchestration/
│           │   │   ├── integrations.tsx
│           │   │   ├── capabilities.tsx
│           │   │   └── ai-providers.tsx
│           │   │
│           │   ├── workflows/
│           │   │   ├── skills-browser.tsx
│           │   │   ├── automations.tsx
│           │   │   └── cron-viewer.tsx
│           │   │
│           │   ├── memory/
│           │   │   └── memory-explorer.tsx
│           │   │
│           │   └── settings/
│           │       ├── locations.tsx
│           │       ├── preferences.tsx
│           │       └── profile.tsx
│           │
│           ├── stores/            # Zustand stores
│           │   ├── ui-store.ts
│           │   ├── auth-store.ts
│           │   └── preferences-store.ts
│           │
│           ├── hooks/             # Global hooks
│           │   ├── use-websocket.ts
│           │   └── use-keyboard-shortcuts.ts
│           │
│           ├── lib/               # Client utilities
│           │   ├── api-client.ts  # Typed fetch wrapper
│           │   ├── cn.ts          # tailwind-merge + clsx
│           │   └── constants.ts
│           │
│           └── styles/
│               └── globals.css    # Tailwind @theme + base styles
│
├── packages/
│   ├── db/                        # Database schema + migrations
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── schema.ts         # Drizzle table definitions
│   │   │   ├── client.ts         # Database connection factory
│   │   │   └── migrations/       # SQL migration files
│   │   └── drizzle.config.ts
│   │
│   ├── shared/                    # Shared types + validation
│   │   ├── package.json
│   │   └── src/
│   │       ├── types/            # TypeScript interfaces
│   │       │   ├── files.ts
│   │       │   ├── projects.ts
│   │       │   ├── agents.ts
│   │       │   └── api.ts        # API request/response types
│   │       ├── schemas/          # Zod validation schemas
│   │       │   ├── files.ts
│   │       │   ├── projects.ts
│   │       │   └── config.ts
│   │       └── constants.ts
│   │
│   └── config/                    # Shared tooling config
│       ├── typescript/
│       │   └── base.json
│       ├── biome/
│       │   └── biome.json
│       └── tailwind/
│           └── preset.ts
│
└── scripts/
    ├── migrate.ts                 # Run database migrations
    ├── seed.ts                    # Seed development data
    └── import-json.ts             # One-time: import existing JSON data to SQLite
```

### Key Architecture Decisions in This Layout:

1. **`apps/server/src/routes/`** — One folder per domain. Each folder has an `index.ts` that registers all routes for that domain as a Fastify plugin. This replaces the 99-branch `if/elif` chain in the current `do_GET`/`do_POST` handlers.

2. **`apps/server/src/services/`** — Business logic is framework-independent. Services accept typed inputs, return typed outputs. Routes are thin: parse request, call service, format response. This makes testing trivial and enables future framework swaps.

3. **`apps/web/src/features/`** — Feature-based organization, not file-type-based. Everything related to "files" (components, hooks, types) lives in `features/files/`. This scales better than `components/`, `hooks/`, `types/` folders.

4. **`packages/shared/`** — API types and Zod schemas are shared between server and client. Change a type in one place, TypeScript catches mismatches everywhere. This is the biggest DX win of a monorepo.

5. **`packages/db/`** — Database is a separate package. The server imports it. This keeps the door open for a future CLI tool, migration script, or worker process that also needs DB access.

### Config and Environment Management:

```typescript
// apps/server/src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8877),
  HOST: z.string().default('127.0.0.1'),
  PORTER_DATA_DIR: z.string().optional(),
  PORTER_PUBLIC_IP: z.string().optional(),
  PORTER_SESSION_SECRET: z.string().min(32),
  PORTER_OPENCLAW_URL: z.string().url().optional(),
  PORTER_OPENCLAW_TOKEN: z.string().optional(),
  PORTER_OLLAMA_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten());
    process.exit(1);
  }
  return result.data;
}
```

Use a `.env` file for development (loaded by Vite automatically). For production, use systemd `Environment=` directives or a `.env.production` file. Never commit secrets.

---

## 5. Migration Strategy

### Total Effort Estimate: **6-8 weeks** (one developer, focused)

This is NOT a line-by-line port. Porter's Python code is 80% embedded HTML/CSS/JS string literals and request-routing boilerplate. The actual business logic is perhaps 3,000-4,000 lines of Python. The rest evaporates when you use proper frameworks.

### Phase 0: Foundation (Week 1)

**Goal:** Bootable monorepo with a working Fastify server and React hello-world SSR.

Tasks:
- [ ] Initialize pnpm workspace + Turborepo
- [ ] Set up `apps/server` with Fastify + TypeScript
- [ ] Set up `apps/web` with Vite + React + Tailwind
- [ ] Set up `packages/db` with Drizzle + better-sqlite3
- [ ] Set up `packages/shared` with Zod schemas
- [ ] Configure Biome for linting/formatting
- [ ] Create Dockerfile for development
- [ ] Wire up SSR: Fastify serves the React app
- [ ] Verify: `pnpm dev` starts both server and client with HMR

**Deliverable:** `http://localhost:8877` shows a React page served by Fastify.

### Phase 1: Core API (Week 2-3)

**Goal:** Port all API routes. This is the critical path.

Migrate routes in dependency order:

**Batch 1 — Auth + Config (foundation):**
- `/login`, `/logout`, `/api/me`
- `/api/config/summary`, `/api/preferences`
- `/api/capabilities`, `/api/tools`
- Session management (cookie-based, same as current)

**Batch 2 — File Operations (core value):**
- `/api/list`, `/api/nodes`, `/api/roots`
- `/api/search`, `/api/diskinfo`
- `/download`, `/upload`
- `/api/delete`, `/api/rename`, `/api/mkdir`, `/api/move`, `/api/copy`, `/api/write`, `/api/zip`
- `safe_resolve()` port (critical security function)
- `is_writable()` port

**Batch 3 — Locations + Projects:**
- `/api/locations` (CRUD)
- `/api/projects`, `/api/projects-dashboard`
- `/api/task-registry`
- `/api/schedules`, `/api/schedule-runs`

**Batch 4 — Agent + Orchestration:**
- `/api/agents`, `/api/agent-fleet`
- `/api/agent-workspace/read`, `/api/agent-workspace/write`
- `/api/agent/bootstrap`
- `/runtime/checkpoint`, `/runtime/heartbeat`, `/runtime/finalize`
- `/agent-usage/*`

**Batch 5 — Memory + Integrations:**
- `/memory/*` routes
- `/api/integrations`, `/api/openclaw/*`
- `/api/local-models`, `/api/ai-providers`
- `/api/ssh/probe`, `/api/tailscale/control`

**Batch 6 — System:**
- `/api/audit`
- `/api/overview`
- `/metrics`
- `/api/pep/nodes`, `/pep/v1/fs/*`

**Strategy for each route:**
1. Create Zod schema for request params/body/query in `packages/shared`
2. Create Fastify route handler in appropriate `routes/` folder
3. Extract business logic into `services/` (no `req`/`res` objects in services)
4. Add JSON Schema validation to Fastify route definition (auto-generated from Zod via `zod-to-json-schema`)
5. Write at minimum one happy-path test

**What can be semi-automated:**
- Route signatures and paths can be extracted from the Python `elif` chain with a script
- Zod schemas can be drafted by feeding the Python request-parsing code to an LLM
- The `safe_resolve()` function is a direct 1:1 port (path manipulation logic)

**What needs manual rewrite:**
- All HTML template generation (replaced by React components)
- File I/O patterns (Python's `pathlib` to Node's `fs` / `path`)
- The `do_POST` body parsing (replaced by Fastify's built-in parsing)
- Subprocess calls for system detection (rewrite for Node's `child_process`)

### Phase 2: Frontend (Week 3-5, overlapping with Phase 1)

**Goal:** Rebuild the UI in React + Tailwind + shadcn/ui.

Start frontend work as soon as Batch 1 and Batch 2 APIs are done (auth + files). Don't wait for all APIs.

**Page priority:**
1. **Login page** — Simple form, validates against auth API
2. **File browser** — The core screen. File list, breadcrumb nav, upload, download, context menu, preview pane. This is 40% of the frontend work.
3. **Sidebar/navigation** — The 7-tab nav (CC, Orchestration, Extensions, Projects, Workflows, Locations, Files)
4. **Locations manager** — CRUD for mount points
5. **Projects view** — Project list, task board, dashboard
6. **Agents/Fleet view** — Agent status, workspace viewer
7. **Orchestration** — Capabilities, AI providers, integrations
8. **Workflows** — Skills browser, automations/cron
9. **Memory explorer** — Namespace browser, search
10. **Settings** — Profile, preferences, password change

**Component extraction from current Porter:**
The current Porter UI is actually well-structured JavaScript despite being embedded in Python strings. The tab system, file browser, and modal patterns can be studied for behavior requirements, but the code itself should not be ported. Rewrite everything in React idioms.

### Phase 3: Real-time + Polish (Week 5-6)

- WebSocket integration for live file system events
- Toast notifications
- Keyboard shortcuts
- Dark/light mode (via Tailwind `dark:` + CSS variables)
- Loading states, error boundaries, empty states
- Mobile responsive layout

### Phase 4: Data Migration + Testing (Week 6-7)

- Write `scripts/import-json.ts` to migrate existing JSON data to SQLite
- Port the Playwright test suite (32 existing tests) to the new stack
- Add API integration tests with Fastify's `inject()` method (no HTTP server needed)
- Add component tests with Vitest + Testing Library
- End-to-end smoke test: login, browse files, upload, download, create project

### Phase 5: Deployment + Cutover (Week 7-8)

- Update systemd unit to run Node instead of Python
- Create migration guide for existing users
- Verify `PORTER_DATA_DIR`, `PORTER_PORT`, and all env vars work
- Test on a clean machine (the "fresh-start assumption")
- Update documentation
- Tag v1.0.0

### What NOT to Port (cut for V1):

- The PEP (Porter Extension Protocol) v1 filesystem API — redesign from scratch later
- The scheduler daemon — reimplement with proper cron library (node-cron)
- Agent workspace sandbox — rethink security model for Node

### Feature Parity Checklist:

```
Auth & Session
  [ ] Login / logout
  [ ] Session cookies
  [ ] Password change
  [ ] Avatar upload
  [ ] Preferences persistence

File Management
  [ ] Directory listing with metadata
  [ ] File upload (multipart)
  [ ] File download
  [ ] File preview (text, image, PDF, code)
  [ ] Create folder
  [ ] Rename / move / copy / delete
  [ ] Zip download
  [ ] Search (filename, content)
  [ ] Disk usage info
  [ ] Path traversal prevention (safe_resolve)
  [ ] Writability checks

Locations
  [ ] Mount point CRUD
  [ ] Connection testing
  [ ] Sort ordering

Projects
  [ ] Project list / create / edit
  [ ] Task registry
  [ ] Project dashboard with metrics
  [ ] Project file browser

Agents
  [ ] Agent fleet status
  [ ] Agent workspace read/write
  [ ] Agent bootstrap
  [ ] Usage tracking / snapshots
  [ ] Session management

Memory
  [ ] Namespace overview
  [ ] Read / search / upsert
  [ ] Pointer management

Orchestration
  [ ] Capability detection
  [ ] AI provider listing
  [ ] Tool listing
  [ ] Integration status

Workflows
  [ ] OpenClaw skills browser
  [ ] Cron job viewer
  [ ] Session listing

System
  [ ] Audit log
  [ ] System overview
  [ ] Metrics endpoint
  [ ] Config export / reload
  [ ] Runtime recovery
```

---

## 6. Build and Dev Tooling

### Build: **Vite 6 (with Rolldown in Vite 7/8)**

- **For development:** Vite's dev server provides instant HMR for the React frontend. Fastify runs separately with `tsx watch` (TypeScript execution with watch mode).
- **For production:** Vite builds the React app into static assets. Fastify serves them via `@fastify/static`.
- **Why not Turbopack:** Turbopack is Next.js-only. Since we are using Fastify + Vite, Turbopack is not an option. Vite is the standard for non-Next.js projects.
- **Vite 6-7 trajectory:** Vite is replacing both esbuild and Rollup with Rolldown (a unified Rust bundler). This will make production builds significantly faster. The migration is transparent — same config, faster output.

### TypeScript Execution: **tsx**

- `tsx` (by the author of esbuild) runs `.ts` files directly in Node.js with near-zero overhead. Use it for development.
- For production, compile with `tsc` and run the `.js` output directly. No runtime TypeScript overhead.
- **Why not Node.js native `--experimental-strip-types`:** Still experimental as of Node 23. Not recommended for production. Doesn't handle path aliases or decorators. `tsx` is battle-tested.

### Linting + Formatting: **Biome**

- Replaces both ESLint and Prettier with a single tool.
- Written in Rust. Formats and lints in <100ms for most projects.
- Supports TypeScript, JSX, JSON, CSS.
- One config file (`biome.json`) at the monorepo root.
- **Why not ESLint + Prettier:** Two tools, two configs, plugin hell, slower. Biome does everything in one pass. The ecosystem is mature enough in 2026 — major projects (Deno, Rome descendants) use it.

### Testing: **Vitest + Playwright**

- **Vitest** for unit tests and API integration tests. Same config format as Vite. Fastify's `inject()` method means API tests don't need a running server.
- **Playwright** for end-to-end tests. Porter already has 32 Playwright tests — port them to the new stack.
- **Testing Library** for React component tests (via Vitest's jsdom environment).

### Monorepo Orchestration: **Turborepo**

- Manages build order across packages.
- Content-aware caching: if `packages/db` hasn't changed, don't rebuild it.
- Parallel task execution: run linting, type-checking, and testing simultaneously.
- Remote caching (optional): share build caches between CI and local dev.

### Package Manager: **pnpm**

- Strict dependency resolution (no phantom dependencies).
- Efficient disk usage via content-addressable store.
- Native workspace support (`pnpm-workspace.yaml`).
- Faster installs than npm or Yarn.

### Docker (Development):

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./

ENV NODE_ENV=production
ENV PORT=8877
EXPOSE 8877
CMD ["node", "dist/index.js"]
```

### Dev Script (`package.json` root):

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "turbo test",
    "test:e2e": "playwright test",
    "db:migrate": "tsx packages/db/src/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "typecheck": "turbo typecheck"
  }
}
```

---

## 7. Summary of Concrete Recommendations

| Decision | Pick | Runner-Up |
|----------|------|-----------|
| **Backend framework** | Fastify | Hono |
| **Frontend framework** | React | Svelte |
| **SSR approach** | @fastify/react (Vite SSR) | Next.js standalone |
| **CSS** | Tailwind CSS v4 | — |
| **Component library** | shadcn/ui (Base UI primitives) | Radix + custom |
| **Client state** | Zustand | Jotai |
| **Server state** | TanStack Query | SWR |
| **Database** | SQLite via better-sqlite3 | Keep JSON files for V1 |
| **ORM** | Drizzle | Prisma (if you want more abstraction) |
| **Build tool** | Vite 6+ | — |
| **Linter/formatter** | Biome | ESLint + Prettier |
| **Test runner** | Vitest + Playwright | Jest + Playwright |
| **TS execution** | tsx (dev), tsc (prod) | Node --experimental-strip-types |
| **Package manager** | pnpm | npm |
| **Monorepo tool** | Turborepo | Nx |
| **WebSocket** | @fastify/websocket (ws) | Socket.IO |
| **Deployment** | systemd + Node process | Docker |

---

## 8. Risk Assessment

### Low Risk:
- **API port:** The route structure is well-defined. Porting 99 endpoints is tedious but not technically risky. Most are simple CRUD.
- **Database migration:** JSON-to-SQLite is straightforward. Write an import script, run it once.
- **Build tooling:** Vite + pnpm + Turborepo is the standard stack. Very well-documented.

### Medium Risk:
- **Frontend fidelity:** The current Porter UI has been refined over 81+ releases. Matching all the polish (keyboard shortcuts, animations, empty states, error handling) will take time. Budget extra for "the last 20%."
- **safe_resolve() security:** The path traversal prevention logic is security-critical. Must be ported carefully with comprehensive tests. Consider using a well-tested library like `path-scurry` or writing a custom implementation with exhaustive test cases.
- **WebSocket reliability:** Moving from a request-response model to WebSocket for real-time features introduces new failure modes (reconnection, backpressure, message ordering). Start simple: use WebSocket only for push notifications, not as the primary API transport.

### High Risk:
- **Scope creep:** The temptation to "improve" things during the migration is extreme. Resist it. Port first, improve later. The goal is feature parity, not feature expansion.
- **Two systems running in parallel:** If you try to run both Python and Node.js versions during migration, you will have to maintain two codebases. Instead, pick a cutover date, accept a brief feature freeze on the Python version, and ship the Node version when it hits parity.

---

## 9. Alternative Path: Keep Python, Extract Frontend

If the 6-8 week timeline is too long, there is a less ambitious but still valuable intermediate step:

1. **Extract all HTML/CSS/JS** from porter.py into a proper Vite + React + Tailwind frontend.
2. **Keep the Python backend** as-is, but clean up the API routes to return JSON only (remove all `text/html` response building).
3. **The Python server becomes a pure API server.** The React frontend talks to it via fetch.
4. **Later**, replace the Python API server with Fastify when ready.

This path takes ~3-4 weeks and gives you 70% of the benefits (modern frontend, component reuse, HMR during development, Tailwind design system) without the backend risk. The remaining 30% (TypeScript backend, proper database, WebSocket) comes in a later phase.

---

## Sources

- [Hono vs Express vs Fastify Architecture Guide](https://levelup.gitconnected.com/hono-vs-express-vs-fastify-the-2025-architecture-guide-for-next-js-5a13f6e12766)
- [Next.js vs Fastify + React Performance Comparison](https://betterstack.com/community/guides/scaling-nodejs/nextjs-vs-fastify-react/)
- [Fastify + React is 7x Faster than Next.js](https://hire.jonasgalvez.com.br/2025/apr/9/fastify-speed/)
- [Beyond Express: Fastify vs Hono](https://dev.to/alex_aslam/beyond-express-fastify-vs-hono-which-wins-for-high-throughput-apis-373i)
- [Hono vs Fastify Comparison](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)
- [Next.js vs Remix 2025](https://strapi.io/blog/next-js-vs-remix-2025-developer-framework-comparison-guide)
- [React UI Libraries 2025 Comparison](https://makersden.io/blog/react-ui-libs-2025-comparing-shadcn-radix-mantine-mui-chakra)
- [Radix UI vs shadcn/ui](https://workos.com/blog/what-is-the-difference-between-radix-and-shadcn-ui)
- [14 Best React UI Component Libraries 2026](https://www.untitledui.com/blog/react-component-libraries)
- [Distributed SQLite: LibSQL and Turso](https://dev.to/dataformathub/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk)
- [SQLite Driver Benchmark](https://sqg.dev/blog/sqlite-driver-benchmark)
- [Drizzle vs Prisma 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Drizzle vs Prisma TypeScript ORM Comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [React vs Vue vs Svelte 2025 Performance](https://medium.com/@jessicajournal/react-vs-vue-vs-svelte-the-ultimate-2025-frontend-performance-comparison-5b5ce68614e2)
- [React vs Vue vs Svelte 2026 Practical Comparison](https://medium.com/@artur.friedrich/react-vs-vue-vs-svelte-in-2026-a-practical-comparison-for-your-next-side-hustle-e57b7f5f37eb)
- [Tailwind CSS v4 Complete Guide](https://devtoolbox.dedyn.io/blog/tailwind-css-v4-complete-guide)
- [Tailwind CSS v4 Migration Best Practices](https://www.digitalapplied.com/blog/tailwind-css-v4-2026-migration-best-practices)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Secrets of Self-hosting Next.js at Scale](https://www.sherpa.sh/blog/secrets-of-self-hosting-nextjs-at-scale-in-2025)
- [Vite vs Turbopack 2025](https://dev.to/hamzakhan/vite-vs-turbopack-in-2025-which-one-to-choose-13d3)
- [Turbopack in 2026 Complete Guide](https://dev.to/pockit_tools/turbopack-in-2026-the-complete-guide-to-nextjss-rust-powered-bundler-oda)
- [Type-Safe Shared Packages in Turborepo](https://www.magnumcode.com/blog/turborepo-shared-types-monorepo)
- [2025 Monorepo That Actually Scales](https://medium.com/@TheblogStacker/2025-monorepo-that-actually-scales-turborepo-pnpm-for-next-js-ab4492fbde2a)
- [Node.js Running TypeScript Natively](https://nodejs.org/en/learn/typescript/run-natively)
- [Best TypeScript Backend Frameworks 2026](https://encore.dev/articles/best-typescript-backend-frameworks)
- [Fastify WebSocket Guide](https://www.videosdk.live/developer-hub/websocket/fastify-websocket)
- [Full-Stack Fastify + React Monorepo Template](https://firxworx.com/blog/code/2024-06-11-sharing-a-full-stack-project-monorepo-template-with-ts-rest-react-fastify/)
- [Next.js App Router Project Structure Guide](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)
- [SSR Performance Showdown](https://blog.platformatic.dev/ssr-performance-showdown)
