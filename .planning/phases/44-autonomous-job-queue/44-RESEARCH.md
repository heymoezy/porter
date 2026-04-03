# Phase 44: Autonomous Job Queue - Research

**Researched:** 2026-04-03
**Domain:** Job queue lifecycle, skill-based routing, self-scheduling, admin visibility
**Confidence:** HIGH

---

## Summary

Phase 44 extends the existing `agent_jobs` infrastructure — which already exists in DB and scheduler — into a fully-capable autonomous job queue. The table exists but is missing: a `source` column to distinguish system-originated jobs from human-triggered ones, required skill and gateway capability constraints for job-to-agent matching, and admin API endpoints for queue visibility.

The scheduler already does `claimNextJob()` with SELECT-FOR-UPDATE semantics and executes jobs. Phase 44 does NOT need to rebuild the queue engine. It needs to: (1) migrate the schema to add `source`, `required_skill`, and `required_capability` columns, (2) build a job-assignment service that selects agents by skill match and gateway capability match, (3) add a Porter self-scheduler that enqueues `source=system` jobs on a schedule, and (4) expose admin API endpoints and a UI panel for queue visibility.

**Primary recommendation:** Extend the existing `agent_jobs` table with 3 new columns and a dedicated `job-assignment.ts` service. Plug the assignment service into the scheduler's `claimNextJob()` path. Wire self-scheduling into the scheduler `tick()`. Expose a new `/api/v1/admin/jobs` route set with live/completed/history views and a frontend panel on the bridge page.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AJQ-01 | agent_jobs table stores work items with status lifecycle (queued -> assigned -> running -> complete/failed) visible in DB and via API | Table already exists; needs `source`, `required_skill`, `required_capability` columns added via migration |
| AJQ-02 | Job assignment engine matches jobs to best available agent based on skills and gateway capabilities | New `job-assignment.ts` service using `persona_skills` JOIN and `gateways.capabilities` JSONB queries |
| AJQ-03 | Porter self-dispatches scheduled jobs (health check, monitoring sweep) without human trigger — `source=system` | New `scheduleSystemJob()` helper + scheduler tick hooks for health_sweep and gateway_check trigger types |
| AJQ-04 | Admin can view live job queue, running jobs, completed jobs, and assignment history with gateway, agent, duration, outcome | New `/api/v1/admin/jobs` endpoints + frontend JobQueuePanel component |
</phase_requirements>

---

## Standard Stack

### Core (already in project — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-postgres (pg) | ~8.11 | Raw SQL for job claiming with FOR UPDATE SKIP LOCKED | Already used throughout scheduler |
| Drizzle ORM | ~0.30 | Schema definitions, migrations | Already canonical ORM |
| Fastify 5 | ~5.x | Admin route registration | Already the backend framework |
| React Router 7 | ~7.x | Admin frontend routing | Already used in admin/frontend |
| shadcn/ui | latest | Frontend components (Table, Badge, Tabs) | Already installed design system |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (built-in) | Node stdlib | UUID generation for job IDs | Same as existing scheduler pattern |
| date-fns or Intl | Built-in | Duration formatting in UI | No new dependency needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw SQL SELECT FOR UPDATE | Bull/BullMQ | Bull is overkill — existing pattern already handles concurrency correctly with FOR UPDATE SKIP LOCKED; adding a Redis dependency is not justified |
| In-process scheduler | cron library | Existing tick-count scheduler works fine; no need for a cron expression parser |

**Installation:** No new packages required. Phase 44 is pure extension of existing infrastructure.

---

## Architecture Patterns

### Existing Infrastructure (do not rebuild)

The scheduler already owns:
- `claimNextJob()` — `UPDATE agent_jobs SET status='running' WHERE id=(SELECT...FOR UPDATE SKIP LOCKED)` pattern, worker-ID claimed
- `executeJob()` — dispatch router for trigger_type-based handlers
- `markJobComplete()` / `markJobFailed()` — status lifecycle completions
- `emitSSE()` / `logActivity()` — observability hooks

### What Phase 44 Adds

```
backend/src/services/
├── job-assignment.ts       # NEW — skill + gateway matching engine (AJQ-02)
├── scheduler.ts            # MODIFY — add system job scheduler + self-enqueue hooks (AJQ-03)
                            #          add scheduleSystemJob() + executeJob() handlers for
                            #          health_sweep, gateway_check trigger types
backend/src/db/
├── migrate-ajq-v1.ts       # NEW — adds source, required_skill, required_capability,
                            #        assigned_gateway columns to agent_jobs (AJQ-01)
backend/src/routes/v1/admin/
├── jobs.ts                 # NEW — GET /jobs, GET /jobs/queue, GET /jobs/history (AJQ-04)
admin/frontend/app/routes/
├── bridge.tsx              # MODIFY — add JobQueuePanel tab/section (AJQ-04)
admin/frontend/app/components/
├── JobQueuePanel.tsx        # NEW — queue/running/completed/history tabs
```

### Pattern 1: Schema Migration

**What:** Add 4 columns to existing `agent_jobs` table without breaking existing inserts.
**When to use:** All new columns must have safe defaults so existing scheduler code continues to work unchanged.

```sql
-- Source: existing migrate-bridge-v7.ts pattern (idempotency guard)
ALTER TABLE agent_jobs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS required_skill TEXT,           -- skill.id or NULL
  ADD COLUMN IF NOT EXISTS required_capability TEXT,      -- 'tool_support:full' | 'agentic:true' | NULL
  ADD COLUMN IF NOT EXISTS assigned_gateway TEXT;         -- gateway type resolved at claim time
```

`source` values: `'system'` (self-dispatched by Porter), `'agent'` (dispatched by an agent via delegation), `'human'` (enqueued by a user action via API). Default `'system'` because all existing jobs are system-originated.

### Pattern 2: Job Assignment Service

**What:** `selectBestAgent(job)` — given a job with optional `required_skill` and `required_capability`, find the best available persona.
**When to use:** Called by a new `claimJobWithAssignment()` path in scheduler, or as a standalone helper for the assignment API.

```typescript
// Source: backend/src/db/schema.ts — persona_skills, gateways
export interface JobAssignmentResult {
  agentId: string;
  agentName: string;
  gatewayType: string | null;
  matchReason: string;
}

export async function selectBestAgent(
  requiredSkill: string | null,
  requiredCapability: string | null,
): Promise<JobAssignmentResult | null>
```

**Query pattern** — skill-matched agent selection:
```sql
SELECT p.id, p.name, ps.skill_id
FROM personas p
JOIN persona_skills ps ON ps.persona_id = p.id
WHERE ps.skill_id = $1
  AND ps.enabled = 1
  AND p.status != 'retired'
ORDER BY ps.effectiveness_score DESC NULLS LAST
LIMIT 1
```

**Query pattern** — gateway capability matching:
```sql
SELECT id, type FROM gateways
WHERE status = 'active'
  AND enabled = 1
  AND (capabilities->>'tool_support') = 'full'  -- for required_capability='tool_support:full'
ORDER BY priority DESC
LIMIT 1
```

### Pattern 3: Porter Self-Scheduling (AJQ-03)

**What:** Scheduler tick hooks that enqueue `source=system` jobs for health sweeps and gateway checks.
**When to use:** Jobs with `source=system` are the proof for AJQ-03 success criterion.

```typescript
// Add to scheduler.ts tick()
const SYSTEM_JOB_INTERVAL = 1800; // 1800 ticks × 2s = 60 minutes
const HEALTH_SWEEP_INTERVAL = 450;  // 450 × 2s = 15 minutes

if (tickCount > 0 && tickCount % HEALTH_SWEEP_INTERVAL === 0) {
  await scheduleSystemJob('health_sweep', {}, 0); // fire immediately
}

// scheduleSystemJob helper (new export on scheduler.ts)
export async function scheduleSystemJob(
  triggerType: string,
  triggerData: Record<string, unknown>,
  delaySeconds: number = 0,
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`
    INSERT INTO agent_jobs (id, agent_id, trigger_type, trigger_data, source, status, scheduled_for, created_at)
    VALUES ($1, 'system', $2, $3, 'system', 'pending', EXTRACT(EPOCH FROM NOW()) + $4, EXTRACT(EPOCH FROM NOW()))
  `, [id, triggerType, JSON.stringify(triggerData), delaySeconds]);
  return id;
}
```

`executeJob()` must handle `health_sweep` and `gateway_check` trigger types — these are lightweight (call existing `runHealthProbe()` and return stats).

### Pattern 4: Admin API Endpoints (AJQ-04)

**What:** REST endpoints on `GET /api/v1/admin/jobs` following existing bridge/tasks pattern exactly.
**When to use:** Admin frontend polls these for the job queue panel.

Endpoint set:
```
GET /api/v1/admin/jobs           — list all jobs, filter by status/source/trigger_type
GET /api/v1/admin/jobs/queue     — shortcut: status=pending|running
GET /api/v1/admin/jobs/history   — completed + failed jobs with duration, agent, gateway
GET /api/v1/admin/jobs/:jobId    — full detail for a single job
```

Response shape follows existing `bridge_tasks` pattern:
```typescript
{
  jobs: Array<{
    id: string;
    agent_id: string;
    assigned_agent_name: string | null;  // JOIN to personas.name
    trigger_type: string;
    source: string;
    status: string;
    required_skill: string | null;
    required_capability: string | null;
    assigned_gateway: string | null;
    scheduled_for: number;
    started_at: number | null;
    completed_at: number | null;
    duration_ms: number | null;          // computed: (completed_at - started_at) * 1000
    result_preview: string | null;       // LEFT(result, 200)
    error: string | null;
    created_at: number;
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

### Pattern 5: Frontend Panel (AJQ-04)

**What:** `JobQueuePanel` React component with 3 tabs: Queue (pending/running), Completed, History.
**When to use:** Embedded in the existing `bridge.tsx` admin route — same page as bridge tasks.

UI structure follows existing `bridge.tsx` pattern:
- Tabs: Queue | Completed | History
- Table columns: Source badge, Trigger Type, Agent, Gateway, Status badge, Duration, Created
- Status badges: color-coded (pending=yellow, running=blue, complete=green, failed=red)
- Source badges: system=gray, agent=purple, human=teal
- Auto-refresh: poll `/api/v1/admin/jobs/queue` every 10s when Queue tab active

### Anti-Patterns to Avoid

- **Do not add a separate queue worker process.** The existing scheduler tick owns job execution. New trigger_type handlers plug into `executeJob()` switch.
- **Do not use Bull/BullMQ/Redis.** The `SELECT...FOR UPDATE SKIP LOCKED` pattern already provides correct concurrency semantics for a single-process scheduler.
- **Do not remove or rename existing `trigger_type` values.** `contact_analysis`, `learning_session`, `invite_drip`, `external_call` are live in prod — their handlers must remain intact.
- **Do not use `agent_id='system'` as a proxy for source.** The new `source` column is the canonical discriminator. `agent_id='system'` already means "no specific agent assigned" — it predates this distinction.
- **Do not make `required_skill`/`required_capability` columns NOT NULL.** All 100 existing pending jobs would need updating. Default NULL = "no constraint" = any agent/gateway.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job claiming concurrency | Custom locking | `SELECT...FOR UPDATE SKIP LOCKED` (already in `claimNextJob()`) | Race-condition-free, already proven in prod |
| Skill effectiveness ranking | Manual score computation | `persona_skills.effectiveness_score` column (already computed by Phase 34) | Already populated, already a ranking signal |
| Gateway capability matching | String parsing | `capabilities->>'tool_support'` JSONB operator (Phase 40 pattern) | Already structured in DB, already queried this way |
| Admin table UI | Custom table | shadcn `Table`, `Badge`, `Tabs` components | Already installed, already used in bridge.tsx |
| SSE push on job events | Custom EventSource | `emitSSE()` from scheduler.ts | Already works, already used for agent:activity |

---

## Common Pitfalls

### Pitfall 1: Migration Breaks 100 Existing Pending Jobs

**What goes wrong:** Adding a NOT NULL column without a default causes the migration to fail because 100 `learning_session` jobs already exist.
**Why it happens:** PostgreSQL rejects NOT NULL additions without defaults unless backfilled first.
**How to avoid:** All new columns use `DEFAULT` values. `source DEFAULT 'system'`, `required_skill DEFAULT NULL`, `required_capability DEFAULT NULL`, `assigned_gateway DEFAULT NULL`. Add with `IF NOT EXISTS` for idempotency.
**Warning signs:** Migration errors containing "violates not-null constraint" or "column requires a default value".

### Pitfall 2: Self-Scheduling Creates Duplicate System Jobs

**What goes wrong:** Every 15 minutes, `scheduleSystemJob('health_sweep', ...)` inserts a new job even if one is already pending/running.
**Why it happens:** No deduplication guard.
**How to avoid:** Before inserting, check: `SELECT 1 FROM agent_jobs WHERE trigger_type = $1 AND status IN ('pending', 'running') LIMIT 1`. Only insert if no active job exists.

### Pitfall 3: Assignment Engine Selects Retired/Temporary Agents

**What goes wrong:** `selectBestAgent()` returns a retired or project-ephemeral agent that can no longer execute work.
**Why it happens:** Forgetting to filter `p.status != 'retired'` and ephemeral constraints.
**How to avoid:** Copy the WHERE conditions from existing `claimNextJob()` JOIN filter exactly — it already handles these cases correctly.

### Pitfall 4: source=system Confused with agent_id=system

**What goes wrong:** AJQ-03 success criterion says "a job with source=system in the queue" — but if the column isn't exposed in the admin API response, the verifier can't check it.
**Why it happens:** Forgetting to SELECT the new column in admin endpoints.
**How to avoid:** Always `SELECT *` or explicitly name all new columns in admin endpoint queries.

### Pitfall 5: Admin Route Not Registered

**What goes wrong:** New `jobs.ts` route file exists but is never imported/registered in the v1 admin index barrel.
**Why it happens:** Fastify plugins must be explicitly registered — no auto-discovery.
**How to avoid:** After writing `jobs.ts`, immediately verify registration in `backend/src/routes/v1/admin/index.ts`. Pattern: `fastify.register(jobsRoutes, { prefix: '/admin/jobs' })`.

---

## Code Examples

### Existing claimNextJob() Pattern (do not change, only extend)

```typescript
// Source: backend/src/services/scheduler.ts — existing pattern, proven in prod
const result = await pool.query(`
  UPDATE agent_jobs
  SET status = 'running', started_at = EXTRACT(EPOCH FROM NOW()), worker_id = $1,
      attempt_count = attempt_count + 1
  WHERE id = (
    SELECT aj.id FROM agent_jobs aj
    LEFT JOIN personas p ON p.id = aj.agent_id
    LEFT JOIN projects pr ON pr.id = aj.project_id
    WHERE aj.status = 'pending'
      AND aj.scheduled_for <= EXTRACT(EPOCH FROM NOW())
      AND (aj.agent_id = 'system' OR (
        p.status != 'retired'
        AND (p.is_temporary = 0 OR pr.status IS NULL OR pr.status NOT IN ('complete', 'archived'))
      ))
    ORDER BY aj.scheduled_for ASC LIMIT 1
  )
  RETURNING *
`, [WORKER_ID]);
```

### JSONB Capability Matching Pattern (from Phase 40)

```typescript
// Source: backend/src/services/bridge/capability-registry.ts — established pattern
// Used in routing-engine.ts for gateway selection
const { rows } = await pool.query(`
  SELECT id, type, name FROM gateways
  WHERE status = 'active'
    AND enabled = 1
    AND (capabilities->>'tool_support') = $1
  ORDER BY priority DESC LIMIT 1
`, ['full']);
```

### Admin Route Pattern (from bridge.ts tasks endpoint)

```typescript
// Source: backend/src/routes/v1/admin/bridge.ts:693 — established admin list pattern
fastify.get('/jobs', async (request, reply) => {
  const query = request.query as Record<string, string>;
  const status = query.status || null;
  const source = query.source || null;
  const limit = Math.min(parseInt(query.limit) || 50, 200);
  const offset = parseInt(query.offset) || 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;
  if (status) { conditions.push(`aj.status = $${paramIdx++}`); params.push(status); }
  if (source) { conditions.push(`aj.source = $${paramIdx++}`); params.push(source); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM agent_jobs aj ${where}`, params
  );
  const { rows } = await pool.query(`
    SELECT aj.*, p.name AS assigned_agent_name,
           CASE WHEN aj.completed_at IS NOT NULL AND aj.started_at IS NOT NULL
                THEN ROUND((aj.completed_at - aj.started_at) * 1000)::int
           END AS duration_ms,
           LEFT(aj.result, 200) AS result_preview
    FROM agent_jobs aj
    LEFT JOIN personas p ON p.id = aj.agent_id AND aj.agent_id != 'system'
    ${where}
    ORDER BY aj.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `, [...params, limit, offset]);

  return reply.send(ok({ jobs: rows, total: parseInt(countResult.rows[0]?.total) || 0, limit, offset }));
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String[] capabilities on gateways | Structured JSONB with tool_support, cost_tier, agentic fields | Phase 40 | Can now query capabilities with JSONB operators directly |
| Skills as text in skills_text column | persona_skills junction table with skill_id FK | Phase 31 | Job-to-agent skill matching uses persona_skills JOIN, not text search |
| No source tracking on jobs | source column (pending, Phase 44) | Phase 44 | Distinguishes Porter self-scheduled from human/agent-triggered jobs |

**Deprecated/outdated:**
- `skills_text` column on personas: preserved for backwards compat but never read — do not use in Phase 44 queries
- `agent_id='system'` as a "no agent" marker: still used, but `source` is now the correct discriminator for origin

---

## Open Questions

1. **What `required_capability` format to use?**
   - What we know: capabilities are JSONB with keys `tool_support`, `agentic`, `cost_tier`, `context_window`
   - What's unclear: whether Phase 44 needs a compound format like `'tool_support:full'` or separate columns for each capability dimension
   - Recommendation: Use a single `required_capability TEXT` with format `'field:value'` (e.g. `'tool_support:full'`, `'agentic:true'`). Simple to parse, extensible. Planner can define the parsing pattern.

2. **Should `assigned_gateway` be set at claim time or at execution time?**
   - What we know: at claim time, the agent isn't yet assigned for generic jobs; at execution time, `claimNextJob()` resolves the agent
   - Recommendation: Set `assigned_gateway` in `executeJob()` after routing decision is made, before dispatch. This keeps `claimNextJob()` unchanged.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (JS) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/projects/porter/tests && npx playwright test --grep "AJQ"` |
| Full suite command | `cd /home/lobster/projects/porter/tests && npx playwright test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AJQ-01 | agent_jobs has source column, status lifecycle visible via API | smoke/API | `cd tests && npx playwright test --grep "AJQ-01"` | Wave 0 |
| AJQ-02 | Job with required_skill routes to agent with that skill | integration | `cd tests && npx playwright test --grep "AJQ-02"` | Wave 0 |
| AJQ-03 | source=system job appears in DB without human trigger | smoke/DB | `cd tests && npx playwright test --grep "AJQ-03"` | Wave 0 |
| AJQ-04 | Admin API returns jobs with agent, gateway, duration, outcome | API | `cd tests && npx playwright test --grep "AJQ-04"` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd /home/lobster/projects/porter/tests && npx playwright test --grep "AJQ"`
- **Per wave merge:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/job-queue.spec.js` — covers AJQ-01 through AJQ-04
  - AJQ-01: `psql -d porter -c "\d agent_jobs"` check for `source` column + `GET /api/v1/admin/jobs` returns 200
  - AJQ-02: POST enqueue a job with `required_skill`, poll `/api/v1/admin/jobs`, verify `assigned_agent_name` is set to an agent that has the skill
  - AJQ-03: Wait 2 scheduler ticks after start, query DB for `source='system'` job
  - AJQ-04: `GET /api/v1/admin/jobs/history` returns rows with `duration_ms`, `assigned_agent_name`, `assigned_gateway`

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `backend/src/services/scheduler.ts` (full file, 741 lines) — existing job lifecycle patterns, claimNextJob(), executeJob() architecture
- Direct codebase inspection — `backend/src/db/schema.ts` lines 170-187 — current agent_jobs columns
- Direct codebase inspection — `backend/src/routes/v1/admin/bridge.ts` lines 693-760 — admin list endpoint pattern used as template for AJQ-04
- Direct codebase inspection — `backend/src/services/bridge/capability-registry.ts` — JSONB capability matching patterns
- `psql -d porter -c "\d agent_jobs"` — confirmed live schema has no `source` column yet
- `psql -d porter -c "SELECT trigger_type, status, COUNT(*) FROM agent_jobs GROUP BY trigger_type, status"` — 100 pending learning_session jobs, 0 source=system jobs

### Secondary (MEDIUM confidence)

- PostgreSQL documentation pattern: `SELECT FOR UPDATE SKIP LOCKED` — confirmed as the canonical advisory-lock-free queue claim pattern for single-process schedulers
- Drizzle ORM docs: ADD COLUMN with DEFAULT — standard PostgreSQL pattern, no risk of breaking existing rows

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; everything is extensions of existing patterns
- Architecture: HIGH — directly derived from reading scheduler.ts, schema.ts, and bridge admin route
- Pitfalls: HIGH — derived from actual live DB state (100 pending jobs) and direct schema inspection

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable — schema and scheduler patterns change only with explicit phase work)
