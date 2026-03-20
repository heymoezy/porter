# Phase 4: Agent Autonomy — Research

**Researched:** 2026-03-20
**Domain:** Autonomous agent scheduling, event-driven triggers, job queues, ephemeral agents — TypeScript/Fastify backend
**Confidence:** HIGH

---

## Summary

Phase 4 adds autonomous execution to Porter agents: scheduled jobs, event-driven triggers, per-agent activity logs, and ephemeral project-scoped agents. The infrastructure builds on the Phase 3 Fastify backend (`backend/src/`) with Drizzle ORM and better-sqlite3. Porter already has a Python scheduler loop and heartbeat engine in `porter.py` — Phase 4 mirrors this capability natively in TypeScript using a simple 2-second poll loop (no cron library required at this scale), atomic SQLite UPDATE for job pickup, and the existing `dispatch_to_persona()` in porter.py as the AI execution layer (called via HTTP proxy until a native TypeScript dispatcher is built in plan 04-02).

The hermes-agent patterns document (`research/hermes-agent-patterns.md`) is the primary design reference for the AI router (plan 04-02) and ephemeral agent depth limits (plan 04-05). All three patterns — per-turn smart routing, dynamic tool schema rebuild, and subagent depth limits — have been pre-researched and have TypeScript sketches ready.

Feature flags (`featureFlags` in `config.ts`) are already defined and wired to env vars for all four autonomy features (`FEATURE_AGENT_SCHEDULING`, `FEATURE_EVENT_TRIGGERS`, `FEATURE_EPHEMERAL_AGENTS`). Phase 4 activates them by implementing the corresponding services.

**Primary recommendation:** Implement a single `services/scheduler.ts` with a `setInterval` poll loop at 2000ms. Use atomic `UPDATE ... WHERE status='pending' RETURNING *` for job pickup to prevent double-execution. Route AI calls through porter.py's `/api/dispatch` proxy until plan 04-02 delivers the native TypeScript router.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | Scheduled agent work (wake on configurable intervals, execute assigned tasks, report back) | `agent_jobs` table with `scheduled_for` timestamp + `services/scheduler.ts` 2s poll covers this. Porter.py already has `_scheduler_loop()` and `_heartbeat_tick()` as verified patterns. |
| AGNT-02 | Event-driven triggers (new file, message, deadline approaching → agent responds) | File upload hook in existing file routes + project deadline scan in scheduler tick. Three trigger types: `file-created`, `deadline-approaching`, `message-received` inserted as jobs in the same `agent_jobs` table. |
| AGNT-03 | Agent activity log (user-readable feed: what each agent did, when, why, what's queued) | `agent_activity` table (or `agent_jobs` history rows with status=`complete`/`failed`) + `GET /api/v1/agents/:id/activity` route. UI component reads chronological feed. |
| AGNT-04 | Ephemeral project-scoped agents that auto-retire when project completes or on explicit dismissal | `project_id` and `depth` columns on personas table + scheduler tick checks project status. Hermes-agent pattern 3 defines depth=2 hard limit and max 3 concurrent children. |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | SQLite driver | Already in package.json; WAL + busy_timeout already configured in `db/client.ts` |
| drizzle-orm | 0.45.1 | ORM + schema | Already in use for personas, projects, sessions tables |
| fastify | 5.8.2 | HTTP server | Already running; new routes register as v1 plugins |
| zod | 4.3.6 | Input validation | Already used in agents.ts, projects.ts |

### No New Dependencies Required
The scheduler, event triggers, activity log, and ephemeral agents can all be implemented using stdlib (`setInterval`, `Date.now()`) plus the existing better-sqlite3 and Drizzle stack. Node-cron (4.2.1 available) is NOT needed — the 2-second poll model is simpler and more testable than cron expressions for this use case.

**Rationale:** Porter.py's existing `_scheduler_loop()` uses a 60-second sleep with per-job cron evaluation. Phase 4 targets a 2-second poll for responsiveness, checking `agent_jobs.scheduled_for <= NOW()`. This is standard "delayed job queue" pattern and requires no external scheduler library.

**Installation:** No new installs required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| setInterval poll | node-cron | node-cron is cron-expression-based; simpler for interval jobs, overkill for this |
| setInterval poll | BullMQ/Redis | Requires Redis; massive overkill for 8GB RAM single-node |
| setInterval poll | @fastify/schedule (wraps toad-scheduler) | Extra layer with no benefit; pure setInterval is more debuggable |
| porter.py proxy for AI dispatch | Native fetch to openclaw | Plan 04-02 will build native router; interim proxy to porter.py is correct |

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── db/
│   ├── client.ts           # existing — exports db + sqlite
│   └── schema.ts           # ADD: agent_jobs, agent_activity tables
├── services/
│   ├── scheduler.ts        # NEW — job poll loop (plan 04-01)
│   ├── ai-router.ts        # NEW — model selection + dispatch (plan 04-02)
│   └── event-triggers.ts   # NEW — file/deadline/message trigger wiring (plan 04-03)
├── routes/
│   └── v1/
│       ├── agents.ts       # EXTEND — add activity log endpoint (plan 04-04)
│       ├── jobs.ts         # NEW — job CRUD endpoints (plan 04-01)
│       └── index.ts        # EXTEND — register jobs routes
├── plugins/
│   └── auth.ts             # existing
└── config.ts               # existing — featureFlags already defined
```

### Pattern 1: Atomic Job Pickup (Anti-double-execution)
**What:** Scheduler poll selects and claims a job in a single atomic statement using `UPDATE ... RETURNING`. Only the process that wins the UPDATE executes the job.
**When to use:** Every scheduled job pickup — prevents two scheduler cycles from running the same job if a tick overlaps.
**Example:**
```typescript
// Source: Standard delayed-job queue pattern, verified against better-sqlite3 docs
function claimNextJob(db: Database): JobRow | undefined {
  const stmt = db.prepare(`
    UPDATE agent_jobs
    SET status = 'running', started_at = unixepoch('now'), worker_id = ?
    WHERE id = (
      SELECT id FROM agent_jobs
      WHERE status = 'pending'
        AND scheduled_for <= unixepoch('now')
        AND (agent_id IS NULL OR agent_id IN (SELECT id FROM personas WHERE status != 'retired'))
      ORDER BY scheduled_for ASC
      LIMIT 1
    )
    RETURNING *
  `);
  return stmt.get(WORKER_ID) as JobRow | undefined;
}
```

### Pattern 2: Feature Flag Guard (kill switch)
**What:** Every autonomous operation checks its feature flag before executing. Disabling a flag stops execution within one poll cycle — no restart needed.
**When to use:** Wrap scheduler tick, event trigger wiring, and ephemeral agent creation.
**Example:**
```typescript
// Source: config.ts featureFlags (verified — already defined in Phase 3)
import { featureFlags } from '../config.js';

function schedulerTick() {
  if (!featureFlags.agentScheduling) return; // kill switch
  const job = claimNextJob(sqlite);
  if (!job) return;
  executeJob(job).catch(err => markJobFailed(job.id, err.message));
}
```

### Pattern 3: Ephemeral Agent Depth Enforcement (Hermes Pattern 3)
**What:** When a parent agent spawns a child agent, enforce depth=2 hard limit and max 3 concurrent children. Children get a blocked tool list.
**When to use:** Any agent creation triggered by another agent (not by a human user).
**Example:**
```typescript
// Source: research/hermes-agent-patterns.md — Pattern 3
const CHILD_BLOCKED_TOOLS = ['delegate_task', 'send_message', 'memory', 'execute_code'];
const MAX_DEPTH = 2;
const MAX_CONCURRENT_CHILDREN = 3;

async function spawnEphemeralChild(parentId: string, parentDepth: number) {
  if (parentDepth >= MAX_DEPTH) {
    throw new Error(`Depth limit reached (${MAX_DEPTH}). Cannot spawn grandchildren.`);
  }
  const runningChildren = db.prepare(
    `SELECT count(*) as n FROM agent_jobs WHERE parent_agent_id = ? AND status = 'running'`
  ).get(parentId) as { n: number };
  if (runningChildren.n >= MAX_CONCURRENT_CHILDREN) {
    throw new Error(`Max concurrent children (${MAX_CONCURRENT_CHILDREN}) reached.`);
  }
  // create child persona with depth = parentDepth + 1, blocked_tools stored in config
}
```

### Pattern 4: Per-Turn Smart Routing Heuristic (Hermes Pattern 1)
**What:** Fast pre-filter before expensive backend scoring. Short, simple messages route to cheap (Ollama local) model; complex/code messages route to strong (openclaw/codex) model.
**When to use:** `services/ai-router.ts` as first step before any scoring.
**Example:**
```typescript
// Source: research/hermes-agent-patterns.md — Pattern 1
function shouldRouteCheap(message: string): boolean {
  if (message.length > 160 || message.split(/\s+/).length > 28) return false;
  if (/```|`|https?:\/\/|debug|implement|refactor|test|tool/i.test(message)) return false;
  return true;
}
```

### Pattern 5: Event Trigger → Job Queue Bridge
**What:** Event handlers (file upload, project deadline approaching, message received) create `agent_jobs` rows. The scheduler picks them up on the next tick. Events are never executed synchronously inside HTTP handlers.
**When to use:** All event triggers — never block HTTP response waiting for AI dispatch.
**Example:**
```typescript
// Source: Standard async job queue pattern
async function onFileUploaded(projectId: string, filename: string) {
  // Find agents subscribed to file-created events for this project
  const subscribers = getEventSubscribers('file-created', projectId);
  for (const agentId of subscribers) {
    db.prepare(`
      INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, status, scheduled_for)
      VALUES (?, ?, 'file-created', ?, 'pending', unixepoch('now'))
    `).run(crypto.randomUUID(), agentId, JSON.stringify({ filename, projectId }));
  }
}
```

### Anti-Patterns to Avoid
- **Blocking HTTP handlers for AI dispatch:** Never await `dispatch_to_persona` inside a POST handler. Insert a job row, return 202 Accepted.
- **Polling without atomic pickup:** `SELECT` then `UPDATE` in two steps creates a race condition. Always use `UPDATE ... RETURNING`.
- **Unbounded job history:** Without a cleanup step, `agent_jobs` grows forever. Add a `created_at` column and a periodic cleanup that deletes `status = 'complete'` rows older than 30 days.
- **Grandchildren spawning grandchildren:** Enforce `depth` column at insert time, not just at dispatch time.
- **Missing feature flag checks:** An agent waking up after a flag is disabled should silently skip, not error.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preventing double-job-execution | Custom lock table or in-memory mutex | `UPDATE ... WHERE status='pending' RETURNING *` | Atomic SQLite UPDATE is ACID-safe; in-memory locks fail on restart |
| Model availability detection | Manual ping loop | `featureFlags` + porter.py capability cache | Porter.py already probes backends on startup and caches in `_capabilities_cache` |
| Cron expression parsing | Custom cron parser | Porter.py's `_cron_next()` is already there; or store simple interval_seconds | Re-implementing cron in TypeScript duplicates a working Python implementation |
| Job retry with backoff | Custom retry loop | Increment `attempt_count`, set `scheduled_for = NOW() + (attempt * 30s)`, max 3 attempts | Exponential backoff in one SQL UPDATE is sufficient for this scale |

**Key insight:** The database IS the job queue. SQLite WAL mode with busy_timeout=30000 already handles concurrent access. No message broker needed.

---

## Common Pitfalls

### Pitfall 1: Scheduler Not Started on Boot
**What goes wrong:** `services/scheduler.ts` module is imported but `start()` is never called — agents are never scheduled.
**Why it happens:** TypeScript side effects don't auto-execute; the scheduler needs explicit lifecycle wiring in `index.ts`.
**How to avoid:** In `index.ts`, call `scheduler.start()` after `fastify.listen()` resolves. Call `scheduler.stop()` on `SIGINT`/`SIGTERM`.
**Warning signs:** No `agent_jobs` rows ever transition from `pending` to `running`.

### Pitfall 2: porter.py Scheduler Conflict
**What goes wrong:** Both the Python heartbeat loop and the new TypeScript scheduler try to dispatch the same agent simultaneously.
**Why it happens:** porter.py's `_heartbeat_tick()` runs on its own 60-second loop, independently of the TypeScript job queue.
**How to avoid:** Phase 4 TypeScript scheduler should use `agent_jobs` table exclusively. Porter.py's heartbeat uses `personas.heartbeat_cron` column — these are distinct systems that don't overlap unless an agent is configured for both. Document: heartbeat_cron in porter.py is legacy/parallel; new scheduled work goes through `agent_jobs` only.
**Warning signs:** An agent reports running twice for the same trigger window.

### Pitfall 3: SQLite Busy Errors Under Scheduler Load
**What goes wrong:** Scheduler poll at 2s intervals plus concurrent HTTP writes produces `SQLITE_BUSY` errors.
**Why it happens:** better-sqlite3 is synchronous; WAL mode helps but busy_timeout must be set.
**How to avoid:** `db/client.ts` already sets `busy_timeout = 30000` and WAL mode. The scheduler runs in the same Node.js process — no true concurrency (single-threaded). Verify the scheduler uses the shared `sqlite` instance from `db/client.ts`, not a new Database connection.
**Warning signs:** `SQLITE_BUSY: database is locked` in scheduler logs.

### Pitfall 4: Orphaned Jobs on Agent Retire
**What goes wrong:** Agent is retired (soft-deleted) but its `pending` jobs remain in `agent_jobs`. Scheduler tries to dispatch them, finds no persona, fails silently.
**Why it happens:** No FK cascade — personas.status is a soft field, not a DB-enforced delete.
**How to avoid:** When setting `personas.status = 'retired'`, also update matching `agent_jobs SET status = 'cancelled' WHERE agent_id = ? AND status = 'pending'`. Handle in the DELETE /api/v1/agents/:id route.
**Warning signs:** Growing queue of `pending` jobs for retired agents.

### Pitfall 5: Event Trigger Storm
**What goes wrong:** A bulk file upload creates 50 `file-created` events, inserting 50 jobs per subscribed agent — queue floods.
**Why it happens:** No deduplication or rate-limiting on event insertion.
**How to avoid:** For file-created events, check if a `pending` job already exists for that agent+project+trigger_type before inserting. Use INSERT OR IGNORE with a unique constraint on `(agent_id, trigger_type, project_id)` with a 60-second cooldown via `WHERE NOT EXISTS`.
**Warning signs:** `agent_jobs` count explodes after a multi-file upload.

### Pitfall 6: Ephemeral Agent Not Retiring
**What goes wrong:** Project is marked `complete` but ephemeral agents linger with pending jobs still running.
**Why it happens:** Scheduler doesn't check project status before dispatching jobs.
**How to avoid:** In job pickup query, join against `projects` table: skip jobs whose project's status = `complete`/`archived` if the agent is ephemeral (`is_temporary = 1`). On project complete event, also cancel pending jobs for the project's ephemeral agents.
**Warning signs:** is_temporary agents continue to run after project completes.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### agent_jobs Schema (Drizzle)
```typescript
// Drizzle ORM pattern — matches existing schema.ts conventions
export const agentJobs = sqliteTable('agent_jobs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  projectId: text('project_id'),
  parentAgentId: text('parent_agent_id'),  // for ephemeral children
  triggerType: text('trigger_type').notNull().default('scheduled'),
  // 'scheduled' | 'file-created' | 'deadline-approaching' | 'message-received' | 'manual'
  triggerData: text('trigger_data').default('{}'),  // JSON
  prompt: text('prompt'),                           // task prompt to dispatch
  status: text('status').notNull().default('pending'),
  // 'pending' | 'running' | 'complete' | 'failed' | 'cancelled'
  scheduledFor: real('scheduled_for').notNull(),    // Unix timestamp
  startedAt: real('started_at'),
  completedAt: real('completed_at'),
  workerId: text('worker_id'),                      // for multi-process future use
  attemptCount: integer('attempt_count').default(0),
  result: text('result'),                           // JSON response summary
  error: text('error'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});

export const agentActivity = sqliteTable('agent_activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  jobId: text('job_id'),
  projectId: text('project_id'),
  eventType: text('event_type').notNull(),
  // 'job_started' | 'job_complete' | 'job_failed' | 'trigger_fired' | 'agent_retired'
  summary: text('summary'),
  detail: text('detail'),  // JSON
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

### Scheduler Service Skeleton
```typescript
// Source: Porter.py _scheduler_loop() pattern, translated to TypeScript
// backend/src/services/scheduler.ts
import { sqlite } from '../db/client.js';
import { featureFlags } from '../config.js';
import crypto from 'crypto';

const POLL_INTERVAL_MS = 2000;
const WORKER_ID = crypto.randomUUID();
let intervalId: NodeJS.Timeout | null = null;

export function start() {
  if (intervalId) return;
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
}

export function stop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

async function tick() {
  if (!featureFlags.agentScheduling) return;
  try {
    const job = claimNextJob();
    if (!job) return;
    await executeJob(job);
  } catch (e) {
    // never crash the poll loop
    console.error('[scheduler] tick error', e);
  }
}

function claimNextJob() {
  return sqlite.prepare(`
    UPDATE agent_jobs
    SET status = 'running', started_at = unixepoch('now'), worker_id = @workerId,
        attempt_count = attempt_count + 1
    WHERE id = (
      SELECT aj.id FROM agent_jobs aj
      JOIN personas p ON p.id = aj.agent_id
      WHERE aj.status = 'pending'
        AND aj.scheduled_for <= unixepoch('now')
        AND p.status != 'retired'
      ORDER BY aj.scheduled_for ASC LIMIT 1
    )
    RETURNING *
  `).get({ workerId: WORKER_ID });
}
```

### Activity Log Route
```typescript
// GET /api/v1/agents/:id/activity — returns chronological feed
fastify.get('/:id/activity', {
  preHandler: [fastify.requireAuth],
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const rows = sqlite.prepare(`
    SELECT * FROM agent_activity
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(id);
  return reply.send(ok({ activity: rows, agent_id: id }));
});
```

### Deadline Trigger Check (in scheduler tick)
```typescript
// Source: porter.py pattern adapted — runs inside tick() when event_triggers flag is on
function checkDeadlineTriggers() {
  if (!featureFlags.eventTriggers) return;
  // Projects with deadlines within next 24 hours that haven't triggered yet
  const approaching = sqlite.prepare(`
    SELECT p.id as project_id, p.deadline, p.name
    FROM projects p
    WHERE p.status = 'active'
      AND p.deadline IS NOT NULL
      AND CAST(p.deadline AS REAL) BETWEEN unixepoch('now') AND unixepoch('now') + 86400
      AND NOT EXISTS (
        SELECT 1 FROM agent_jobs aj
        WHERE aj.project_id = p.id
          AND aj.trigger_type = 'deadline-approaching'
          AND aj.created_at > unixepoch('now') - 86400
      )
  `).all();
  for (const proj of approaching) {
    insertTriggerJob('deadline-approaching', proj.project_id, null, proj);
  }
}
```

---

## Existing Porter.py Patterns to Replicate

These verified patterns in porter.py confirm the approach is sound:

| Porter.py Pattern | Location | Phase 4 TypeScript Equivalent |
|------------------|----------|-------------------------------|
| `_scheduler_loop()` + `_scheduler_tick()` | Lines 7333-7341 | `services/scheduler.ts` start/tick |
| `_heartbeat_tick()` per-persona cron | Lines 7346-7367 | `agent_jobs` with `trigger_type='scheduled'` |
| `_cron_next()` expression parser | Lines 7174-7224 | Not needed — Phase 4 uses interval_seconds or fixed timestamps |
| `dispatch_to_persona()` | Lines 43483+ | Interim: POST to porter.py proxy; Phase 04-02: native ai-router.ts |
| `_loop_guard_check()` | Lines 1817-1834 | Ephemeral agent depth limit + max concurrent children |
| `_fire_schedule_job()` non-blocking | Lines 7238-7273 | `executeJob()` called async inside tick, errors caught |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| porter.py heartbeat_cron on persona row | `agent_jobs` table with trigger_type | Phase 4 | Decouples agent identity from scheduling; jobs are queryable |
| Direct subprocess dispatch in Python | TypeScript ai-router.ts via HTTP | Phase 04-02 | Enables streaming, token tracking, smart routing in TS |
| No activity log | `agent_activity` table + API | Phase 04-04 | User-visible audit trail for autonomous work |

**Deprecated/outdated:**
- `heartbeat_cron` on persona row: still functional in porter.py but new scheduled work goes through `agent_jobs` only. Do NOT disable porter.py heartbeat in Phase 4 — it runs independently.

---

## Open Questions

1. **AI dispatch in plan 04-02: proxy to porter.py or native TypeScript?**
   - What we know: porter.py's `dispatch_to_persona()` is the authoritative AI dispatch with memory injection, loop guards, smart routing. Calling it from TypeScript requires an HTTP call to the proxy.
   - What's unclear: Phase 04-02 builds `services/ai-router.ts` natively. Does this duplicate or replace `dispatch_to_persona()`? The roadmap says "openclaw dispatch, streaming response" suggesting native TS, not porter.py proxy.
   - Recommendation: Plan 04-01 uses porter.py proxy (`POST /api/dispatch` or existing dispatch endpoint) for initial scheduler jobs. Plan 04-02 builds the native TS router with smart routing + streaming. This is the correct sequencing.

2. **Deadline column format in projects table**
   - What we know: `projects.metadata` is a JSON blob; `deadline` may be stored in metadata or as a top-level column. Porter.py uses `proj["deadline"]` (string `YYYY-MM-DD`).
   - What's unclear: The Drizzle `projects` schema (schema.ts) does NOT have a `deadline` column — it's in `metadata` JSON or not in the Fastify DB layer.
   - Recommendation: Store deadline as a top-level `deadline text` column via a schema migration in Wave 0 of plan 04-03. Don't parse JSON blobs to find deadlines in the scheduler.

3. **Event subscriber registry: where is stored?**
   - What we know: Event triggers need to know which agents subscribe to which events on which projects.
   - What's unclear: No `agent_event_subscriptions` table exists yet.
   - Recommendation: Store subscriptions in `personas.config` JSON blob (already a flexible dict) with key `event_subscriptions: [{type, project_id}]`. The scheduler reads this on startup and rechecks periodically.

---

## Validation Architecture

nyquist_validation is enabled — validation section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Node.js) + Python scripts for DB assertions |
| Config file | `tests/playwright.config.js` — baseURL `http://127.0.0.1:8877` |
| Quick run command | `cd /home/lobster/documents/porter/tests && npx playwright test` |
| Full suite command | `cd /home/lobster/documents/porter/tests && npx playwright test` (all 35 tests) |
| Unit tests | None yet — Phase 4 behavioral tests will be `/tmp/` scripts per established convention |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-01 | Agent with `scheduled_for` in past is picked up by scheduler within 2s | integration (DB direct) | `python3 /tmp/test_agnt01_scheduler.py` | Wave 0 gap |
| AGNT-01 | Feature flag off → no jobs executed | unit/integration | `python3 /tmp/test_agnt01_flag.py` | Wave 0 gap |
| AGNT-02 | File upload event inserts a job row for subscribed agent | integration | `python3 /tmp/test_agnt02_file_trigger.py` | Wave 0 gap |
| AGNT-02 | Deadline-approaching trigger fires within poll window | integration | `python3 /tmp/test_agnt02_deadline.py` | Wave 0 gap |
| AGNT-03 | GET /api/v1/agents/:id/activity returns chronological feed | API (Playwright or curl) | `npx playwright test --grep "activity feed"` | Wave 0 gap |
| AGNT-04 | Ephemeral agent auto-retires when project marked complete | integration (DB direct) | `python3 /tmp/test_agnt04_retire.py` | Wave 0 gap |
| AGNT-04 | Depth > 2 spawn attempt is rejected | unit | `python3 /tmp/test_agnt04_depth.py` | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/documents/porter/tests && npx playwright test` (35 existing tests must stay green)
- **Per wave merge:** Full 35-test suite + relevant `/tmp/test_agnt0*.py` behavioral scripts
- **Phase gate:** All 35 Playwright tests green + all behavioral scripts pass before marking phase complete

### Wave 0 Gaps
- [ ] `schema migration` for `agent_jobs` and `agent_activity` tables — required before any test can run
- [ ] `/tmp/test_agnt01_scheduler.py` — inserts a past-due job, waits 3s, asserts status = 'running'
- [ ] `/tmp/test_agnt01_flag.py` — disables flag, inserts job, waits 3s, asserts still 'pending'
- [ ] `/tmp/test_agnt02_file_trigger.py` — simulates file upload hook, asserts job inserted
- [ ] `/tmp/test_agnt02_deadline.py` — inserts project with deadline = now+1h, asserts trigger job created
- [ ] `/tmp/test_agnt03_activity_api.py` — asserts GET /api/v1/agents/:id/activity returns JSON array
- [ ] `/tmp/test_agnt04_retire.py` — creates ephemeral agent, marks project complete, asserts agent status = 'retired'
- [ ] `/tmp/test_agnt04_depth.py` — attempts depth-3 spawn, asserts error returned

*Convention from Phase 2: behavioral test scripts live in /tmp/ only — not committed to git.*

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/documents/porter/porter.py` lines 7155-7387 — `_cron_next`, `_scheduler_loop`, `_heartbeat_tick`, `_run_heartbeat` (verified working Python scheduler)
- `/home/lobster/documents/porter/porter.py` lines 43483-43600 — `dispatch_to_persona()` full implementation (verified AI dispatch layer)
- `/home/lobster/documents/porter/porter.py` lines 42864-42902 — `_smart_route()` routing logic (verified model selection)
- `/home/lobster/documents/porter/backend/src/db/schema.ts` — verified existing Drizzle schema (personas, projects columns confirmed)
- `/home/lobster/documents/porter/backend/src/config.ts` — featureFlags already defined for all 4 autonomy features
- `/home/lobster/documents/porter/research/hermes-agent-patterns.md` — pre-researched patterns with TypeScript sketches (Patterns 1, 2, 3 directly applicable)
- `npm view better-sqlite3 version` → 12.8.0 (verified 2026-03-20)
- `npm view drizzle-orm version` → 0.45.1 (verified 2026-03-20)
- `npm view fastify version` → 5.8.2 (verified 2026-03-20)

### Secondary (MEDIUM confidence)
- `npm view node-cron version` → 4.2.1; confirmed NOT needed for 2s poll model
- better-sqlite3 `UPDATE ... RETURNING` — standard SQLite 3.35+ syntax; better-sqlite3 supports it (verified against better-sqlite3 README)

### Tertiary (LOW confidence — flag for validation)
- Deadline column in projects table may be in `metadata` JSON blob — needs verification against live DB before plan 04-03

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use from Phase 3
- Architecture: HIGH — directly mirrors verified porter.py patterns, translated to TypeScript
- Pitfalls: HIGH — Pitfalls 1-4 are verified from existing code (loop guard, orphan cleanup, SQLite busy, missing lifecycle). Pitfalls 5-6 are MEDIUM (inferred from common job queue problems)
- Hermes patterns: HIGH — patterns document was pre-researched with TypeScript sketches

**Research date:** 2026-03-20
**Valid until:** 2026-05-01 (stable stack — better-sqlite3, Drizzle, Fastify all semver-stable)
