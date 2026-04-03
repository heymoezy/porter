# Phase 35: Agent Evolution Loop - Research

**Researched:** 2026-04-02
**Domain:** Skill evolution analysis, background job patterns, admin UI for supervised mutation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
- Background job interval (6 hours per success criteria)
- skill_evolution_proposals table schema (proposed_change JSONB, reasoning, triggering_feedback_ids, status)
- Recommendation types: add skill, remove skill, rewrite prompt, enrich examples
- Admin UI for pending proposals with diffs and approve/reject buttons
- Evolution event log timeline
- Approval flow: updates persona_skills, regenerates SKILLS.md, logs event

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EVO-01 | Background job (every 6h) analyzes feedback patterns, generates skill recommendations | Scheduler tick pattern at `INTEL_EXTRACTION_INTERVAL = 10800` (10800 × 2s = 6h) is the exact template; `intelligence-loop.ts` shows how to structure a pure analytics service |
| EVO-02 | Recommendations stored as proposed changes visible in admin UI with diffs | New `skill_evolution_proposals` table needed; migration pattern follows `migrate-fbk-v1.ts`; admin route added to `admin/backend/src/routes/skills.ts` |
| EVO-03 | Admin can approve or reject proposed skill changes | `PATCH /api/admin/skills/proposals/:id` with `{action: "approve"|"reject"}`; pattern from existing mutation routes in agents.ts/skills.ts |
| EVO-04 | Approved changes update persona_skills and regenerate SKILLS.md | `writeSkillsManifest()` in `backend/src/services/skills-manifest.ts` is already the canonical function; persona_skills UPDATE is a raw pool.query |
| EVO-05 | Evolution events logged (what changed, why, which feedback cluster triggered it) | New `skill_evolution_events` table OR append to `agent_activity` table; agent_activity follows the same shape (agent_id, event_type, summary, detail JSONB) |
</phase_requirements>

---

## Summary

Phase 35 closes the live skills feedback loop: feedback stored in Phase 34 now drives concrete, admin-reviewable recommendations. The work splits into three parts — a background analysis service, a new DB table + API for proposals, and a minimal admin UI panel.

The project already has all the building blocks. The scheduler has a 6-hour background analysis slot (`INTEL_EXTRACTION_INTERVAL`) that fires `extractIntelligencePatterns()` — a pure analytics function. The new evolution analyzer follows exactly the same shape: tick hook in `scheduler.ts`, standalone service in `backend/src/services/`, DB writes to a new proposals table. The migration pattern, the admin route pattern, the `writeSkillsManifest()` call, and the `agent_activity` log pattern are all in production and proven.

The admin UI is React Router 7 + shadcn/ui. Phase 34 added an "Effectiveness" view to the BUILD tab of `agent-detail.tsx`. The new Evolution UI fits either as a dedicated route (`/forge` tab extension or a new top-level `/evolution` page) or as an additional tab on the Skills page at `/skills`. Based on the sidebar structure and the fact that this is an operational review surface, the Skills page is the best home — it already manages skill assignments and shows quality data.

**Primary recommendation:** Model the background service on `intelligence-loop.ts`. Add proposals table via a dedicated `migrate-evo-v1.ts`. Expose proposals via `admin/backend/src/routes/skills.ts` (extend existing file). Build the review UI as a new tab section on `admin/frontend/app/routes/skills.tsx`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (pool) | project-pinned | All DB queries in backend services | Every existing service uses `pool.query()` directly — no ORM in services |
| `uuid` (v4) | project-pinned | IDs for new table rows | Every migration and service uses `uuidv4()` |
| `@tanstack/react-query` | project-pinned | Data fetching + cache invalidation in admin frontend | All admin pages use `useQuery` + `useMutation` |
| `shadcn/ui` | project-pinned | UI components (Button, Badge, Card, Tabs) | Immutable rule: no hand-coded components |
| Playwright (JS) | project version | Integration tests | All phase tests use `tests/*.spec.js` pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | project-pinned | Icons | Every icon in admin frontend comes from lucide |
| `fs/promises` | Node built-in | Writing SKILLS.md to disk | Already used in `skills-manifest.ts` |

**No new dependencies required.** Everything needed is already in the project.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
backend/src/db/
└── migrate-evo-v1.ts           # skill_evolution_proposals + skill_evolution_events tables

backend/src/services/
└── evolution-analyzer.ts       # analyzeSkillFeedback() — pure analytics, no side effects on its own

backend/src/routes/v1/
└── (no new routes needed)      # EVO changes are admin-only, not public API

admin/backend/src/routes/
└── skills.ts                   # EXTEND: add /proposals, /proposals/:id, /proposals/:id/approve|reject

admin/frontend/app/routes/
└── skills.tsx                  # EXTEND: add Evolution tab with proposals list + diff view

tests/
└── skill-evolution.spec.js     # Wave 0 scaffold, EVO-01 through EVO-05
```

### Pattern 1: Scheduler Hook (6-hour cadence)

**What:** Add a new interval constant and a tick branch in `scheduler.ts` that calls the analyzer service.
**When to use:** Any background analytical job that must not block normal agent scheduling.

Existing reference pattern (intelligence-loop):
```typescript
// Source: backend/src/services/scheduler.ts
const INTEL_EXTRACTION_INTERVAL = 10800; // 10800 ticks × 2s = 6h

// In tick():
if (tickCount > 0 && tickCount % INTEL_EXTRACTION_INTERVAL === 0) {
  extractIntelligencePatterns().catch(err =>
    console.error('[scheduler:intel] extraction error:', err)
  );
}
```

New evolution hook follows the identical pattern:
```typescript
const EVO_ANALYSIS_INTERVAL = 10800; // 6h

// In tick():
if (tickCount > 0 && tickCount % EVO_ANALYSIS_INTERVAL === 0) {
  analyzeSkillEvolution().catch(err =>
    console.error('[scheduler:evo] analysis error:', err)
  );
}
```

### Pattern 2: Migration File

**What:** Separate `migrate-evo-v1.ts` following the established pattern.
**When to use:** Any new table that belongs to a named phase.

```typescript
// Source: backend/src/db/migrate-fbk-v1.ts (reference)
export async function migrateEvoV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '035_skill_evolution_proposals'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_evolution_proposals (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        change_type TEXT NOT NULL,     -- 'add_skill'|'remove_skill'|'rewrite_prompt'|'enrich_examples'
        proposed_change JSONB NOT NULL,
        reasoning TEXT NOT NULL,
        triggering_feedback_ids TEXT[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'approved'|'rejected'
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
        reviewed_at DOUBLE PRECISION,
        reviewed_by TEXT
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sep_persona_status
        ON skill_evolution_proposals (persona_id, status)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_evolution_events (
        id TEXT PRIMARY KEY,
        persona_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        proposal_id TEXT,
        change_type TEXT NOT NULL,
        change_detail JSONB NOT NULL,
        triggered_by TEXT[] NOT NULL DEFAULT '{}',
        effectiveness_before DOUBLE PRECISION,
        effectiveness_after DOUBLE PRECISION,
        created_at DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await client.query(`INSERT INTO schema_migrations (id) VALUES ('035_skill_evolution_proposals')`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

Must be imported and called in the consolidated migration boot sequence (wherever `migrateFbkV1` is called).

### Pattern 3: Analytics Service

**What:** Pure function that reads feedback data, generates proposals, and writes to DB. No side effects on persona_skills until a proposal is approved.
**When to use:** Background analysis that should never auto-mutate live data.

```typescript
// Source pattern: backend/src/services/intelligence-loop.ts
export async function analyzeSkillEvolution(): Promise<void> {
  // 1. Query skill_feedback_events for agents that have enough data
  //    (min 5 events per skill, last 30 days)
  // 2. For each agent+skill combination, compute signal:
  //    - negative rate > 60% + min 5 events → candidate for 'remove_skill'
  //    - positive rate > 80% + times_selected < 5 → candidate for 'enrich_examples'
  //    - negative rate 40-60% → candidate for 'rewrite_prompt'
  //    - agent has <2 assigned skills + related skills exist → 'add_skill'
  // 3. Dedup: skip if pending proposal already exists for same persona+skill+change_type
  // 4. Insert into skill_evolution_proposals
  // 5. Log summary to console
}
```

**Minimum evidence threshold:** 5 feedback events per skill per agent before generating any proposal. This prevents noise from single-use dispatches.

**Dedup check:** Before inserting a proposal, verify no `pending` proposal already exists for `(persona_id, skill_id, change_type)`. Same pattern as `isDuplicate()` in `intelligence-loop.ts`.

### Pattern 4: Admin API Routes

**What:** Three new endpoints added to the existing `admin/backend/src/routes/skills.ts`.
**When to use:** All proposal management is admin-only and belongs with skill management.

```
GET  /api/admin/skills/proposals          # list with filters: ?status=pending&persona_id=...
GET  /api/admin/skills/proposals/:id      # single proposal with full detail
POST /api/admin/skills/proposals/:id/approve  # approve → mutate persona_skills + regen SKILLS.md
POST /api/admin/skills/proposals/:id/reject   # reject → update status only
```

The approve endpoint must:
1. Fetch the proposal
2. Apply the `proposed_change` to `persona_skills` (INSERT/UPDATE/DELETE row)
3. Call `writeSkillsManifest(personaId, personaName)` from `backend/src/services/skills-manifest.ts`
4. Insert a row into `skill_evolution_events`
5. Update proposal `status = 'approved'`, `reviewed_at`, `reviewed_by`

**IMPORTANT:** `admin/backend` connects to the same PostgreSQL as `backend`. The `writeSkillsManifest` function lives in `backend/src/services/skills-manifest.ts` and uses `pool` from `backend/src/db/client.ts`. The admin backend has its own DB connection (`admin/backend/src/db/pg.ts`). Two options:

- **Option A (simpler):** Duplicate or inline the SKILLS.md generation logic inside the admin approval route. The function is small (~80 lines). Copy, don't import across backends.
- **Option B (cleaner):** Expose an internal API endpoint on port 3001 that admin calls after approval. Overhead for a small function.

**Recommendation:** Option A. The function is pure filesystem + DB — copy it into admin's skills route for now. Phase 37+ can unify.

### Pattern 5: Admin UI — Proposals Review Panel

**What:** A new section within the existing Skills page (`admin/frontend/app/routes/skills.tsx`) showing pending proposals grouped by agent, with diff display and approve/reject actions.
**When to use:** Operational review surfaces belong near the data they govern (skills page).

Key UI components to use:
- `Badge` — proposal status (`pending`, `approved`, `rejected`)
- `Button` — approve (primary/success) + reject (destructive variant)
- `Card` — each proposal card
- `Tabs` — add "Evolution" tab to the skills page top-level tabs
- `useMutation` from react-query — for approve/reject with optimistic updates

The diff view for a proposal can be a simple two-column before/after display using `<pre>` with monospace styling (no external diff library needed for this phase).

### Pattern 6: Evolution Event Log

**What:** A timeline view of all approved/rejected proposals ordered by `created_at`.
**When to use:** Show on the same Evolution tab, below the pending proposals section.

Query pattern:
```sql
SELECT e.*, p.name AS persona_name, s.name AS skill_name
FROM skill_evolution_events e
LEFT JOIN personas p ON p.id = e.persona_id
LEFT JOIN skills s ON s.id = e.skill_id
ORDER BY e.created_at DESC
LIMIT 50
```

### Anti-Patterns to Avoid

- **Auto-approving proposals:** The entire point of this phase is supervised mutation. The background job writes proposals; humans approve. Never auto-apply.
- **Generating proposals with < 5 data points:** Noise prevention is critical. Random negative feedback on a single dispatch should not trigger a "remove skill" recommendation.
- **Calling `writeSkillsManifest` without verifying the persona exists:** Check persona exists before regenerating SKILLS.md or it creates orphaned files.
- **Using agent_activity table for evolution events:** agent_activity is for job/dispatch events. Evolution events are a separate semantic and need their own table for clean querying.
- **Cross-importing between `backend/` and `admin/backend/`:** These are independent processes. No module imports across the boundary.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SKILLS.md regeneration | Custom manifest writer | `writeSkillsManifest()` in `skills-manifest.ts` | Already handles grouping, disabled skills, formatting |
| 6-hour job scheduling | Custom setInterval or cron | Extend existing `scheduler.ts` tick loop | Tick loop is already running; adding a hook is 3 lines |
| DB connection in admin | New pool setup | `admin/backend/src/db/pg.ts` queryAll/execute helpers | Already exists, follows same pattern |
| Frontend data fetching | Manual fetch + useState | `useQuery` + `useMutation` from react-query | Established pattern on every admin page |
| Diff display | External diff library | Two-column before/after with `<pre>` | Proposals are JSONB, not source files — a simple display suffices |

---

## Common Pitfalls

### Pitfall 1: Proposal Explosion on Cold Start
**What goes wrong:** First run of the analyzer has access to all historical feedback events. If thresholds are too low, it generates dozens of proposals at once, overwhelming the admin.
**Why it happens:** No lookback window or deduplication on first run.
**How to avoid:** Always check for existing `pending` proposals before inserting. Use the same `isDuplicate()` guard as `intelligence-loop.ts`. Also enforce a minimum recency window (e.g., only analyze feedback from last 30 days).
**Warning signs:** `skill_evolution_proposals` count spikes > 10 immediately after first run.

### Pitfall 2: `writeSkillsManifest` Targeting Wrong personas Directory
**What goes wrong:** SKILLS.md written to wrong path, or written for a persona that has since been deleted.
**Why it happens:** `skills-manifest.ts` uses `process.env.HOME + '/documents/porter/personas'` as a hardcoded base. If the admin backend runs in a different env, HOME may differ.
**How to avoid:** When copying the manifest logic into admin, use `config.personasDir` (already defined in `admin/backend/src/config.ts`) or read it from env like the Brain service does.
**Warning signs:** SKILLS.md not found after approval, or written to unexpected path.

### Pitfall 3: approval endpoint not re-querying after persona_skills mutation
**What goes wrong:** Approval applies the change but the admin UI still shows the old skill list until hard refresh.
**Why it happens:** react-query cache not invalidated after mutation.
**How to avoid:** In `useMutation`'s `onSuccess`, call `queryClient.invalidateQueries(['admin', 'skills', 'proposals'])` and also `queryClient.invalidateQueries(['admin', 'agents', personaId])`.

### Pitfall 4: `change_type = 'add_skill'` with a skill_id that doesn't exist in skills table
**What goes wrong:** Proposal recommends adding a skill the system doesn't know about.
**Why it happens:** Analyzer might generate skill suggestions from feedback notes (unstructured text).
**How to avoid:** For this phase, only generate proposals for skills that already exist in the `skills` table. The `add_skill` change type should reference existing skill IDs, not new ones.

### Pitfall 5: Tick count resets on restart causing double-fire
**What goes wrong:** After a service restart, `tickCount` resets to 0. The next 6-hour mark fires sooner than expected if the scheduler was already partway through a cycle.
**Why it happens:** `tickCount` is in-memory only.
**How to avoid:** The existing scheduler already has this behavior for `extractIntelligencePatterns` — it's accepted. The same tolerance applies here. Proposals table dedup prevents duplicate proposals even if the job fires twice.

---

## Code Examples

### Migration Registration (where to add the call)
```typescript
// Source: backend/src/db/index.ts or wherever migrateFbkV1 is called
// Find: await migrateFbkV1(pool);
// Add after:
import { migrateEvoV1 } from './migrate-evo-v1.js';
// ...
await migrateEvoV1(pool);
```

Check actual migration boot file:
```bash
grep -r "migrateFbkV1\|migrateQltV1" /home/lobster/projects/porter/backend/src/ --include="*.ts"
```

### Deduplication Guard (from intelligence-loop.ts pattern)
```typescript
// Source: backend/src/services/intelligence-loop.ts
async function isDuplicateProposal(
  personaId: string,
  skillId: string,
  changeType: string
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM skill_evolution_proposals
     WHERE persona_id = $1
       AND skill_id = $2
       AND change_type = $3
       AND status = 'pending'
     LIMIT 1`,
    [personaId, skillId, changeType]
  );
  return rows.length > 0;
}
```

### Admin Approve Endpoint Pattern
```typescript
// Source pattern: admin/backend/src/routes/agents.ts (mutation endpoints)
fastify.post('/proposals/:id/approve', async (req, reply) => {
  const { id } = req.params as { id: string };
  const username = (req as any).user?.username ?? 'unknown';

  const proposal = await queryOne<any>(
    `SELECT * FROM skill_evolution_proposals WHERE id = $1 AND status = 'pending'`,
    [id]
  );
  if (!proposal) return reply.code(404).send(err('NOT_FOUND', 'Proposal not found or already reviewed'));

  // Apply proposed_change to persona_skills...
  // ...change_type-specific logic...

  // Regenerate SKILLS.md
  await writeSkillsManifestAdmin(proposal.persona_id);

  // Log evolution event
  await execute(
    `INSERT INTO skill_evolution_events
       (id, persona_id, skill_id, proposal_id, change_type, change_detail, triggered_by, effectiveness_before)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [uuidv4(), proposal.persona_id, proposal.skill_id, id,
     proposal.change_type, JSON.stringify(proposal.proposed_change),
     proposal.triggering_feedback_ids, proposal.proposed_change.effectiveness_before ?? null]
  );

  // Update proposal status
  await execute(
    `UPDATE skill_evolution_proposals
     SET status = 'approved', reviewed_at = EXTRACT(EPOCH FROM NOW()), reviewed_by = $1
     WHERE id = $2`,
    [username, id]
  );

  return reply.send(ok({ approved: true }));
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-authored SKILLS.md | Auto-generated from DB via `writeSkillsManifest()` | Phase 31 | SKILLS.md is now a build artifact, not source |
| JSONB arrays on templates | `template_skills` junction table | Phase 31 | Clean relational model, queryable |
| No feedback data | `skill_feedback_events` + `persona_skills` counters | Phase 34 | All signal needed for EVO analysis now exists |
| No scheduler analytics | `extractIntelligencePatterns()` on 6h tick | Phase ~25 | Pattern for analytics-only background jobs exists |

**Phase 34 is complete and the data is live.** `skill_feedback_events` and `persona_skills` effectiveness scores are populated on every dispatch with thumbs feedback. Phase 35 reads this data.

---

## Open Questions

1. **Where does the evolution analysis live: `backend/` or `admin/backend/`?**
   - What we know: The scheduler lives in `backend/`. Admin has no scheduler. The analyzer needs to write proposals to DB.
   - What's unclear: Should admin trigger analysis on-demand (button) in addition to the background 6h job?
   - Recommendation: Background job in `backend/` (via scheduler). Add a "Run now" endpoint in admin (`POST /api/admin/skills/evolution/analyze`) that calls the same analyzer function on-demand. This satisfies the 6h cadence requirement and gives admin manual trigger capability.

2. **What is the minimum feedback threshold for "remove_skill" proposals?**
   - What we know: The requirement says "analyzes feedback patterns" — no specific threshold defined.
   - Recommendation: Use 5 events minimum (noise floor), 60% negative rate for remove, 40-60% for rewrite. Document these thresholds as constants at the top of `evolution-analyzer.ts` so they're easy to tune.

3. **Does the effectiveness_after field get populated?**
   - What we know: Evolution events have `effectiveness_before` and `effectiveness_after` columns.
   - What's unclear: `effectiveness_after` can only be computed some time after the approval, when new feedback arrives.
   - Recommendation: Store `effectiveness_before` at approval time. Leave `effectiveness_after = NULL` initially. The next analyzer run can backfill it: for each `approved` event older than 7 days with NULL `effectiveness_after`, compute current effectiveness and update.

---

## Validation Architecture

> `nyquist_validation` is `true` in config.json — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Node.js, CommonJS) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/projects/porter/tests && npx playwright test skill-evolution.spec.js` |
| Full suite command | `cd /home/lobster/projects/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVO-01 | DB: `skill_evolution_proposals` table exists with correct columns | unit (psql) | `npx playwright test skill-evolution.spec.js --grep "EVO-01"` | Wave 0 |
| EVO-01 | Background analyzer creates proposals from feedback data | integration | `npx playwright test skill-evolution.spec.js --grep "EVO-01"` | Wave 0 |
| EVO-02 | `GET /api/admin/skills/proposals` returns pending proposals array | API | `npx playwright test skill-evolution.spec.js --grep "EVO-02"` | Wave 0 |
| EVO-03 | `POST /api/admin/skills/proposals/:id/approve` returns 200 | API | `npx playwright test skill-evolution.spec.js --grep "EVO-03"` | Wave 0 |
| EVO-03 | `POST /api/admin/skills/proposals/:id/reject` returns 200 | API | `npx playwright test skill-evolution.spec.js --grep "EVO-03"` | Wave 0 |
| EVO-04 | After approval, persona_skills reflects the change | integration | `npx playwright test skill-evolution.spec.js --grep "EVO-04"` | Wave 0 |
| EVO-04 | After approval, SKILLS.md on disk is regenerated | integration | `npx playwright test skill-evolution.spec.js --grep "EVO-04"` | Wave 0 |
| EVO-05 | `skill_evolution_events` has a row after approval | unit (psql) | `npx playwright test skill-evolution.spec.js --grep "EVO-05"` | Wave 0 |
| EVO-05 | Admin Evolution tab shows event timeline | UI | `npx playwright test skill-evolution.spec.js --grep "EVO-05"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/projects/porter/tests && npx playwright test skill-evolution.spec.js`
- **Per wave merge:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/skill-evolution.spec.js` — EVO-01 through EVO-05, all `.skip(true, 'TODO: ...')` until each wave ships

*(Existing `tests/skill-feedback.spec.js` covers Phase 34 / FBK-01 through FBK-05. New file needed for Phase 35.)*

---

## Sources

### Primary (HIGH confidence)
- `backend/src/services/scheduler.ts` — tick loop, INTEL_EXTRACTION_INTERVAL pattern, job execution
- `backend/src/services/intelligence-loop.ts` — analytics service pattern, dedup guard
- `backend/src/services/skills-manifest.ts` — `writeSkillsManifest()` and `generateSkillsManifest()`
- `backend/src/db/migrate-fbk-v1.ts` — migration file convention, idempotency pattern
- `backend/src/db/schema.ts` — `personaSkills`, `skillFeedbackEvents`, `skills` table shapes
- `backend/src/routes/v1/feedback.ts` — existing feedback data shape in DB
- `admin/backend/src/routes/skills.ts` — admin skills route, where to add proposals endpoints
- `admin/backend/src/routes/agents.ts` — mutation endpoint patterns (approve/reject shape)
- `admin/frontend/app/routes/agent-detail.tsx` — BUILD tab pattern, effectiveness UI location
- `admin/frontend/app/routes.ts` — React Router 7 route registration
- `tests/skill-feedback.spec.js` — Phase 34 test scaffold pattern (exact test file structure to copy)

### Secondary (MEDIUM confidence)
- `admin/backend/src/services/skill-library.ts` — confirms SKILLS_ROOT path resolution, `computePackDiagnostics` shows analytics structure

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all patterns verified in production code
- Architecture: HIGH — direct code inspection of all integration points
- Pitfalls: HIGH — identified from code patterns and Phase 31-34 decisions in STATE.md
- Test architecture: HIGH — existing `skill-feedback.spec.js` confirms exact file/pattern to follow

**Research date:** 2026-04-02
**Valid until:** Stable (no external dependencies, all internal patterns)
