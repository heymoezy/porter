# Phase 33: Runtime Skill Selector - Research

**Researched:** 2026-04-02
**Domain:** AI dispatch pipeline, skill ranking, system prompt injection, dispatch telemetry
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key areas:
- Skill ranking algorithm (keyword matching, embedding similarity, or hybrid)
- Prompt injection placement (between memory tiers and gateway instructions per success criteria)
- Logging format for skills_used JSONB column
- Performance thresholds for skill selection (must not add significant latency to dispatch)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RTS-01 | Every dispatch gathers the agent's assigned skills from persona_skills | persona_skills table exists, has 17 rows (porter-core), skill_id column confirmed present |
| RTS-02 | A skill selector ranks candidate skills against the task using description, triggers, tags, and historical success | skills table has description + tags columns; SKILL.md has "When to use" section; skills.config_schema can carry triggers; keyword scoring is the right algorithm at this scale |
| RTS-03 | Only the top 0-3 most relevant skill packs are injected into the dispatch prompt context | chat.ts system prompt assembly is the injection point; memory-injection.ts pattern guides the implementation |
| RTS-04 | Every dispatch logs which skills were candidates, which were selected, and the ranking scores | bridge_dispatch_log exists with JSONB-ready column pattern; needs skills_used column via new migration |
| RTS-05 | Dispatches with no relevant skills proceed without skill injection (graceful zero-skill path) | zero-skill path is a conditional wrap — trivial once RTS-01/02/03 are in place |
</phase_requirements>

---

## Summary

Phase 33 wires skills into the live dispatch pipeline. Every time an agent sends a message, the new `skill-selector` service queries `persona_skills` for that agent's assignments, scores each candidate skill against the incoming task text using a keyword/tag/description hybrid, injects the top 0-3 skill packs (SKILL.md + prompt.md) into the system prompt between the memory tier block and any gateway-specific content, then logs the full candidate list, winners, and scores to a new `skills_used` JSONB column on `bridge_dispatch_log`.

The existing dispatch pipeline in `backend/src/routes/v1/chat.ts` builds `augmentedMessage` by prepending memory context to the user message, and builds `systemPrompt` from the agent template. Skill injection slots in as a Tier 6 extension of the memory injection pattern: it produces a `## Active Skills` block appended to `systemPrompt` (not `augmentedMessage`), which is passed to `streamFromBridge` / `selectStreamBackend`. The memory injection pipeline (`memory-injection.ts`) demonstrates exactly how to do token-budgeted, fire-and-forget-safe context construction.

The ranking algorithm at this scale (17 total persona_skills, max ~20 per agent) does not need embeddings. A deterministic keyword scorer against the task string — using the skill's `description`, `tags` JSONB array from the `skills` table, and the "When to use" triggers from `meta/skill.json` — is fast enough to add zero perceptible latency. Historical success rate (`template_skills.success_rate_30d`) exists and should be used as a tiebreaker only (the column is 0 for all rows today).

**Primary recommendation:** Add `skill-selector.ts` service in `backend/src/services/`, call it inside `chat.ts` immediately after `buildMemoryContext`, append the result to `systemPrompt`, add one migration file for `bridge_dispatch_log.skills_used JSONB`, and update `logDispatch` to accept and store the skills payload.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (pool) | already in project | DB access for persona_skills + skills queries | Same pattern as memory-injection.ts, routing-engine.ts |
| `node:fs` | built-in | Read SKILL.md + prompt.md files from skills root | Same pattern as admin/backend skill-library.ts |
| `node:path` | built-in | Resolve skill pack paths from PORTER_SKILLS_DIR env var | Same pattern as admin/backend skill-library.ts |
| Drizzle ORM | already in project | Schema type definition for new JSONB column | Used everywhere in backend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `tsx` | already in project | Unit tests for skill-selector | Same framework as all backend `__tests__` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keyword scoring | Embedding similarity | Embeddings require an external model call per dispatch — unacceptable latency. Keyword matching is O(n*m) at n=20 skills, m=200 chars — sub-millisecond |
| Injecting into systemPrompt | Injecting into augmentedMessage (user turn) | System prompt is the correct location for behavioral instructions; user turn is for task content. The existing code already appends memory context to the user message; skill behavior goes in system |
| New `skill-selector.ts` | Extending memory-injection.ts | Separation of concerns: memory-injection is a pure memory tier, skills are behavioral modules. Keep them separate files |

**Installation:**
No new packages required. All dependencies are already present.

---

## Architecture Patterns

### Existing System Prompt Pipeline (chat.ts)

```
1. buildMemoryContext()        — tiered memory (identity, directives, project, agent, FTS)
2. augmentedMessage =          — memory context prepended to user message
   memoryContext + "\n\n---\n\n" + message
3. systemPrompt =              — agent template system_prompt fetched from DB
   at.system_prompt
4. streamBackend.stream(augmentedMessage, signal, systemPrompt)
```

After Phase 33:
```
1. buildMemoryContext()
2. augmentedMessage = memoryContext + "\n\n---\n\n" + message
3. systemPrompt = at.system_prompt
4. selectSkills(agentId, message)  <-- NEW
5. if skillBlock:
     systemPrompt = systemPrompt + "\n\n" + skillBlock
6. streamBackend.stream(augmentedMessage, signal, systemPrompt)
7. logDispatch(... skillsUsed)    <-- MODIFIED
```

### Recommended Project Structure

New file:
```
backend/src/services/skill-selector.ts   # New service
backend/src/db/migrate-skills-rts-v1.ts  # Migration: bridge_dispatch_log.skills_used
backend/src/__tests__/skill-selector.test.ts
```

Modified files:
```
backend/src/routes/v1/chat.ts            # Call selectSkills, pass to logDispatch
backend/src/services/bridge/routing-engine.ts  # Accept skillsUsed in logDispatch
backend/src/db/schema.ts                 # Add skillsUsed column to bridgeDispatchLog
```

### Pattern 1: Skill Selector Service

**What:** A pure function that takes agentId + task message, returns a skills block string + telemetry payload. Fire-and-forget-safe (never throws, returns empty on any error).

**When to use:** Called inside chat.ts before dispatch, whenever agentId is present.

```typescript
// backend/src/services/skill-selector.ts
// Source: based on admin/backend/src/services/skill-library.ts patterns

export interface SkillCandidate {
  skillId: string;
  name: string;
  description: string;
  score: number;
  reason: string;
}

export interface SkillSelectionResult {
  candidates: SkillCandidate[];  // all evaluated
  selected: SkillCandidate[];    // top 0-3 selected
  promptBlock: string;            // ready to append to systemPrompt
}

export async function selectSkills(
  agentId: string,
  taskText: string,
): Promise<SkillSelectionResult> {
  // 1. Query persona_skills for this agent (enabled only)
  // 2. Fetch skill metadata (description, tags) from skills table
  // 3. Read meta/skill.json triggers if available
  // 4. Score each candidate against taskText
  // 5. Sort by score desc, take top 3 with score > threshold
  // 6. Read SKILL.md + prompt.md for selected skills
  // 7. Build "## Active Skills\n\n..." block
  // 8. Return full result for telemetry
}
```

### Pattern 2: Keyword Scorer

**What:** Deterministic relevance scoring using term frequency matching across skill metadata.

**When to use:** Called per skill candidate inside `selectSkills`.

Score formula (additive):
```
score = 0
for each word in taskText (lowercased, deduplicated):
  if word appears in skill.description:        score += 2
  if word appears in skill.tags[]:             score += 3
  if word appears in triggers[]:               score += 3
  if word in skill.name:                       score += 1
score += skill.success_rate_30d * 5            // tiebreaker only
```

Threshold: skip selection if score == 0 (no match at all). This preserves the zero-skill graceful path.

**Selection cap:** Max 3 selected regardless of score. Avoids bloated prompts.

### Pattern 3: Dispatch Log Extension

**What:** Add `skills_used JSONB` column to `bridge_dispatch_log` via a migration file. Pass `skillsUsed` payload from chat.ts down through the dispatch flow.

The simplest path is to extend `RoutingContext` with an optional `skillsUsed` field, and update `logDispatch` to read and persist it. This avoids plumbing it through `BridgeDispatchRequest`.

```typescript
// Extend RoutingContext in types.ts
export interface RoutingContext {
  ...existing fields...
  skillsUsed?: SkillSelectionResult;  // Added Phase 33
}
```

The `logDispatch` INSERT already has 25+ positional parameters — add `skills_used` as the last column.

### Pattern 4: Skill Prompt Block Format

Inject as a dedicated section in the system prompt:

```
## Active Skills

The following skills have been selected as relevant to this task:

### [Skill Name]
[Contents of SKILL.md]

**Prompting guidance:**
[Contents of prompt.md]

---
```

Token budget: Each skill pack is ~300-800 words of scaffold content. Three packs = worst case ~2400 words = ~600 tokens. This is acceptable overhead for a targeted dispatch.

**Key decision:** Only inject SKILL.md + prompt.md, not guides/ or examples/. Those are for authoring, not runtime.

### Anti-Patterns to Avoid

- **Injecting skills before memory tiers:** Memory (directives, identity) is higher priority than skills. Skills go last in the system prompt.
- **Blocking dispatch on skill-selector failure:** Wrap the entire `selectSkills` call in try/catch. Return empty result on any error (same pattern as `buildMemoryContext`).
- **Reading all skill files for every dispatch:** Only read files for the selected 0-3 skills, not all candidates. Candidates are scored from DB metadata alone.
- **Using skill_name instead of skill_id:** `persona_skills.skill_id` is the canonical lookup per Phase 31 decisions. Use `WHERE skill_id IS NOT NULL` as the filter and fall back to `skill_name` only for backwards compat.
- **Adding skills_used to BridgeDispatchRequest:** That struct is for the AI gateway adapter. Skill telemetry belongs in RoutingContext which flows to logDispatch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token estimation | Custom counter | `Math.ceil(text.length / 4)` (already in codebase) | Already in memory-injection.ts line 5 — identical formula |
| Skill file reading | Custom FS abstraction | `safeReadText()` pattern from skill-library.ts | Already handles missing files gracefully, same pattern |
| DB connection | New pool | `import { pool } from '../../db/client.js'` | Brain's pool, same as routing-engine and memory-injection |
| Migration pattern | Custom DDL script | Follow `migrate-bridge-v6.ts` exactly | Idempotency check via schema_migrations table, BEGIN/COMMIT/ROLLBACK pattern |
| Migration registration | Manual | Add to `backend/src/db/index.ts` (or wherever migrations are called at startup) | All existing migrations follow this bootstrap pattern |

**Key insight:** The entire Phase 33 implementation reuses existing patterns. There is no new infrastructure to invent — only wire-up.

---

## Common Pitfalls

### Pitfall 1: skill_id vs skill_name inconsistency
**What goes wrong:** Phase 31 added `skill_id` but `skill_name` is still the PK column. All 17 rows have `skill_id = skill_name` today. A query filtering on `skill_id` only could miss rows where `skill_id` is NULL (though currently none exist).
**Why it happens:** Backwards-compat transition period — skill_name is still the PK, skill_id is a new nullable column.
**How to avoid:** Query: `WHERE persona_id = $1 AND enabled = 1 AND (skill_id IS NOT NULL OR skill_name IS NOT NULL)`. Use `COALESCE(skill_id, skill_name)` as the effective skill ID when reading pack files.
**Warning signs:** Skill selection returns 0 candidates for an agent that has known assignments.

### Pitfall 2: Missing skill pack files
**What goes wrong:** 81% of packs are scaffold filler. SKILL.md and prompt.md may exist but contain generic placeholder text. The selector should still include them if they score above threshold — the quality issue is a content problem, not a runtime problem.
**Why it happens:** Skill packs generated by the builder scaffold rather than enriched by domain experts.
**How to avoid:** Never filter skills from candidacy based on quality tier — that's Phase 36 (Quality). Phase 33 selects on relevance only. Read the file even if it's scaffold; inject it as-is.
**Warning signs:** Agent dispatches with missing skill context despite having high-scoring assignments.

### Pitfall 3: Skills root path environment dependency
**What goes wrong:** `PORTER_SKILLS_DIR` defaults to `/home/lobster/documents/porter/skills` in admin but the actual skills are at `/home/lobster/projects/porter/skills` (confirmed via shell).
**Why it happens:** The admin service reads the env var; the Brain service would need the same env var. The skills directory lives in the project repo, not the legacy documents path.
**How to avoid:** The Brain's `skill-selector.ts` must use the same `process.env.PORTER_SKILLS_DIR || '/home/lobster/projects/porter/skills'` defaulting logic. Verify the default path resolves correctly. Do NOT hardcode `/home/lobster/documents/porter/skills`.
**Warning signs:** `fs.existsSync(skillDir)` returns false for known skills.

**Critical note:** The skills root discovered during research: `/home/lobster/projects/porter/skills/` (not the legacy documents path). The Brain service default in `skill-selector.ts` must reflect this. Check if a `PORTER_SKILLS_DIR` env var is already set in the systemd service file.

### Pitfall 4: logDispatch parameter count explosion
**What goes wrong:** The existing `logDispatch` INSERT already has 25 positional parameters ($1-$25). Adding `skills_used` as $26 requires updating both the SQL string and the values array.
**Why it happens:** Raw SQL with positional parameters is brittle when columns are added.
**How to avoid:** Add `skills_used` as the very last column/parameter. Keep the existing 25 parameters unchanged, append as $26. Follow the fire-and-forget pattern: the outer function returns the `id` immediately; the async block inside does the full insert.
**Warning signs:** TypeScript compilation errors on parameter count mismatch.

### Pitfall 5: Skill injection when agentId is absent
**What goes wrong:** Chat dispatches without an agentId (plain chat sessions) would skip skill lookup but the code might try to access undefined.
**Why it happens:** `agentId` is optional in the chat endpoint.
**How to avoid:** Guard: `if (!agentId) return { candidates: [], selected: [], promptBlock: '' }`. This is the graceful zero-skill path (RTS-05) for non-agent dispatches.
**Warning signs:** TypeError on undefined agentId inside selectSkills.

---

## Code Examples

Verified patterns from existing codebase:

### DB Connection (from memory-injection.ts line 1)
```typescript
// Source: backend/src/services/memory-injection.ts
import { pool } from '../db/client.js';
```

### Token Estimation (from memory-injection.ts line 4-6)
```typescript
// Source: backend/src/services/memory-injection.ts
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### Safe File Read (from admin/backend/src/services/skill-library.ts line 129-134)
```typescript
// Source: admin/backend/src/services/skill-library.ts
function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}
```

### Migration Pattern (from migrate-bridge-v6.ts)
```typescript
// Source: backend/src/db/migrate-bridge-v6.ts
export async function migrateSkillsRtsV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = '033_dispatch_log_skills_used'`
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }
    await client.query(`
      ALTER TABLE bridge_dispatch_log
        ADD COLUMN IF NOT EXISTS skills_used JSONB
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_dispatch_log_skills_used
        ON bridge_dispatch_log USING gin(skills_used)
        WHERE skills_used IS NOT NULL
    `);
    await client.query(`INSERT INTO schema_migrations (id) VALUES ('033_dispatch_log_skills_used')`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### Persona Skills Query (verified against actual DB schema)
```typescript
// Canonical lookup per Phase 31: prefer skill_id, fallback to skill_name
const { rows } = await pool.query<{
  skill_id: string | null;
  skill_name: string;
}>(
  `SELECT COALESCE(skill_id, skill_name) AS effective_id, skill_name
   FROM persona_skills
   WHERE persona_id = $1 AND enabled = 1`,
  [agentId]
);
```

### Skill Metadata Query (skills table — confirmed columns: id, name, description, tags, category)
```typescript
const { rows: skillRows } = await pool.query<{
  id: string;
  name: string;
  description: string;
  tags: string[];
}>(
  `SELECT id, name, description, tags FROM skills WHERE id = ANY($1::text[])`,
  [skillIds]
);
```

### System Prompt Injection Site (from chat.ts lines 273-283)
```typescript
// Source: backend/src/routes/v1/chat.ts
// Skill block appends AFTER the template system_prompt is loaded
let systemPrompt: string | undefined;
if (agentId) {
  // ... existing template lookup ...
}

// NEW: Phase 33 injection
if (agentId) {
  const skillResult = await selectSkills(agentId, message);
  if (skillResult.promptBlock) {
    systemPrompt = (systemPrompt ?? '') + '\n\n' + skillResult.promptBlock;
  }
  // pass skillResult to routing context for logging
}
```

### skills_used JSONB Shape
```json
{
  "candidates": [
    { "skillId": "chat-orchestrator", "name": "Chat Orchestrator", "score": 8, "reason": "matched: chat, orchestrat" },
    { "skillId": "prompt-architect",   "name": "Prompt Architect",   "score": 2, "reason": "matched: prompt" }
  ],
  "selected": [
    { "skillId": "chat-orchestrator", "name": "Chat Orchestrator", "score": 8, "reason": "matched: chat, orchestrat" }
  ],
  "threshold": 1,
  "totalCandidates": 2
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All assigned skills always injected as plain text (skills_text column) | Only top 0-3 relevant packs injected based on task scoring | Phase 33 | Reduces prompt bloat, avoids irrelevant skill content |
| skills_text is a single prose block on agent_templates | SKILL.md + prompt.md are individual files per skill pack, injected selectively | Phase 31 SOT | Enables per-skill selection and scoring |
| skill_name string key | skill_id FK to skills.id | Phase 31 migration | Enables proper JOIN to skills table for metadata |

**Deprecated/outdated:**
- `skills_text` column on `agent_templates`: preserved but never read during dispatch (SOT-05). Phase 33 must NOT read it.
- Injecting all assigned skills: replaced by selective top-3 injection.

---

## Open Questions

1. **PORTER_SKILLS_DIR in Brain's systemd service**
   - What we know: Admin backend defaults to `/home/lobster/documents/porter/skills`; actual skills are at `/home/lobster/projects/porter/skills`
   - What's unclear: Whether `PORTER_SKILLS_DIR` is set in the Brain's systemd service environment or `.env` file
   - Recommendation: Check `~/.config/systemd/user/porter-fastify.service` and any `.env` file in `backend/`. If not set, use `/home/lobster/projects/porter/skills` as the fallback default in skill-selector.ts.

2. **meta/skill.json triggers field**
   - What we know: `meta/skill.json` has a `triggers` array in the builder-generated format (confirmed in chat-orchestrator/meta/skill.json — but that file has no triggers in the scaffold)
   - What's unclear: Whether any production skill packs have populated triggers arrays
   - Recommendation: Read triggers from meta/skill.json when present, treat as empty array when missing. Scoring works without triggers — description + tags + name is sufficient.

3. **Score threshold calibration**
   - What we know: With 17 skills all on porter-core, typical task messages will match 0-3 skills using keyword scoring
   - What's unclear: What minimum score separates "relevant" from "noise"
   - Recommendation: Start with threshold=1 (any match selects). The graceful zero path handles no-match. Threshold tuning is Phase 34+ territory when feedback data exists.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `tsx` |
| Config file | none — run directly with npx |
| Quick run command | `npx tsx --test backend/src/__tests__/skill-selector.test.ts` |
| Full suite command | `npx tsx --test backend/src/__tests__/*.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RTS-01 | `selectSkills` queries persona_skills for agent | unit | `npx tsx --test backend/src/__tests__/skill-selector.test.ts` | No — Wave 0 |
| RTS-02 | Keyword scorer ranks skills by description/tags/triggers | unit | `npx tsx --test backend/src/__tests__/skill-selector.test.ts` | No — Wave 0 |
| RTS-03 | Only top 0-3 injected; promptBlock contains SKILL.md + prompt.md | unit | `npx tsx --test backend/src/__tests__/skill-selector.test.ts` | No — Wave 0 |
| RTS-04 | bridge_dispatch_log.skills_used column exists and is populated | unit | `npx tsx --test backend/src/__tests__/skill-selector.test.ts` | No — Wave 0 |
| RTS-05 | No agentId → empty result, dispatch proceeds normally | unit | `npx tsx --test backend/src/__tests__/skill-selector.test.ts` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx --test backend/src/__tests__/skill-selector.test.ts`
- **Per wave merge:** `npx tsx --test backend/src/__tests__/*.test.ts`
- **Phase gate:** Full suite green + `npm run build` zero errors before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/skill-selector.test.ts` — covers RTS-01 through RTS-05
- [ ] `backend/src/services/skill-selector.ts` — the service itself (Wave 1)
- [ ] `backend/src/db/migrate-skills-rts-v1.ts` — skills_used JSONB column (Wave 1)

---

## Sources

### Primary (HIGH confidence)
- `/home/lobster/projects/porter/backend/src/routes/v1/chat.ts` — exact system prompt assembly flow, injection points
- `/home/lobster/projects/porter/backend/src/services/memory-injection.ts` — tier pattern, token budgeting, error handling
- `/home/lobster/projects/porter/backend/src/services/bridge/routing-engine.ts` — logDispatch implementation, fire-and-forget pattern
- `/home/lobster/projects/porter/backend/src/services/bridge/types.ts` — RoutingContext, BridgeDispatchRequest shapes
- `/home/lobster/projects/porter/backend/src/db/schema.ts` — bridgeDispatchLog, personaSkills, skills, templateSkills exact columns
- `/home/lobster/projects/porter/admin/backend/src/services/skill-library.ts` — file reading patterns, skill pack structure
- `psql -d porter` live queries — confirmed: 17 persona_skills rows, 207 skills rows, skills table has tags column, no triggers column in skills table (triggers live in meta/skill.json)

### Secondary (MEDIUM confidence)
- `backend/src/db/migrate-bridge-v6.ts` — migration boilerplate pattern
- `backend/src/db/migrate-sot-v1.ts` — Phase 31 migration for reference
- `backend/src/__tests__/dispatch-log.test.ts` — test file pattern and naming convention

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies confirmed present in codebase; no new packages needed
- Architecture: HIGH — injection points confirmed in live code; exact SQL schemas queried from live DB
- Pitfalls: HIGH — skill_id/skill_name state confirmed from live DB; skills root path verified by shell; logDispatch parameter count verified from source

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable, no fast-moving dependencies)
