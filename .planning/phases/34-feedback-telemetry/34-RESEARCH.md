# Phase 34: Feedback Telemetry - Research

**Researched:** 2026-04-02
**Domain:** Skill feedback signals, aggregated effectiveness metrics, admin UI surfaces
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key areas:
- skill_feedback_events table schema (persona_id, skill_id, dispatch_id, event_type, note)
- Feedback event types: positive/negative/correction/retry/abandon/success
- Thumbs up/down creates feedback events for all active skills in that dispatch
- Aggregated stats on persona_skill rows: times_selected, times_completed, positive/negative counts, effectiveness_score
- API endpoints: GET /api/admin/skills/:id/effectiveness, GET /api/admin/agents/:id/skill-effectiveness
- Admin UI surfaces for effectiveness data (skill detail, agent detail, template detail pages)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FBK-01 | skill_feedback_events table captures per-dispatch skill effectiveness signals | Schema design in Standard Stack section; migration pattern confirmed from migrate-rts-v1.ts |
| FBK-02 | Each persona_skill record tracks times_selected, times_completed, positive/negative counts, last_used_at, effectiveness_score | ALTER TABLE migration on persona_skills; computed score formula documented |
| FBK-03 | Thumbs up/down on a dispatch response stores a skill_feedback_event linked to selected skills | dispatch_id must surface in SSE done event; chat-panel.tsx needs ThumbsUp/Down UI |
| FBK-04 | Skill effectiveness scores aggregated and queryable per skill, per agent, per template | Aggregation query patterns documented; on-read approach recommended |
| FBK-05 | Admin UI shows effectiveness metrics on skill detail, agent detail, and template detail pages | Existing route files identified; React Query patterns confirmed |
</phase_requirements>

---

## Summary

Phase 34 builds the feedback persistence layer for skill effectiveness measurement. The core mechanic is: every completed dispatch already logs `skills_used` JSONB in `bridge_dispatch_log` (Phase 33); Phase 34 adds a feedback event table that links user thumbs-up/down signals to the specific skills that were active in that dispatch. From those events, aggregated counters on `persona_skills` rows surface live effectiveness scores.

The main architectural challenge is the **dispatch_id lifecycle**: the dispatch ID is generated inside `logDispatch()` in the routing engine and is currently never surfaced back to the chat client through the SSE stream. To enable thumbs-up/down to link back to a dispatch, the `done` SSE event must include the dispatch log ID. This is a one-line change in `routing-engine.ts` (return the ID from `logDispatch`) and a corresponding emit in `routes/v1/chat.ts`.

The second challenge is **aggregation strategy**: computed on-read (pure SQL aggregation at query time) vs. maintained counters on `persona_skills`. Given the volume (hundreds of dispatches, not millions), the recommended approach is maintained counters on `persona_skills` — updated atomically when a feedback event is inserted. This avoids expensive aggregation queries in the admin UI and keeps effectiveness scores trivially queryable. The `effectiveness_score` is a float computed from `positive_feedback_count / (positive_feedback_count + negative_feedback_count)` clamped to [0.0, 1.0], defaulting to NULL when no feedback exists.

**Primary recommendation:** Add `dispatch_id` to SSE done events, create `skill_feedback_events` table + migration, add counter columns to `persona_skills` via migration, expose feedback POST and effectiveness GET endpoints in admin routes, and add ThumbsUp/Down UX to chat-panel.tsx and admin detail pages.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (Pool) | existing | Raw PostgreSQL queries | Already used in all Brain + Admin routes |
| Drizzle ORM | existing | Schema type definitions | All existing tables follow this pattern |
| React Query (`@tanstack/react-query`) | existing | Frontend data fetching | Used on all admin detail pages |
| shadcn/ui (`Badge`, `Card`, `Button`) | existing | Admin UI components | Established pattern; no hand-styled forms |
| `lucide-react` | existing | Icons (ThumbsUp, ThumbsDown) | All admin UI icons come from lucide-react |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `uuidv4` | existing | Generate feedback event IDs | Already used in routing-engine.ts |
| `node-pg` raw SQL | existing | Atomic counter increments | `UPDATE ... SET counter = counter + 1` is simpler than Drizzle for hot paths |

### Installation
No new packages required. All dependencies are present.

---

## Architecture Patterns

### Recommended Project Structure

New files this phase:
```
backend/src/db/
└── migrate-fbk-v1.ts          # skill_feedback_events table + persona_skills counter columns

backend/src/routes/v1/
└── feedback.ts                 # POST /api/v1/feedback/:dispatchId (create feedback event)

admin/backend/src/routes/
└── (extend) skills.ts          # GET /:id/effectiveness
└── (extend) agents.ts          # GET /:id/skill-effectiveness
└── (extend) templates.ts       # GET /:id/skill-effectiveness

admin/frontend/app/
└── (extend) chat-panel.tsx     # ThumbsUp/ThumbsDown on assistant messages
└── (extend) skill-pack-explorer.tsx  # Effectiveness stats panel
└── (extend) agent-detail.tsx   # Skills tab effectiveness column
└── (extend) template-detail.tsx      # Skills tab effectiveness column
└── components/
    └── skill-effectiveness-bar.tsx   # Reusable component
```

### Pattern 1: Migration File Naming

Phase 33 used `migrate-rts-v1.ts` with migration ID `'033_dispatch_log_skills_used'`. Phase 34 should follow the same pattern:

```typescript
// Source: migrate-rts-v1.ts (existing convention)
export async function migrateFbkV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '034_skill_feedback_events'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }
    // ... DDL here ...
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('034_skill_feedback_events')`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

Called in `backend/src/index.ts` after `await migrateRtsV1(pool)`.

### Pattern 2: skill_feedback_events Table Schema

```sql
CREATE TABLE skill_feedback_events (
  id            TEXT PRIMARY KEY,
  persona_id    TEXT NOT NULL,             -- references personas.id
  skill_id      TEXT NOT NULL,             -- references skills.id
  dispatch_id   TEXT NOT NULL,             -- references bridge_dispatch_log.id
  event_type    TEXT NOT NULL,             -- positive | negative | correction | retry | abandon | success
  note          TEXT,
  created_at    DOUBLE PRECISION NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE INDEX idx_sfe_persona_skill ON skill_feedback_events(persona_id, skill_id);
CREATE INDEX idx_sfe_dispatch    ON skill_feedback_events(dispatch_id);
```

No FK constraints — consistent with existing schema.ts conventions (no Drizzle `.references()` on hot-path tables except sessions/chats).

### Pattern 3: Counter Columns on persona_skills (ALTER TABLE migration)

```sql
ALTER TABLE persona_skills
  ADD COLUMN IF NOT EXISTS times_selected         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_completed        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positive_feedback_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_feedback_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS effectiveness_score    DOUBLE PRECISION;
-- effectiveness_score: NULL until first feedback, then positive/(positive+negative)
```

Both migrations go in the same `migrate-fbk-v1.ts` file under a single transaction + single migration ID.

### Pattern 4: Surfacing dispatch_id in SSE done event

The routing engine generates the dispatch ID in `logDispatch()` but returns a `Promise<string>` that is never awaited. The change is minimal:

```typescript
// In routing-engine.ts wrappedStream generator (after logging):
// 1. Await logDispatch and capture the returned id
const dispatchId = await self.logDispatch(decision, ctx, result);
// 2. Yield it as a custom SSE field — this requires the generator to be modified
// OR: pass dispatchId back via a side-channel ref stored on ctx
```

The cleanest approach: `logDispatch` already returns `id` (the `uuidv4()` generated at the start of the function). Currently, `self.logDispatch(...).catch(() => {})` discards it. Change to capture the id and store it in a `ref` object passed into the streaming generator so `chat.ts` can include it in the `done` event:

```typescript
// routes/v1/chat.ts — done event
reply.raw.write(`data: ${JSON.stringify({
  done: true,
  backend: modelLabel,
  full_response: fullResponse,
  dispatch_id: dispatchIdRef.current,  // NEW in Phase 34
})}\n\n`);
```

The `chat-panel.tsx` receives this in the SSE data parser and stores it on the assistant message.

### Pattern 5: Feedback Endpoint (Brain v1 API)

```typescript
// POST /api/v1/feedback/:dispatchId
// Body: { event_type: 'positive' | 'negative', note?: string }
// Auth: requireSession (user-facing, same as chat)
// Action:
//   1. Load bridge_dispatch_log.skills_used for this dispatch_id
//   2. Load agent_id from same row
//   3. For each selected skill in skills_used.selected:
//      a. INSERT skill_feedback_events
//      b. UPDATE persona_skills SET counter = counter + 1
//         (positive_feedback_count or negative_feedback_count based on event_type)
//         SET effectiveness_score = positive/(positive+negative) WHERE positive+negative > 0
//   4. Return { created: N }
```

### Pattern 6: Effectiveness Aggregation Queries

Per-skill effectiveness (admin route):
```sql
SELECT
  ps.skill_id,
  s.name,
  ps.times_selected,
  ps.times_completed,
  ps.positive_feedback_count,
  ps.negative_feedback_count,
  ps.effectiveness_score,
  ps.last_used_at
FROM persona_skills ps
JOIN skills s ON s.id = ps.skill_id
WHERE ps.skill_id = $1
ORDER BY ps.effectiveness_score DESC NULLS LAST;
```

Per-agent skill effectiveness (admin route):
```sql
SELECT
  ps.skill_id,
  s.name,
  ps.times_selected,
  ps.positive_feedback_count,
  ps.negative_feedback_count,
  ps.effectiveness_score
FROM persona_skills ps
JOIN skills s ON s.id = ps.skill_id
WHERE ps.persona_id = $1
ORDER BY ps.effectiveness_score DESC NULLS LAST;
```

Per-template skill effectiveness (join through template_skills and personas):
```sql
SELECT
  ts.skill_id,
  s.name,
  SUM(ps.times_selected)          AS times_selected,
  SUM(ps.positive_feedback_count) AS positive_count,
  SUM(ps.negative_feedback_count) AS negative_count,
  CASE
    WHEN SUM(ps.positive_feedback_count + ps.negative_feedback_count) > 0
    THEN ROUND(SUM(ps.positive_feedback_count)::numeric /
         SUM(ps.positive_feedback_count + ps.negative_feedback_count)::numeric, 3)
    ELSE NULL
  END AS effectiveness_score
FROM template_skills ts
JOIN skills s ON s.id = ts.skill_id
LEFT JOIN personas p ON p.template_id = $1
LEFT JOIN persona_skills ps ON ps.persona_id = p.id AND ps.skill_id = ts.skill_id
WHERE ts.template_id = $1
GROUP BY ts.skill_id, s.name
ORDER BY effectiveness_score DESC NULLS LAST;
```

### Pattern 7: Admin Endpoint Registration

Existing admin backend pattern (`admin/backend/src/routes/skills.ts`):

```typescript
// GET /:id/effectiveness — added to existing skillsRoutes
fastify.get('/:id/effectiveness', async (req, reply) => {
  const { id } = req.params as { id: string };
  const rows = await queryAll<EffectivenessRow>(
    `SELECT ps.persona_id, ps.skill_id, ps.times_selected,
            ps.positive_feedback_count, ps.negative_feedback_count,
            ps.effectiveness_score, ps.last_used_at
     FROM persona_skills ps
     WHERE ps.skill_id = $1`,
    [id]
  );
  return ok({ skillId: id, agents: rows });
});
```

### Anti-Patterns to Avoid

- **Don't aggregate on-read for every admin page load.** Maintained counters on `persona_skills` are the right call at this scale. On-read aggregation of `skill_feedback_events` would re-scan the events table on every page load.
- **Don't surface dispatch_id via a separate API call.** The SSE done event is the right moment — it already carries `backend` and `full_response`, so `dispatch_id` is additive, not a design change.
- **Don't add a FK constraint on skill_feedback_events.dispatch_id.** Bridge dispatch log rows can be purged; FK would block cleanup. Consistent with existing schema conventions.
- **Don't update effectiveness_score as a trigger.** Plain `UPDATE` in the feedback write path is simpler, more debuggable, and avoids PostgreSQL trigger complexity in a TypeScript-first codebase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Feedback event fan-out to multiple skills | Custom loop per skill with separate DB calls | Single multi-row INSERT + bulk UPDATE with `WHERE persona_id = $1 AND skill_id = ANY($2)` | Batch SQL is atomic and avoids N+1 |
| Effectiveness percentage display | Custom math in JSX | CSS bar component (reuse VitalsBar pattern) | VitalsBar already exists in the admin frontend |
| UUID for feedback event ID | crypto.randomUUID() | `uuidv4()` from uuid package | Already imported in routing-engine.ts; use consistently |
| Auth on Brain feedback endpoint | Custom session check | `requireSession` middleware already on all `/api/v1/` routes | Established pattern |

**Key insight:** The fan-out from one dispatch to N skill feedback events is inherently a write-once pattern — insert once, aggregate lazily. Over-engineering the aggregation pipeline is the primary risk in this phase.

---

## Common Pitfalls

### Pitfall 1: dispatch_id not available at thumbs-up time
**What goes wrong:** Chat panel sends feedback but can't link to a dispatch because the dispatch ID was never communicated to the frontend.
**Why it happens:** `logDispatch()` generates the UUID internally and currently discards it (fire-and-forget `.catch(() => {})`).
**How to avoid:** Modify the stream generator in `routing-engine.ts` to capture the `logDispatch` promise return value and thread it through to the SSE `done` event. Use a `{ current: string | null }` ref object passed into the generator closure.
**Warning signs:** If you find yourself trying to look up dispatch_id by `chat_id + timestamp`, you've taken the wrong path.

### Pitfall 2: skills_used.selected vs candidates confusion
**What goes wrong:** Feedback events created for ALL candidate skills (all 17 assigned), not just the selected 0-3.
**Why it happens:** `bridge_dispatch_log.skills_used` contains both `candidates` and `selected` arrays.
**How to avoid:** Read `skills_used.selected` only when fanning out feedback events. Candidates that were scored but not injected should not receive feedback signals.
**Warning signs:** An agent with 17 assigned skills receiving 17 feedback events per dispatch.

### Pitfall 3: persona_skills PK structure
**What goes wrong:** UPDATE to `persona_skills` counters fails because the WHERE clause uses wrong key column.
**Why it happens:** `persona_skills` has a composite PK of `(persona_id, skill_name)` defined in migration DDL, but `skill_id` is a newer column (Phase 31). Lookups must use `persona_id + skill_name` OR `persona_id + skill_id` with COALESCE.
**How to avoid:** For counter updates, use:
```sql
UPDATE persona_skills
SET positive_feedback_count = positive_feedback_count + 1,
    effectiveness_score = (positive_feedback_count + 1)::float / NULLIF(positive_feedback_count + 1 + negative_feedback_count, 0)
WHERE persona_id = $1 AND COALESCE(skill_id, skill_name) = $2
```
**Warning signs:** Zero rows updated on feedback write despite valid persona_id + skill_id.

### Pitfall 4: chat-panel.tsx dispatch_id timing
**What goes wrong:** ThumbsUp/Down rendered immediately on message but dispatch_id is only known after SSE stream completes.
**Why it happens:** SSE streams progressively, `dispatch_id` arrives in the `done` frame.
**How to avoid:** Store `dispatchId` on the ChatMessage object (nullable). Render thumbs-up/down as disabled while `dispatchId` is null, enable on receipt of `done` frame. This is a UX state machine: `pending → enabled`.

### Pitfall 5: Effectiveness score divide-by-zero
**What goes wrong:** Division by zero when both positive and negative counts are 0.
**Why it happens:** `positive / (positive + negative)` before any feedback.
**How to avoid:** Keep `effectiveness_score` as NULL until first feedback event. Use `NULLIF(positive + negative, 0)` in SQL. Display NULL as "No data yet" in the UI, not 0%.

---

## Code Examples

### Insert skill_feedback_events + update counters (atomic pattern)

```typescript
// Source: derived from routing-engine.ts INSERT pattern + persona_skills UPDATE pattern

async function recordFeedback(
  pool: pg.Pool,
  dispatchId: string,
  eventType: 'positive' | 'negative',
  note?: string,
): Promise<number> {
  // 1. Fetch dispatch skills_used + agent_id
  const { rows: dispatchRows } = await pool.query<{
    agent_id: string | null;
    skills_used: { selected: Array<{ skillId: string }> } | null;
  }>(
    `SELECT agent_id, skills_used FROM bridge_dispatch_log WHERE id = $1`,
    [dispatchId]
  );

  if (!dispatchRows[0]?.agent_id || !dispatchRows[0]?.skills_used?.selected?.length) {
    return 0;
  }

  const { agent_id: personaId, skills_used } = dispatchRows[0];
  const selectedSkills = skills_used.selected;

  // 2. Fan out: insert one event per selected skill
  let created = 0;
  for (const skill of selectedSkills) {
    const { v4: uuidv4 } = await import('uuid');
    await pool.query(
      `INSERT INTO skill_feedback_events (id, persona_id, skill_id, dispatch_id, event_type, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), personaId, skill.skillId, dispatchId, eventType, note ?? null]
    );

    // 3. Update counters atomically
    const col = eventType === 'positive' ? 'positive_feedback_count' : 'negative_feedback_count';
    await pool.query(
      `UPDATE persona_skills
       SET ${col} = ${col} + 1,
           effectiveness_score = CASE
             WHEN positive_feedback_count + negative_feedback_count + 1 > 0
             THEN (positive_feedback_count + CASE WHEN $3 = 'positive' THEN 1 ELSE 0 END)::float
                  / (positive_feedback_count + negative_feedback_count + 1)
             ELSE NULL
           END,
           last_used_at = EXTRACT(EPOCH FROM NOW())
       WHERE persona_id = $1
         AND COALESCE(skill_id, skill_name) = $2`,
      [personaId, skill.skillId, eventType]
    );
    created++;
  }

  return created;
}
```

**Note:** The effectiveness_score calculation in the UPDATE should be simplified to avoid off-by-one logic. Recommended: update the counter first, then recalculate from the new values in a second UPDATE, or compute it in application code and pass as a parameter. See Pitfall 3.

### SSE done event with dispatch_id (routing-engine.ts modification)

```typescript
// In selectStreamWithFallback generator, after logDispatch:
let capturedDispatchId: string | null = null;

// Change fire-and-forget to: capture ID then fire-and-forget rest
const dispatchLogPromise = self.logDispatch(decision, ctx, result);
dispatchLogPromise.then(id => { capturedDispatchId = id; }).catch(() => {});

// Then surface it via a ref that chat.ts passes in:
// (Pass { dispatchId: string | null } ref into the stream generator)
```

The simplest implementation: `logDispatch` already returns `Promise<string>`. The streaming generator uses `async function*` so it can `await` the logDispatch call — removing the `.catch(() => {})` fire-and-forget and instead doing:

```typescript
const dispatchId = await self.logDispatch(decision, ctx, result).catch(() => null);
// Then this is available to be included in the done event
```

This adds minimal latency only after the stream completes (the logDispatch DB write is already happening at this point anyway).

### Skill effectiveness component (admin UI)

```tsx
// admin/frontend/app/components/skill-effectiveness-bar.tsx
// Reusable — used on skill detail, agent detail, template detail

interface EffectivenessProps {
  positive: number;
  negative: number;
  score: number | null;
  timesSelected: number;
}

export function SkillEffectivenessBar({ positive, negative, score, timesSelected }: EffectivenessProps) {
  if (score === null) {
    return <span className="text-xs text-text3">No data</span>;
  }
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded bg-surface overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text2">{pct}%</span>
      <span className="text-2xs text-text3">({positive}↑ {negative}↓)</span>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No feedback persistence | skill_feedback_events table | Phase 34 | Skills can now be measured |
| persona_skills has no counters | counters + effectiveness_score column | Phase 34 | Aggregated metrics trivially queryable |
| dispatch_id discarded after logging | dispatch_id surfaced in SSE done event | Phase 34 | Enables client-side feedback linking |
| thumbs-up/down not implemented | chat-panel.tsx ThumbsUp/ThumbsDown UX | Phase 34 | User feedback captured |

---

## Open Questions

1. **Where does the feedback API live — Brain (`/api/v1/`) or Admin (`/api/admin/`)?**
   - What we know: Brain owns all dispatch logic and session auth. Admin owns all analytics surfaces.
   - What's unclear: The chat UI (which submits thumbs-up/down) proxies through Admin to Brain. Feedback write could go directly to Brain's v1 API (where session auth exists) or through Admin (which already proxies chat).
   - Recommendation: POST feedback to the Brain's `/api/v1/feedback/:dispatchId` endpoint directly (same session cookie pattern as chat). Admin routes only need GET endpoints for analytics. This avoids a double-proxy and keeps writes close to the data.

2. **Should `times_selected` and `times_completed` on persona_skills be updated in the dispatch path (Phase 33) or the feedback path?**
   - What we know: Phase 33 selects skills and logs `skills_used` in bridge_dispatch_log. Phase 33's routing engine `logDispatch` already has access to `ctx.skillsUsed`.
   - What's unclear: Phase 33 is "complete" — touching routing-engine.ts for Phase 34 is acceptable (dispatch_id surface), but scope creep risk.
   - Recommendation: Update `times_selected` in the dispatch path (inside `logDispatch` when `ctx.skillsUsed.selected.length > 0`). Update `times_completed` in the feedback path alongside the feedback event. This gives "selected" a meaning independent of feedback and "completed" meaning "user acknowledged the response."

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Node.js) |
| Config file | `tests/playwright.config.js` |
| Quick run command | `cd /home/lobster/projects/porter/tests && npx playwright test skill-feedback.spec.js --grep FBK` |
| Full suite command | `cd /home/lobster/projects/porter/tests && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FBK-01 | skill_feedback_events table exists with correct columns | API smoke | `curl -s http://127.0.0.1:3001/api/v1/feedback/nonexistent` returns 404 not 500 | ❌ Wave 0 |
| FBK-02 | persona_skill row has times_selected, positive/negative counts, effectiveness_score columns | DB check | `psql -d porter -c "SELECT times_selected, effectiveness_score FROM persona_skills LIMIT 1"` | ❌ Wave 0 |
| FBK-03 | Thumbs up/down on chat response creates feedback events | Playwright UI | `npx playwright test skill-feedback.spec.js --grep FBK-03` | ❌ Wave 0 |
| FBK-04 | Effectiveness scores queryable via API | API smoke | `curl -s http://127.0.0.1:5175/api/admin/skills/motion-designer/effectiveness` | ❌ Wave 0 |
| FBK-05 | Admin skill detail page shows effectiveness section | Playwright UI | `npx playwright test skill-feedback.spec.js --grep FBK-05` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/lobster/projects/porter/tests && npx playwright test skill-feedback.spec.js`
- **Per wave merge:** `cd /home/lobster/projects/porter/tests && npx playwright test`
- **Phase gate:** Full suite green (35 + new FBK tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/skill-feedback.spec.js` — covers FBK-01 through FBK-05
- [ ] No new framework config needed — uses existing playwright.config.js

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `backend/src/db/schema.ts` — confirms `bridge_dispatch_log.skills_used` JSONB, `persona_skills` columns, `bridgeDispatchLog` structure
- Direct code read: `backend/src/db/migrate-rts-v1.ts` — confirms migration file naming and idempotency pattern
- Direct code read: `backend/src/services/bridge/routing-engine.ts` — confirms `logDispatch` returns `Promise<string>`, fire-and-forget pattern
- Direct code read: `backend/src/routes/v1/chat.ts` — confirms `skills_used` population, SSE done event structure
- Direct code read: `admin/frontend/app/components/chat-panel.tsx` — confirms SSE parsing, message structure, no existing feedback UI
- Direct code read: `admin/backend/src/routes/skills.ts` — confirms `requirePlatformAdmin` hook, `ok()`/`err()` envelope, `queryAll`/`execute` helpers

### Secondary (MEDIUM confidence)
- Code read + inference: `backend/src/index.ts` migration chain — confirmed sequential migration registration pattern

### Tertiary (LOW confidence)
- None — all findings verified against actual codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in existing codebase
- Architecture: HIGH — patterns derived directly from Phase 33 code that is already in production
- Pitfalls: HIGH — identified from reading persona_skills schema anomalies (skill_name vs skill_id dual-key) and SSE event structure
- UI patterns: HIGH — chat-panel.tsx and agent-detail.tsx read directly

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase, 30-day window appropriate)
