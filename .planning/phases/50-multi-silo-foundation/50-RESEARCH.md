# Phase 50: Multi-Silo Foundation — Research

**Researched:** 2026-05-16
**Domain:** Memory consolidation — admin + data-room silo seeding, silo-agnostic dream-worker enrollment, per-silo cadence wired into the existing scheduler tick loop.
**Confidence:** HIGH (every claim verified against live code + live DB on 2026-05-16; the dream-worker is already 95% silo-agnostic by design — Phase 50 is mostly data-layer work + scheduler refactor, not application code refactor)

---

## Summary

Phase 49 closed the pattern-detection gap and proved project-level directive scoping works (83 project-scoped rows in production, 64 of them ymc.capital). Phase 50 takes the next structural step: **stand up two more silos (admin + data-room) and prove that adding a silo is a data operation, not a code change**.

The good news from a fresh audit of the dream pipeline: **the worker is already silo-agnostic at the algorithm level**. `dream-worker.ts:438-440` reads `silos.prompt_path` + `default_model` from the DB row (no hardcoded prompt file path, no hardcoded model). `dream-sampler.ts:147-151` reads `WHERE silo_id = $1` (parameter, not literal). `dream-parser.ts` carries comments mentioning "software" but no silo-specific logic. The trigger `directive_immutable_moe_direct` is scope-agnostic.

There are exactly TWO surviving "software" string defaults:
- `backend/src/routes/v1/intellect.ts:623` — `const siloId = body.silo_id ?? 'software'` (default-only; explicit silo_id overrides)
- `backend/src/services/intellect/workflow-engine.ts:112` — `const siloId = (config?.silo_id as string) ?? 'software'` (default-only; workflow row's action_config overrides)

Both are safe-defaults, not silo-locks. The MSF-03 "extract hardcodes" requirement is therefore largely **already done** by 48.3's design discipline — Phase 50's refactor work for MSF-03 is small (audit + retire the defaults OR keep them as documented fallbacks) and the real meat of MSF-03 is verifying enrollment works end-to-end with a new silo entered purely via SQL + a prompt file.

The hard work splits cleanly:

1. **Admin silo seed** (MSF-01) — one `silos` INSERT, one prompt file `dream-prompts/admin.md` (derived from `software.md` but with admin-domain framing: review-surface workflow, audit-event hygiene, RBAC posture), 4–6 `directives` rows scope=`silo` scope_id=`admin` source_type=`moe-direct`. Detect rules: Porter project + ymc admin route paths.
2. **Data-room silo seed** (MSF-02) — one `silos` INSERT, one prompt file `dream-prompts/data-room.md` (data-room domain framing: no synthetic exhibits, audit primary sources, confidentiality posture), 4–6 sealed seeds. Detect rules: fund-ops cwds.
3. **Silo-agnostic verification + refactor** (MSF-03) — light-touch: confirm the two `'software'` defaults stay as documented fallbacks, OR retire them in favor of explicit silo enrollment via workflow rows. Recommendation: KEEP defaults (anti-fragile — a future caller missing a silo_id still works against software, the most populated silo).
4. **Per-silo cadence** (MSF-04) — `silos.cadence_seconds` already exists (verified, default 604800 = weekly). Today, only `'Software dream — weekly consolidation'` workflow row exists; it's hardcoded to `every_week` schedule tag. Two ways to wire per-silo cadence:
   - **(A) Workflow-row-per-silo:** add `'Admin dream — every-3-days consolidation'` and `'Data-room dream — weekly consolidation'` workflow rows, plus an `every_3d` scheduler tag. Simple, ships fast, doesn't require changing `silos.cadence_seconds` semantics.
   - **(B) Data-driven scheduler:** scheduler iterates enabled silos every N minutes; for each one checks `(now - max(dream_runs.started_at)) >= cadence_seconds`; if yes, enqueues `runDreamWorker({siloId, triggeredBy:'schedule'})`. No workflow rows needed. Truly data-driven — adding a silo means `INSERT silos (..., cadence_seconds=N)` and it auto-runs.
   - **Recommendation: (B).** It's the version that makes MSF-04's truth (`silos.cadence_seconds already exists but unused; wire scheduler to pick per-silo cadence`) literal. The skip-recent guard in `dream-worker.ts:357-368` already enforces a 6.5-day floor for schedule-triggered runs; we either widen it or move the floor into the per-silo check. Detail in §"Per-Silo Cadence Design".

**Primary recommendation:** 5 plans (MSF-01..04 + smoke harness), wave-grouped so 50-01 (silo-agnostic refactor + per-silo cadence scheduler) blocks 50-02/03 (silo seeds need the scheduler ready), 50-04 (smoke) gates on all of them. Smaller plan slicing is possible but the admin+data-room seeds genuinely don't depend on each other and can run in parallel.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 50.** This phase was spawned directly from the v7.0 scoping pass at the close of Phase 49 (CHECKPOINT.md confirms "Phase 50 next; awaiting `/gsd:plan-phase 50`"). Constraints below are inherited from REQUIREMENTS.md, ROADMAP.md, and predecessor phases (48.1 silo foundation, 48.3 software dream worker, 49 pattern detection).

### Locked Decisions (inherited)

- **One silos row + one prompt file + N seed directives = enrolled silo.** No code changes per requirements (MSF-03). The dream-worker's silo-agnostic posture is non-negotiable.
- **No new tables.** `silos`, `directives`, `dream_runs`, `memory_proposals`, `session_transcript_turns` all exist and accept new silo_id values without DDL. New seed rows are INSERTs only.
- **No CHECK constraints pinning silo IDs.** `directives.scope_id` is unconstrained TEXT (verified — Phase 48.1 research). `silos.id` is the only constrained identity (PK); admins enroll by INSERT.
- **Trigger `directive_immutable_moe_direct` is scope-agnostic** — `OLD.source_type='moe-direct'` is the only check (verified live in `migrate-silos-v1.ts:95`). Admin + data-room sealed seeds protected automatically; smoke must include a positive test exercising the trigger on each new silo's seeds.
- **Sealed-seed precedent:** `source_type='moe-direct'` + `priority=95` per software silo seeds (5 rows confirmed live). New seeds follow the same priority floor unless explicitly justified.
- **127.0.0.1-only endpoints.** Any new endpoint (none planned in Phase 50; existing POST /dream-run handles all silos already) inherits server-bind-only posture.
- **All seeds via migration files** — follows `migrate-silos-v1.ts` pattern (INSERT ... ON CONFLICT DO NOTHING). NOT raw psql commands. Migration registered in `backend/src/index.ts` startup. This makes seed sets idempotent + traceable + auditable.
- **Refinement doctrine carries over.** Admin + data-room dream runs go through the same `validateRefinementDoctrine` gate as software runs. The doctrine is universal; only the prompt content varies per silo.
- **Cadence values from MSF-04:** admin every 3 days (259200s), data-room weekly (604800s), software weekly (604800s — unchanged).

### Claude's Discretion

- **Exact wording of seed directives** for admin + data-room silos — drafted below in §"Admin Silo Detect Rules + Seeds" and §"Data-Room Silo Detect Rules + Seeds". Micro-edits expected during plan review.
- **Prompt template content** for admin.md + data-room.md — drafted below as adapt-from-software.md exercises. Substitution variables identical (`{{ACTIVE_DIRECTIVE_COUNT}}`, `{{ACTIVE_DIRECTIVES_BLOCK}}`, `{{TRANSCRIPT_BLOCK}}`, etc.) — no template-engine change.
- **Per-silo cadence wiring approach** — option (A) workflow-row-per-silo OR option (B) data-driven scheduler tick. Recommendation: (B). Discussion in §"Per-Silo Cadence Design".
- **Silo precedence when multiple match** — recommendation: **all-match → multi-silo response** (already the live behavior in `detectSilos`, which returns `DetectedSilo[]`, not `DetectedSilo | null`). Discussion in §"Silo Precedence".
- **Whether to retire `'software'` defaults** in `intellect.ts:623` + `workflow-engine.ts:112`. Recommendation: KEEP as documented fallbacks (anti-fragile + zero-risk). Discussion in §"Silo-Agnostic Refactor Audit".
- **Plan slicing** — 5 plans recommended (50-01 scheduler refactor + cadence, 50-02 admin silo, 50-03 data-room silo, 50-04 silo-agnostic verification, 50-05 smoke). Coarse alternative (3 plans) also viable.

### Deferred Ideas (OUT OF SCOPE for Phase 50)

- **Admin UI for silo management** — admins enroll via SQL/migration. Future phase if a non-Moe operator needs it.
- **Dreams Review UX upgrades** — Phase 51 (DRX-01..04). Bulk accept/reject, edit-in-place, proposal search, `/api/admin/silos` endpoint all wait.
- **`detectSilos` precedence override / priority field** — `silos` table has no `priority` column today. Multi-match is the current+future behavior (all matching silos contribute directives to /context). If precedence ever needed, ADD a column then; don't add a column speculatively now.
- **Detect rules for ymc.capital site itself** — software silo already matches via `package.json` cwd_marker; no need to over-fit detect rules. The data-room silo applies to fund-ops cwds (ymc.capital-private/workoutdocs, /home/lobster/projects/Funds, etc.), NOT to the ymc.capital site code.
- **Per-silo model override** — `silos.default_model` already supports it (`claude-sonnet-4-6` default for all). Admin + data-room can override per-row if planner judges them suited to a smaller/larger model. Recommendation: ship all 3 silos on Sonnet 4.6 for parity; tune later based on observed proposal quality.
- **Cross-silo proposals** — explicitly forbidden by 48.3 doctrine. One run per silo, one silo per proposal.
- **Auto-classification of past sessions** — transcripts captured before Phase 50 will carry old silo tags. No retroactive re-tagging.
- **Detect-rule overlap warnings/log** — when a cwd matches multiple silos, /context simply layers them all. No warning fires. Future observability improvement.
- **`every_3d` scheduler tag** — only needed if cadence approach (A) is chosen. With approach (B) (recommended), no new tag is needed.
- **Migration of `silos.cadence_seconds` for software** — already correctly seeded at 604800. No update needed.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSF-01 | Admin silo seed — `silos` row id='admin', `dream-prompts/admin.md`, detect rules for admin-work cwds, 4-6 seed directives covering review-surface workflow, audit-event hygiene, RBAC posture | §"Admin Silo Detect Rules + Seeds" — detect_rules JSON drafted (Porter project + ymc admin route paths); 4 seed directives drafted in full; admin.md template drafted as adapt-from-software.md |
| MSF-02 | Data-room silo seed — `silos` row id='data-room', `dream-prompts/data-room.md`, detect rules for fund-ops cwds, 4-6 seed directives covering no-synthetic-exhibits, audit primary sources, confidentiality posture | §"Data-Room Silo Detect Rules + Seeds" — detect_rules JSON drafted (Funds/, ymc.capital-private/workoutdocs/, ymc.capital/{deals,workouts,strategies} paths); 5 seed directives drafted in full; data-room.md template drafted |
| MSF-03 | Silo enrollment workflow — adding a silo = silos row + prompt file + seed directives via SQL, NO code change. Audit + retire any remaining software-silo hardcodes in dream-worker code path | §"Silo-Agnostic Refactor Audit" — two `'software'` defaults identified (both safe fallbacks); dream-worker/sampler/parser confirmed silo-agnostic at algorithm level; refactor scope is minimal (verify + document, no behavior change) |
| MSF-04 | Per-silo dream cadence — `silos.cadence_seconds` wired to scheduler so admin runs every 3 days, data-room weekly, software weekly | §"Per-Silo Cadence Design" — option (B) recommended (data-driven scheduler tick reads `silos.cadence_seconds`); skip-recent guard in dream-worker.ts widened to read per-silo cadence; existing "Software dream — weekly consolidation" workflow row deprecated in favor of scheduler tick (or kept as parallel safety net — discussion below) |

</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript / Node 20 | already in use | All new code in `backend/src/services/intellect/` + `backend/src/db/` | Existing pattern; no new tooling |
| `pg` node-postgres pool | already in use | All DB writes via migration files; runtime queries via `pool.query` | Existing convention |
| PostgreSQL 16 | already deployed | JSONB for detect_rules; TEXT for scope_id | Existing storage layer |
| Fastify 5 routes | already in use | POST /dream-run already accepts arbitrary silo_id (intellect.ts:614); no new routes needed | The handler already validates silo exists + enabled, so admin and data-room "just work" once seeded |
| Migration pattern: `migrate-*-v1.ts` | local code | New migration `migrate-silos-msf-v1.ts` (or `migrate-multi-silo-v1.ts`) adds admin + data-room silos rows + seed directives + per-silo cadence wiring | Same idempotent shape: schema_migrations guard, BEGIN/COMMIT, ON CONFLICT DO NOTHING |
| Drizzle ORM | already in use | NO schema.ts changes — `silos` and `directives` already declared | All Phase 50 work is data-layer (INSERT) + scheduler-layer (logic) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing `runDreamWorker` | local | Per-silo cadence wiring invokes the existing worker with `{siloId, triggeredBy:'schedule'}` | Worker already silo-agnostic; passing `'admin'` or `'data-room'` Just Works |
| Existing `loadSiloCache` / `reloadSiloCache` | local (silo-detector.ts:49-60) | Cache reload after admin/data-room INSERTs so /context detects them without restart | Pattern already established; migration concludes with `reloadSiloCache(pool)` |
| Bash 5 + psql + curl + jq | smoke harness | `tests/smoke-50.sh` — covers MSF-01..04 with admin + data-room seed verification, detect-rule cwd matrix, per-silo cadence assertion | Phase-standard test posture |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Data-driven scheduler tick reading `silos.cadence_seconds` (B) | Workflow-row-per-silo + `every_3d` tag (A) | (A) is simpler to ship (just INSERT workflow rows + add one `INTELLECT_3D_INTERVAL` constant). (B) is the version that actually fulfills the requirement's literal text ("scheduler picks per-silo cadence"). Once we have 3 silos with 3 cadences, (A) means 3 workflow rows + 3 scheduler tags; (B) means 1 scheduler tick + automatic silo discovery. **Decision: (B). It's the version that makes "adding a silo requires no code change" true also for cadence.** |
| One migration file for all of Phase 50 | Per-silo migration files (`migrate-silo-admin-v1.ts`, `migrate-silo-data-room-v1.ts`) | One file is simpler to register + roll forward. Per-silo is more granular for rollback. Existing precedent is per-feature migrations (e.g., `migrate-silos-v1.ts` did the substrate; `migrate-intellect-*` does incremental adds). **Recommendation: ONE migration `migrate-multi-silo-v1.ts`** (carries both silos + cadence wiring). All-or-nothing: if admin silo INSERT fails, the entire Phase 50 migration rolls back — no half-shipped state. |
| Workflow row + scheduler tick (belt + braces) | Just scheduler tick | Belt-and-braces means TWO triggers: the workflow row (every_week tag, fires the workflow) AND the scheduler tick (reads silos.cadence_seconds, also fires). They'd race; the skip-recent guard would deduplicate but logs become noisy. **Decision: drop the workflow row** (delete `'Software dream — weekly consolidation'` workflow row in the migration); leave the per-silo cadence tick as the sole trigger for ALL silos including software. |
| Admin silo detect rules: explicit file-path globs | Project-id match + cwd_markers | Phase 48.1's silo-detector reads `detect_rules.project_types` (matched against `projects.type`) and `detect_rules.cwd_markers` (filesystem stat). No file_globs check exists in `detectSilos` (line 117-138 — `project_types` and `cwd_markers` only). **`file_globs` field declared in detect_rules but is unused by the detector** — `file_globs` is metadata-only today (visible in admin UI eventually, not consulted at runtime). Admin silo detect rules use `cwd_markers` only: a marker file unique to admin work. See §"Admin Silo Detect Rules" for the precise rules. |
| Use a "priority" field on silos to break multi-match ties | All-match (current behavior) | All-match means a cwd matching software+admin gets BOTH silos' directives layered in /context. Could be noise OR could be signal-additive (operator working on Porter admin code sees software rules + admin rules). **Decision: all-match. Operator brain weighs them. If proven noisy, Phase 51+ adds a `priority` column to silos.** |

**Installation:** No new dependencies. All changes are data-layer + scheduler-logic.

**Version verification:** N/A.

---

## Admin Silo Detect Rules + Seeds

### `silos` Row (INSERT)

```sql
INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
VALUES (
  'admin',
  'Admin & Platform Operations',
  'Porter admin pages, audit hygiene, RBAC posture, review-surface workflows. Internal operator work, not product code.',
  'backend/src/services/intellect/dream-prompts/admin.md',
  259200,                            -- 3 days = 3 * 86400
  'claude-sonnet-4-6',
  $$ {
    "project_types": [],
    "cwd_markers": [
      "admin/frontend/package.json",
      "site/app/routes/admin"
    ],
    "file_globs": []
  } $$::jsonb,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
```

### Detect Rule Rationale

The admin silo applies when the operator is **inside admin-code paths**, NOT just inside the project. Two cwd_markers:

1. **`admin/frontend/package.json`** — Porter's admin frontend (`/home/lobster/projects/Porter/admin/frontend/`). When operator cwd is at or below `/home/lobster/projects/Porter/admin/`, this file is reachable AT this relative position.
   - **Pitfall:** `cwd_markers` check is `fs.existsSync(path.join(cwd, marker))`. From `/home/lobster/projects/Porter/admin/frontend`, the literal join is `path.join('.../admin/frontend', 'admin/frontend/package.json')` → won't exist.
   - **Correction:** Use a single-segment marker FROM THE cwd. The cleaner approach: use a marker that signals "I'm inside the admin code subtree". Use a marker file like `react-router.config.ts` (only present in admin frontend root) or a dedicated `.admin-silo` marker file the migration creates in `admin/frontend/`. **Recommendation: drop a `.admin-silo` marker file via the migration** — explicit, idempotent, no false positives.
   - Alternative: add `'admin'` to a future `cwd_path_contains` field on detect_rules (not implemented today — would need silo-detector.ts change → violates MSF-03 "no code change"). Stick with the marker file.

2. **`site/app/routes/admin`** — YMC admin route directory (`/home/lobster/projects/ymc.capital/site/app/routes/admin/`). When operator cwd is `/home/lobster/projects/ymc.capital` or `/home/lobster/projects/ymc.capital/site`, this directory IS reachable at the literal relative position.
   - Verified live: `/home/lobster/projects/ymc.capital/site/app/routes/admin/` exists (per the `ls` audit above).
   - This rule fires when working at the ymc.capital project root OR site/ root. It does NOT fire when working deep inside the admin/ subtree itself (the relative join `site/app/routes/admin` from `/home/lobster/projects/ymc.capital/site/app/routes/admin/billing/foo.tsx` would not find it).
   - **Recommendation:** add a second `.admin-silo` marker inside `/home/lobster/projects/ymc.capital/site/app/routes/admin/` so the silo also fires when deep inside YMC admin routes. The migration drops this file. Two marker files (one per project), one shared detect_rules.cwd_markers entry: `.admin-silo`.

**Final detect_rules (revised):**

```jsonc
{
  "project_types": [],                // admin work isn't tied to a project type
  "cwd_markers": [".admin-silo"],     // explicit marker file in admin code roots
  "file_globs": []
}
```

The migration creates two `.admin-silo` files:
- `/home/lobster/projects/Porter/admin/frontend/.admin-silo` (one-line content: `# Admin silo marker — Porter admin frontend`)
- `/home/lobster/projects/ymc.capital/site/app/routes/admin/.admin-silo` (one-line: `# Admin silo marker — YMC admin routes`)

These are committed to their respective repos. From the operator's `cwd`, `fs.existsSync(path.join(cwd, '.admin-silo'))` returns true when cwd IS one of those directories. To make detection also fire from PARENT cwds, the detector would need a walk-up — not implemented today. **Accept the limitation: admin silo fires only when cwd is exactly at an admin code root.** Operators working in subdirs of admin can `cd` up one level or use `/silo admin` override.

**Alternative (rejected): broader markers.** Using `package.json` would conflict with software silo at every Porter cwd. Using `.git` is too broad. The dedicated marker file is the cleanest signal.

### Admin Silo Seed Directives (4 recommended)

Each row: `scope='silo'`, `scope_id='admin'`, `source_type='moe-direct'`, `priority=95`, `status='active'`.

```sql
INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
VALUES
  -- ADM-01: audit-event hygiene
  ('silo-admin-audit-events-transactional',
   'silo', 'admin',
   'Audit-event writes MUST happen inside the same transaction as the mutation they describe. If an accept/reject/edit handler writes to a primary table (directives, proposals, users), the corresponding audit_event INSERT goes in the same BEGIN/COMMIT block. A failed mutation that leaves an audit row is a worse bug than a failed mutation with no audit row.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- ADM-02: RBAC posture
  ('silo-admin-rbac-platform-admin-guard',
   'silo', 'admin',
   'Every admin route MUST go through requirePlatformAdmin (or equivalent capability check) at the handler entry. Never rely on UI-side route gating alone. If a route mutates platform state (users, silos, workflows, directives, proposals), the auth check is non-negotiable. Workspace-scoped reads can use basic-auth; mutations need admin cap.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- ADM-03: SSE broadcast post-commit only
  ('silo-admin-sse-post-commit-only',
   'silo', 'admin',
   'SSE broadcasts (proposals:created, proposals:resolved, dreams:run-completed, etc.) MUST fire AFTER the database COMMIT. Never broadcast inside a transaction — a rollback after a broadcast leaves connected clients with phantom state. Wrap the broadcast in its own try/catch so a broadcast failure cannot mask the original mutation error.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- ADM-04: review-surface workflow
  ('silo-admin-review-surface-confirms-before-bulk',
   'silo', 'admin',
   'Bulk operations on the review surface (bulk accept, bulk reject, bulk archive) MUST show a confirmation modal with the count of affected rows BEFORE the mutation fires. The modal copy names the action verb and the count ("Accept 12 proposals?"). No silent bulk-mutations — Moe must always have a one-keypress veto path. Single-row actions can skip confirmation.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
ON CONFLICT (id) DO NOTHING;
```

**Optional 5th seed (consider adding):**

```sql
  -- ADM-05: error-state visibility
  ('silo-admin-error-state-never-silent',
   'silo', 'admin',
   'Admin surfaces NEVER swallow errors silently. Every failure path renders either (a) a toast with a specific message, (b) an inline error pill on the affected row, or (c) a banner at the top of the page. A blank screen is a bug. A 500 with no client-side feedback is a bug. Errors are first-class UI state.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
```

**Recommendation:** ship 4 seeds initially (ADM-01..04). The 5th is high-value but the requirement says "4-6"; lock the planner at 4 to keep the surface tight, leave room for 1-2 dream-worker-derived directives to accumulate.

### Admin Silo Prompt Template (`dream-prompts/admin.md`)

Adapt from `software.md` (already shipped, 113 lines). Same structure, same substitution variables, same JSON contract — only domain framing differs. Key changes:

| Section | Software.md text | Admin.md replacement |
|---------|------------------|---------------------|
| Header | "Software Silo Dream — Refinement Synthesis" | "Admin & Platform Operations Silo Dream — Refinement Synthesis" |
| Mission | "developer's CLI prompts and assistant replies, captured in the `software` silo" | "operator's admin/platform-operations work, captured in the `admin` silo" |
| Doctrine #4 | "Only mine turns that exhibit software-development signal: code, file paths, type errors, ship/deploy verbs, design-system / component / UI discussion" | "Only mine turns that exhibit admin/platform-operations signal: review surfaces, audit events, RBAC checks, SSE broadcasts, user management, workflow runs, dream-run admin, silo enrollment" |
| Hard Rules > scope | "Software-only scope" | "Admin-only scope: every proposal MUST be about admin/operator workflow judgment (review surfaces, audit hygiene, RBAC, SSE patterns, mutation flow). NOT about code style, design system, or domain product work" |
| Failure Patterns hint | Examples: "YMC logo freehanded" | Examples: "Audit event written outside the transaction" / "Silent error swallowed in delete handler" / "Bulk action without confirmation modal" |
| Self-check #5 | "Every proposal's conceptual_area is software-development domain" | "Every proposal's conceptual_area is admin/operator-workflow domain. No code style, no design system" |

The JSON output contract is **identical** — same fields, same types, same Zod schema. `dream-parser.ts` doesn't need changes. The discriminator is the `silo_id` at the row level, not in the response body.

---

## Data-Room Silo Detect Rules + Seeds

### `silos` Row (INSERT)

```sql
INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
VALUES (
  'data-room',
  'Data Room & Fund Operations',
  'KYC, deal-flow, investor docs, workout files, exhibits, regulatory submissions. Document-handling work, not code.',
  'backend/src/services/intellect/dream-prompts/data-room.md',
  604800,                            -- 7 days = 7 * 86400 (weekly, matches software cadence)
  'claude-sonnet-4-6',
  $$ {
    "project_types": [],
    "cwd_markers": [".data-room-silo"],
    "file_globs": []
  } $$::jsonb,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
```

### Detect Rule Rationale

Like admin, data-room uses a dedicated marker file `.data-room-silo` dropped by the migration into the appropriate roots:

- `/home/lobster/projects/ymc.capital/dealdocs/.data-room-silo`
- `/home/lobster/projects/ymc.capital/workoutdocs/.data-room-silo`
- `/home/lobster/projects/ymc.capital-private/workoutdocs/.data-room-silo`
- `/home/lobster/projects/Funds/.data-room-silo`

Verified live: `/home/lobster/projects/ymc.capital/dealdocs/`, `workoutdocs/`, and `/home/lobster/projects/Funds/` (containing `Nodal SPC`, `Track Record`) all exist. The ymc.capital-private path is referenced in past transcripts (`/home/lobster/projects/ymc.capital-private/workoutdocs/edwardchen` — per 49-RESEARCH.md cwd distribution).

**Limitation accepted:** like admin silo, detection fires only when cwd IS one of those roots. Subdirs need `/silo data-room` override. Acceptable tradeoff — operators doing data-room work usually start from the project root.

### Data-Room Silo Seed Directives (5 recommended)

```sql
INSERT INTO directives (id, scope, scope_id, content, priority, source_type, status, created_by, created_at, updated_at)
VALUES
  -- DAT-01: no synthetic exhibits
  ('silo-dataroom-no-synthetic-exhibits',
   'silo', 'data-room',
   'Case-file exhibits, regulatory submissions, and investor-facing documents are PRIMARY SOURCE PDFs only. Never re-render, restyle, regenerate, add cover pages, or compose framing pages onto an exhibit. Synthesized work product (memos, analyses, summaries) goes under Working_Papers/ or research/ and is labelled as derivative. Treat any user request to "clean up" or "reformat" an exhibit as a tripwire — the answer is almost always "use the original".',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- DAT-02: audit primary sources
  ('silo-dataroom-audit-primary-sources',
   'silo', 'data-room',
   'Every factual claim in a data-room artifact MUST cite a primary source by file path. Never assert dates, dollar amounts, party names, signing parties, jurisdictional facts, or regulatory status from memory. If the primary source isn''t readable from the data-room, ASK Moe for the source. "Synthesizing the gist" is a worse failure than asking. The audit trail starts with a citation, not a confident sentence.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- DAT-03: confidentiality posture
  ('silo-dataroom-confidentiality-no-leaks',
   'silo', 'data-room',
   'Data-room work is confidential by default. Never paste investor names, fund details, deal terms, KYC PII, or regulatory submission content into commits, public chat surfaces, or non-private logs. When extracting signals or capturing transcripts, redact specific identifiers. Confidentiality posture is asymmetric: a leak is irreversible; an over-redaction is recoverable. Err toward over-redaction.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- DAT-04: regulatory filings — filer profile gating
  ('silo-dataroom-regulatory-filer-profile',
   'silo', 'data-room',
   'Regulatory submissions (IRS, SEC, bank, KYC, AML) MUST use Moe''s filer profile from memory (Mohamed Ibrahim, US person, NJ address per the user_filer_profile memory). Never invent a surname, SSN, address, or tax ID. SSNs and other secrets are ask-per-filing — not stored. Cross-check entity names against the canonical entity registry before submission; "the LLC" is never a specific enough identifier.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),

  -- DAT-05: strategic communication posture
  ('silo-dataroom-strategic-communication-guarded',
   'silo', 'data-room',
   'When drafting communications about data-room subjects (legal recovery, fund operations, investor due diligence), follow the strategic-communication posture from memory: short demands to targets, guarded with allies. Get more than you give. Never reveal the full hand. Drafts default to under-disclosing — Moe expands if more is needed, but cannot un-disclose what''s already been sent.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW()))
ON CONFLICT (id) DO NOTHING;
```

**Optional 6th seed:**

```sql
  -- DAT-06: entity investigation before action
  ('silo-dataroom-investigate-before-recommending',
   'silo', 'data-room',
   'Never recommend strike-off, dissolution, transfer, or wind-down of any entity without first investigating the deal folder. Read the originating documents, check active contracts, scan for guarantor links. "Dormant" is a status, not a verdict. The cost of investigating a live entity is one extra file read; the cost of recommending action on a live entity is reputational + legal.',
   95, 'moe-direct', 'active', 'moe', EXTRACT(EPOCH FROM NOW()), EXTRACT(EPOCH FROM NOW())),
```

**Recommendation:** ship 5 seeds (DAT-01..05). DAT-06 is redundant with DAT-02 (audit primary sources covers the "read the deal folder first" intent). Leave room for dream-worker-derived directives.

### Data-Room Silo Prompt Template (`dream-prompts/data-room.md`)

Same adapt-from-software.md exercise as admin.md. Domain-specific changes:

| Section | Software.md text | Data-room.md replacement |
|---------|------------------|--------------------------|
| Header | "Software Silo Dream — Refinement Synthesis" | "Data Room & Fund Operations Silo Dream — Refinement Synthesis" |
| Mission | "developer's CLI prompts and assistant replies" | "Moe's data-room work: KYC reviews, deal-flow analysis, investor communications, workout files, regulatory drafts" |
| Doctrine #4 | "software-development signal" | "data-room signal: document-handling, citation discipline, regulatory filings, investor communications, entity investigation, confidentiality posture. NOT code work, NOT product work" |
| Hard Rules > scope | "Software-only scope" | "Data-room-only scope: every proposal MUST be about document handling, citation, confidentiality, regulatory, or strategic-communication judgment" |
| Failure Patterns hint | Examples: "YMC logo freehanded" | Examples: "synthesized exhibit instead of primary source" / "invented date in a regulatory draft" / "leaked investor name in commit message" |

JSON contract: identical to software.md. Zod schema unchanged.

---

## Silo Precedence (Multi-Match Handling)

### Current Behavior (Verified 2026-05-16)

`silo-detector.ts:77-141` returns `DetectedSilo[]` (array). `detectSilos` walks the cache, accumulates matches into `Map<string, DetectedSilo>` (Phase 48.1 dedup pattern), and returns all matches. There is NO precedence; all matching silos appear in /context.

`intellect.ts:246-275` (the silo injection block in /context) iterates `silos` and emits one `## Silo: <displayName> — Operating Rules` section per matched silo. The order is the iteration order of the cache (which is the SQL order — currently `WHERE enabled = TRUE` with no ORDER BY, so PostgreSQL's index/heap scan order, which is non-deterministic but stable within a run). After Phase 50, 3 silos enabled, so up to 3 sections.

### Recommendation: All-Match (Keep Current Behavior)

When a cwd matches multiple silos (e.g., `/home/lobster/projects/Porter/admin/frontend/` matches software via `package.json` AND admin via `.admin-silo`), /context emits BOTH sections. The operator sees software rules + admin rules layered. The reasoning model weighs both.

**Why not add a `priority` column?**

- No empirical evidence yet that multi-match creates noise. The 3 silos as designed have **non-overlapping detect rules** by intent:
  - Software detects via code-bearing markers (`package.json`, `Cargo.toml`, etc.)
  - Admin detects via `.admin-silo` file (only at admin code roots — not at `/home/lobster/projects/Porter/` root because no `.admin-silo` exists there; not at `admin/frontend/` because that has `package.json` (software) + `.admin-silo` (admin) — multi-match here is INTENTIONAL: operator working on Porter admin frontend gets both context blocks)
  - Data-room detects via `.data-room-silo` file (only at data-room roots — no `.git`, no `package.json`, no overlap with software)
- The intentional overlap at `admin/frontend` is signal-additive: an operator writing Porter admin code should see software rules (use design system, components only, parallelize agents) AND admin rules (audit-event hygiene, RBAC posture). Both are relevant.
- If post-deployment audit shows the layering is noisy, **add a `priority INTEGER NOT NULL DEFAULT 50` column to silos in Phase 51+** and `ORDER BY priority DESC` in the cache-load query. Speculative addition rejected.

### Open Question for Planner

When operator is at `/home/lobster/projects/Porter/admin/frontend/`, the /context output will include BOTH `## Silo: Software Development` AND `## Silo: Admin & Platform Operations` sections. Confirm this is desired before shipping. If not desired, the cheapest pre-ship fix is to NOT drop `.admin-silo` at `admin/frontend/` and instead drop it ONE LEVEL DOWN (e.g., `admin/frontend/admin-routes/.admin-silo`) so software-silo fires at the frontend root and admin-silo fires only when working specifically on admin route code. **Recommendation: ship the overlap; observe; adjust.**

---

## Silo-Agnostic Refactor Audit (MSF-03)

### What's Already Silo-Agnostic (Verified 2026-05-16)

| File | Lines | Behavior |
|------|-------|----------|
| `dream-worker.ts:438-440` | Loads `silos.prompt_path`, `silos.default_model` from DB by `id=$1`. No hardcoded prompt path, no hardcoded model. |
| `dream-worker.ts:459-463` | Reads active directives via `scope='silo' AND scope_id=$1`. Parameter, not literal. |
| `dream-sampler.ts:147-151` | Reads transcript turns via `silo_id = $1`. Parameter, not literal. |
| `dream-parser.ts` | No silo-specific logic. Only comments mention software. |
| `silo-detector.ts` | Reads `silos` table at startup via `SELECT * FROM silos WHERE enabled = TRUE`. No hardcoded silo IDs. |
| `intellect.ts:614-678` (POST /dream-run) | Validates silo exists in DB via `SELECT id FROM silos WHERE id=$1 AND enabled=true`. Any enabled silo works. |
| `migrate-silos-v1.ts` trigger | `directive_immutable_moe_direct` reads `OLD.source_type` only — scope-agnostic. Verified line 95. |

### Surviving Software Defaults (2 locations, both safe)

```typescript
// backend/src/routes/v1/intellect.ts:623
const siloId = body.silo_id ?? 'software';
```
**Behavior:** If a caller POSTs to /dream-run with no `silo_id`, the endpoint defaults to software. Explicit `silo_id` (any value) overrides. Software is the most-populated silo and the safest fallback target.

```typescript
// backend/src/services/intellect/workflow-engine.ts:112
dream_run: async (_ctx, config) => {
  const siloId = (config?.silo_id as string) ?? 'software';
  return runDreamWorker({ siloId, triggeredBy: 'schedule' });
},
```
**Behavior:** If a `dream_run` workflow row's `action_config` lacks `silo_id`, defaults to software. The seeded workflow row `'Software dream — weekly consolidation'` explicitly carries `{"silo_id":"software"}`, so this default is dead-code-pathish in production today.

### Recommendation: Keep Defaults, Document Them

These two `'software'` defaults are NOT silo-locks — they're explicit, single-line, well-commented fallbacks. Removing them would force every caller to specify a silo, which is annoying for the most common case (software is the dominant silo).

**Action items for MSF-03:**

1. **Audit complete (this RESEARCH.md is the audit deliverable).** No code changes needed for the dream pipeline core — it's already silo-agnostic.
2. **Add inline comments** at both default sites making explicit that the default is a fallback, NOT a silo-lock, and the choice is software because it's the dominant/most-populated silo:
   ```typescript
   // SAFE DEFAULT (Phase 50 MSF-03): software is the dominant silo; explicit silo_id
   // (admin, data-room, future) ALWAYS overrides this fallback.
   const siloId = body.silo_id ?? 'software';
   ```
3. **Verify enrollment works without code change** via smoke harness: insert a synthetic test silo (`silo='test-silo-msf-03'`) and a fixture prompt file via the smoke setup; POST `/api/v1/intellect/dream-run` with `silo_id: 'test-silo-msf-03'`; assert the dream_run row gets created against that silo; cleanup. The smoke proves MSF-03's truth empirically.

### Alternative: Retire the Defaults

Could be done by requiring `silo_id` in POST /dream-run body (return 400 if missing) AND requiring `silo_id` in `dream_run` action_config (throw in the handler if missing). Cost: every workflow row in `BUILTIN_WORKFLOWS` would need explicit silo_id (the one row already has it). Caller cost: anyone POSTing /dream-run from a script must specify silo_id (the smoke harness already does).

**Decision:** keep the defaults. Anti-fragile + low cognitive cost. The comments make the design intent clear.

---

## Per-Silo Cadence Design (MSF-04)

### Live State (Verified 2026-05-16)

- `silos.cadence_seconds` exists with `NOT NULL DEFAULT 604800` (migrate-silos-v1.ts:40). Software seed has 604800.
- Scheduler runs `runScheduledWorkflows('every_week')` once per 7-day tick (scheduler.ts:39 `INTELLECT_WEEKLY_INTERVAL = 302400` × 2s = 7d).
- Single workflow row `'Software dream — weekly consolidation'` triggers on `every_week` and fires `runDreamWorker({siloId:'software', triggeredBy:'schedule'})`.
- `dream-worker.ts:357-368` `checkSkipRecent` enforces a 6.5-day floor: if `last_run.started_at` within 6.5 days, skip. Schedule-triggered only; manual ALWAYS runs.
- `silos.cadence_seconds` is **read by nothing today**. It's purely metadata.

### Option (A): Workflow-Row-Per-Silo

Add two more workflow rows:

```sql
INSERT INTO workflows (..., name, trigger_type, trigger_value, action_type, action_config, enabled)
VALUES
  (..., 'Admin dream — 3-day consolidation', 'schedule', 'every_3d', 'dream_run', '{"silo_id":"admin"}'::jsonb, true),
  (..., 'Data-room dream — weekly consolidation', 'schedule', 'every_week', 'dream_run', '{"silo_id":"data-room"}'::jsonb, true);
```

Add a new scheduler tag `every_3d`:

```typescript
// backend/src/services/scheduler.ts
const INTELLECT_3D_INTERVAL = 129600; // 129600 ticks × 2s = 3 days

// In tick():
if (tickCount > 0 && tickCount % INTELLECT_3D_INTERVAL === 0) {
  runScheduledWorkflows('every_3d').catch(err =>
    console.error('[scheduler:intellect] every_3d workflows error', err));
}
```

**Pros:** Simple. Mirrors existing pattern. Ships fast.

**Cons:**
- Cadence value lives in TWO places: `silos.cadence_seconds` (metadata) AND the workflow row's `trigger_value` (operative). Drift risk.
- Enrolling a 4th silo with a 5-day cadence means adding ANOTHER scheduler tag (`every_5d`) AND another constant. Code change required → violates MSF-03 spirit.
- `silos.cadence_seconds` stays metadata-only. The requirement's literal text ("wire scheduler to pick per-silo cadence") is not satisfied.

### Option (B): Data-Driven Scheduler Tick

Add a new scheduler tick that iterates enabled silos and checks each one's cadence:

```typescript
// backend/src/services/scheduler.ts — NEW
const SILO_CADENCE_CHECK_INTERVAL = 1800; // 1800 ticks × 2s = 1 hour. Coarse-grained — checking hourly is fine for day-scale cadences.

async function runSiloCadenceCheck(): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    cadence_seconds: number;
    last_started_at: string | null;
  }>(`
    SELECT s.id,
           s.cadence_seconds,
           (SELECT MAX(started_at)::text FROM dream_runs dr WHERE dr.silo_id = s.id AND dr.status IN ('completed','running')) AS last_started_at
    FROM silos s
    WHERE s.enabled = TRUE
  `);
  const nowEpoch = Date.now() / 1000;
  for (const row of rows) {
    const last = row.last_started_at ? Number(row.last_started_at) : 0;
    if (nowEpoch - last < row.cadence_seconds) continue;
    // Fire the dream worker for this silo.
    runDreamWorker({ siloId: row.id, triggeredBy: 'schedule' }).catch(err =>
      console.error(`[scheduler:silo-cadence] dream run for ${row.id} failed:`, err));
  }
}

// In tick():
if (tickCount > 0 && tickCount % SILO_CADENCE_CHECK_INTERVAL === 0) {
  runSiloCadenceCheck().catch(err =>
    console.error('[scheduler:silo-cadence] check error', err));
}
```

**Pros:**
- Single source of truth for cadence (`silos.cadence_seconds`).
- Enrolling a silo = `INSERT silos (..., cadence_seconds=N)` and it auto-runs. No code change.
- The existing `checkSkipRecent` 6.5-day floor in `dream-worker.ts` still applies for software but is now too tight for admin (3-day cadence). The floor must be relaxed or replaced.

**Cons:**
- The existing skip-recent guard at `dream-worker.ts:357-368` hardcodes `SKIP_RECENT_THRESHOLD_S = 6.5 * 86400`. With Option (B), this constant must become per-silo: read `silos.cadence_seconds * 0.95` (≈95% of cadence as the floor, mirroring the 6.5/7 ratio for the software case).

### Recommendation: Option (B)

Option (B) is the version that satisfies MSF-04's literal text ("wire scheduler to pick per-silo cadence"). It makes enrollment truly code-free.

**Implementation steps:**

1. Add `SILO_CADENCE_CHECK_INTERVAL` constant + `runSiloCadenceCheck()` function + tick branch (≈40 LOC in scheduler.ts).
2. Refactor `dream-worker.ts:357-368` `checkSkipRecent`: replace constant `SKIP_RECENT_THRESHOLD_S` with a per-silo lookup:
   ```typescript
   async function checkSkipRecent(siloId: string): Promise<{ skip: boolean; lastRunAt?: number; cadenceSeconds?: number }> {
     const r = await pool.query<{ last: string | null; cadence: number }>(
       `SELECT (SELECT MAX(started_at)::text FROM dream_runs WHERE silo_id=$1 AND status='completed') AS last,
               (SELECT cadence_seconds FROM silos WHERE id=$1) AS cadence`,
       [siloId],
     );
     const last = r.rows[0]?.last ? Number(r.rows[0].last) : null;
     const cadence = r.rows[0]?.cadence ?? 604800;
     const floor = Math.floor(cadence * 0.95); // 95% of cadence — matches the 6.5/7 ratio for weekly
     if (last && Date.now() / 1000 - last < floor) {
       return { skip: true, lastRunAt: last, cadenceSeconds: cadence };
     }
     return { skip: false };
   }
   ```
3. **Delete the `'Software dream — weekly consolidation'` workflow row** in the migration. The scheduler tick now drives ALL silo cadences including software. Keeping the workflow row + scheduler tick races — the skip-recent guard would dedup but logs become noisy.
4. **Keep the `every_week` scheduler tag** — other workflows could still register against it in the future. Just stop using it for `dream_run`.
5. **Keep `runScheduledWorkflows` infrastructure** — it's general-purpose and other action types use it. Only the specific `dream_run` workflow row is retired.

### Cadence Values (Locked per Requirements)

| Silo | cadence_seconds | Equivalent |
|------|-----------------|------------|
| software | 604800 | 7 days (unchanged) |
| admin | 259200 | 3 days |
| data-room | 604800 | 7 days |

### Open Question for Planner

The migration that delete the `'Software dream — weekly consolidation'` workflow row should run AFTER the scheduler tick code is shipped (otherwise the gap leaves software with no scheduled trigger). The recommended order:

1. Plan 50-01: ship scheduler tick (`runSiloCadenceCheck`) + relaxed `checkSkipRecent`. After this ships, software runs via tick.
2. Plan 50-02 / 50-03: ship admin + data-room silos. After this ships, all 3 silos run via tick.
3. Plan 50-04 (or a tail step in 50-01): delete the old workflow row. Safe because tick now handles software.

Migration ordering matters. The planner must encode this gating in wave structure.

---

## Migration Strategy

### Single Migration File: `migrate-multi-silo-v1.ts`

Idempotent, all-or-nothing. Registered in `backend/src/index.ts` startup AFTER `migrateSilosV1` and after any Phase 49 migrations (e.g., `049-directives-scope-index.sql` from Phase 49 LRN-03).

```typescript
// Outline
export async function migrateMultiSiloV1(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query(
      `SELECT 1 FROM schema_migrations WHERE id = 'multi_silo_v1'`,
    );
    if (check.rowCount && check.rowCount > 0) {
      await client.query('COMMIT');
      return;
    }

    // 1. INSERT silos row for admin
    // 2. INSERT silos row for data-room
    // 3. INSERT 4 admin seed directives (ADM-01..04)
    // 4. INSERT 5 data-room seed directives (DAT-01..05)
    // 5. DELETE workflow row "Software dream — weekly consolidation" (data-driven scheduler replaces it)
    // 6. Drop .admin-silo and .data-room-silo marker files? NO — those are filesystem operations,
    //    NOT done by migration. The migration is data-only. The marker files are committed
    //    to their respective repos (Porter, ymc.capital) as part of the same plan's git work.
    // 7. INSERT schema_migrations row 'multi_silo_v1'

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

After the migration commits, **call `reloadSiloCache(pool)` from `silo-detector.ts`** so the in-memory cache picks up the two new silos without a service restart. This call goes in `index.ts` right after the migration call.

### Marker File Commits

The `.admin-silo` and `.data-room-silo` marker files are:

- **In Porter repo:** `/home/lobster/projects/Porter/admin/frontend/.admin-silo` — committed in the same commit as the migration.
- **In ymc.capital repo:** `/home/lobster/projects/ymc.capital/site/app/routes/admin/.admin-silo`, `/home/lobster/projects/ymc.capital/dealdocs/.data-room-silo`, `/home/lobster/projects/ymc.capital/workoutdocs/.data-room-silo` — committed separately in the ymc.capital repo. Cross-repo coordination needed.
- **In ymc.capital-private repo (if it exists):** `/home/lobster/projects/ymc.capital-private/workoutdocs/.data-room-silo` — committed in that repo.
- **In Funds folder:** `/home/lobster/projects/Funds/.data-room-silo` — Funds appears to be a working directory (not necessarily a git repo). Drop the file; if it's git-tracked elsewhere, commit there.

**Recommendation for plan slicing:** Make marker-file placement a small standalone plan task (50-02b or part of 50-02/03's last action) since they cross repo boundaries. The Porter-side migration runs without them — the marker files only activate the detect rules.

---

## Smoke Harness Scope (MSF-05 — implicit)

Following the established pattern (`smoke-48.1.sh`, `smoke-48.3.sh`, `smoke-49.sh`), `tests/smoke-50.sh` covers:

| Check ID | What it verifies | Test type |
|----------|------------------|-----------|
| SC-1 | `silos` table has 3 enabled rows: software (existing), admin, data-room | psql SELECT |
| SC-2 | Admin silo has 4 seed directives (or 5 if optional ADM-05 shipped); all `source_type='moe-direct'`, priority=95 | psql SELECT + count |
| SC-3 | Data-room silo has 5 seed directives (or 6 if optional DAT-06 shipped); same as SC-2 | psql SELECT + count |
| SC-4 | Prompt files exist: `dream-prompts/admin.md`, `dream-prompts/data-room.md` | `test -f` |
| SC-5 | `/api/v1/intellect/context?cwd=<porter-admin-frontend>` returns BOTH `## Silo: Software Development` AND `## Silo: Admin & Platform Operations` sections (multi-silo layering) | curl + grep |
| SC-6 | `/api/v1/intellect/context?cwd=/home/lobster/projects/ymc.capital/dealdocs` returns ONLY `## Silo: Data Room & Fund Operations` (no software, no admin) | curl + grep |
| SC-7 | Admin silo seeds are immutable: `UPDATE directives SET content='x' WHERE id='silo-admin-rbac-platform-admin-guard'` raises `directive_immutable_moe_direct` exception | psql expects exception |
| SC-8 | Data-room silo seeds are immutable (same check on `silo-dataroom-no-synthetic-exhibits`) | psql expects exception |
| SC-9 | POST `/api/v1/intellect/dream-run` with `silo_id='admin'` returns 202 + dream_run_id; the dream_run row exists with `silo_id='admin'`. (Mock response path used to avoid model dispatch.) | curl + jq + psql |
| SC-10 | POST `/api/v1/intellect/dream-run` with `silo_id='data-room'` similar | curl + jq + psql |
| SC-11 | POST `/api/v1/intellect/dream-run` with NO body (`{}`) defaults to software (verify the documented fallback) | curl + jq + psql |
| SC-12 | POST `/api/v1/intellect/dream-run` with `silo_id='nonexistent'` returns 404 SILO_NOT_FOUND | curl + jq |
| SC-13 | Per-silo cadence: `silos.cadence_seconds` reads 259200 for admin, 604800 for data-room and software | psql SELECT |
| SC-14 | Synthetic silo enrollment (proves MSF-03): INSERT a `silos` row `id='msf-03-synthetic'` with a fixture prompt path; POST /dream-run with that silo_id; assert dream_run created; cleanup | psql + curl + jq |
| SC-15 | The `'Software dream — weekly consolidation'` workflow row is DELETED (per cadence option B) | psql SELECT — expect 0 rows |
| SC-16 | `runSiloCadenceCheck` function exists and is wired into the scheduler tick. Indirect check: assert constant `SILO_CADENCE_CHECK_INTERVAL` is defined in scheduler.ts (grep), and a dry-run smoke can mock-tick the scheduler if feasible | grep + optional dry-run |

### Wave 0 Gaps

- [ ] `tests/smoke-50.sh` — does not exist; created in plan 50-05
- [ ] `tests/fixtures/dream-response-admin.json` and `dream-response-data-room.json` — synthetic mock responses for SC-9/10. Can clone `dream-response-pattern-detection.json` from Phase 49 and adjust `conceptual_area` values to admin/data-room domains
- [ ] Marker files `.admin-silo` + `.data-room-silo` in Porter repo + ymc.capital repo + ymc.capital-private + Funds — created in plans 50-02/03

---

## Plan Slicing Recommendation

### 5-Plan Slicing (Recommended — granularity:medium)

| Plan | Requirement(s) | Files Touched | LOC Est | Depends on |
|------|---------------|---------------|---------|-----------|
| **50-01** | MSF-04 scheduler refactor + MSF-03 default-comment doc | `backend/src/services/scheduler.ts` (+40 LOC scheduler tick + constant), `backend/src/services/intellect/dream-worker.ts` (~10 LOC per-silo `checkSkipRecent` refactor), `backend/src/services/intellect/workflow-engine.ts` (+1 doc comment), `backend/src/routes/v1/intellect.ts` (+1 doc comment at line 623), `backend/src/db/migrate-multi-silo-v1.ts` (DELETE old workflow row + INSERT schema_migrations) | ~80 | none |
| **50-02** | MSF-01 admin silo seed + admin.md prompt + marker files (Porter + ymc.capital admin route) | `backend/src/services/intellect/dream-prompts/admin.md` (new, ~110 lines adapted from software.md), `backend/src/db/migrate-multi-silo-v1.ts` (admin silos INSERT + 4 directive INSERTs), `admin/frontend/.admin-silo` (new marker file in Porter repo), `<ymc.capital>/site/app/routes/admin/.admin-silo` (new marker in ymc repo) | ~140 | 50-01 (migration file shared) |
| **50-03** | MSF-02 data-room silo seed + data-room.md prompt + marker files (ymc dealdocs/workoutdocs + ymc-private + Funds) | `backend/src/services/intellect/dream-prompts/data-room.md` (new, ~110 lines), `backend/src/db/migrate-multi-silo-v1.ts` (data-room silos INSERT + 5 directive INSERTs), `.data-room-silo` marker files at 4 paths | ~150 | 50-01 (migration file shared); parallel with 50-02 |
| **50-04** | MSF-03 verification (no code changes — just the synthetic-silo enrollment proof) | None (pure verification — can be folded into 50-05 if planner prefers 4 plans) | ~0 | 50-01..03 |
| **50-05** | MSF-05 (implicit) smoke harness | `tests/smoke-50.sh` (new, ~350 LOC), `tests/fixtures/dream-response-admin.json` (new), `tests/fixtures/dream-response-data-room.json` (new) | ~400 | 50-01..04 |

### Wave Grouping

- **Wave 1 (gating):** 50-01 — must ship before 50-02/03 can land cleanly (scheduler must be ready to drive cadence by the time silos are seeded).
- **Wave 2 (parallel):** 50-02 + 50-03 — admin and data-room seeds have no dependency between them; ship in parallel.
- **Wave 3 (final):** 50-04 + 50-05 — verification + smoke; gated on 1-3.

### Alternative: 3-Plan Slicing (granularity:coarse)

If planner judges 5 plans too fine:

- Plan A: Scheduler refactor + per-silo cadence (50-01 + 50-04 merged)
- Plan B: Silo seeds (50-02 + 50-03 merged into one migration commit)
- Plan C: Smoke (50-05)

Both viable; recommendation defaults to 5 unless planner-flagged coarse.

### Alternative: Merge 50-04 into 50-05

50-04 has zero LOC if MSF-03 ships as documented (no code change). The "synthetic silo enrollment proof" is naturally a smoke harness check (SC-14 above). **Recommendation: merge 50-04 into 50-05**, leaving 4 plans total.

---

## Risks + Edge Cases

### Risk 1: Marker File Placement vs Multi-Match Behavior

**Risk:** If `.admin-silo` is dropped at `admin/frontend/` (which also has `package.json`), every cwd at or below that directory now matches BOTH software (via `package.json` in detect_rules) AND admin (via `.admin-silo`). The /context response carries both silo sections, potentially duplicating "use design system" / "components only" with admin-specific rules.

**Mitigation:** Intended behavior (per §"Silo Precedence" recommendation). If audit shows it's noisy in practice, planner can move the marker file deeper (e.g., `admin/frontend/admin-routes/`) before shipping.

### Risk 2: cwd_markers Stat Cost on Every /context Call

**Risk:** `detectSilos` runs `fs.existsSync` per silo per marker per /context call. With 3 silos × 2-3 markers each = 6-9 stat calls per call. /context is called on every session start. At scale this could be noticeable.

**Mitigation:** Single-marker design (just `.admin-silo` and `.data-room-silo` and the existing software markers) keeps the count low. fs.existsSync is fast on local SSD (sub-millisecond). If it ever matters, add a 60-second LRU cache keyed on cwd.

### Risk 3: Migration Ordering vs Cache Reload

**Risk:** If `reloadSiloCache(pool)` is NOT called after the migration, the silo-detector cache from startup still has only `software`. Admin + data-room silos exist in DB but are invisible to /context until restart.

**Mitigation:** Call `reloadSiloCache(pool)` in `index.ts` startup right after the migration call. Tested in smoke harness (SC-5/SC-6 verify post-migration multi-silo detection works).

### Risk 4: Cross-Repo Marker File Coordination

**Risk:** Porter migration ships, but ymc.capital `.admin-silo` not yet committed → admin silo detect rule never fires from YMC sessions until ymc.capital is patched.

**Mitigation:** Plan 50-02 explicitly lists ymc.capital marker file placement as a deliverable. Smoke harness checks for marker file existence at expected paths (SC-5/SC-6 indirect check via /context behavior).

### Risk 5: `'Software dream — weekly consolidation'` Workflow Deletion Race

**Risk:** If the migration deletes the workflow row BEFORE the scheduler tick code ships, software silo loses its scheduled trigger.

**Mitigation:** Plan 50-01 ships scheduler tick FIRST. Migration delete is the last action in plan 50-01 (or first action in plan 50-04). Smoke (SC-15) confirms the row is gone post-migration.

### Risk 6: Per-Silo cadence_seconds Floor

**Risk:** If admin's cadence is 259200 (3 days) but `checkSkipRecent` still uses 95% floor, floor = 246240s = ~2.85 days. An admin dream that completes at noon Monday could be re-triggered at ~10am Thursday — fine in principle but could surprise an operator if they expect "every 3 days, like clockwork on Monday".

**Mitigation:** The 95% floor matches the software 6.5/7 ratio precedent. Document the floor in scheduler comments. If exact-cadence behavior is needed, swap floor to `cadence_seconds - 60` (1-minute slack instead of 5%).

### Risk 7: Migration Atomicity Across Silo Seeds

**Risk:** If admin silos INSERT fails (e.g., unique constraint conflict from a partial prior run), the entire migration rolls back, including data-room silo seeds.

**Mitigation:** All INSERTs use `ON CONFLICT (id) DO NOTHING` for idempotency. Migration is wrapped in BEGIN/COMMIT. A second run of the migration finds `schema_migrations.id='multi_silo_v1'` and returns immediately. Worst case: the migration runs cleanly the first time. Tested by running the migration twice in smoke harness setup.

### Risk 8: Cache Reload During Smoke

**Risk:** Smoke harness can't easily trigger `reloadSiloCache` without a service restart. If the silo cache is stale (only loaded at startup), the smoke's SC-5/SC-6 multi-silo /context checks fail.

**Mitigation:** Either (a) smoke harness includes a `systemctl --user restart porter-fastify` step at setup (heavy but reliable), or (b) the migration's startup hook calls `reloadSiloCache` automatically (lightweight, recommended). Option (b) requires that the migration is always run at startup, which is the current pattern (migrations run from `backend/src/index.ts` startup block).

### Risk 9: Existing Software Silo Cadence Mismatch

**Risk:** Today, software's `cadence_seconds=604800` (7 days) and the scheduler ticks `every_week` (also 7 days, `INTELLECT_WEEKLY_INTERVAL=302400` × 2s). After 50-01 ships, software is driven by the per-silo tick (1-hour check interval) reading `cadence_seconds` (still 604800). Behavior should be equivalent — but the first tick after deployment could fire a software dream IF the previous run was >7 days ago AND the scheduler tick fires before the old workflow row would have fired. Audit windows align; no risk in practice, just behaviorally subtle on first deployment.

**Mitigation:** Document in CHECKPOINT.md what to watch for in the first 7 days post-50-01 ship. The skip-recent guard inside `dream-worker.ts` is the safety net — a duplicate trigger is gracefully skipped.

### Risk 10: detectSilos Cache Race After Reload

**Risk:** `loadSiloCache` mutates the module-level `cache` variable non-atomically (assignment after query). A /context call that catches the cache mid-reload could see a partial result.

**Mitigation:** Node.js single-threaded event loop means the cache assignment is atomic at the JS-statement level. `cache = result.rows.map(...)` runs to completion before any subsequent `detectSilos` call can read `cache`. No race.

---

## Open Questions for Planner

1. **Multi-match at `admin/frontend/`** (Risk 1): Confirm desired behavior. Recommendation: ship the overlap; observe; adjust. Planner can override by relocating the `.admin-silo` marker deeper.

2. **Optional 5th admin seed (ADM-05) + 6th data-room seed (DAT-06)**: Spec says 4-6 seeds. Recommendation: 4 admin, 5 data-room. Planner may add the optional 5th/6th if the dream worker should have stronger structural priors out of the gate.

3. **Workflow row deletion**: Confirm `'Software dream — weekly consolidation'` should be DELETED (option B path) rather than kept as a parallel safety net. Recommendation: delete. The scheduler tick is sole-source-of-truth.

4. **Marker file commit coordination across repos**: Plan 50-02/03 needs explicit deliverables for ymc.capital and ymc.capital-private and Funds. Confirm planner has authority to commit to those repos OR scope plan to Porter-side only and document required cross-repo work in a follow-up.

5. **Cadence floor exact-vs-95%**: Recommendation: 95% floor (matches software precedent). Planner may switch to `cadence - 60` (exact-minus-slack) if exact-cadence behavior is preferred.

6. **Default-`'software'` retire vs keep**: Recommendation: keep with documented comments. Planner discretion.

7. **5-plan vs 4-plan vs 3-plan slicing**: Recommendation: 4 plans (50-04 merged into 50-05). Planner discretion based on `granularity` config.

8. **Cross-phase integration with Phase 49 project scoping**: Currently a directive has EITHER `scope='silo'` OR `scope='project'` (verified — `scope` column is single-value TEXT). Adding admin-silo + ymc.capital-project layering means /context now potentially renders 5 sections per call: System Directives → Silo Software → Silo Admin → Project ymc.capital → Recent Sessions/Concepts/Skills/Tools. Confirm UX assumption is fine. Plan 50-05 smoke should include an SC checking a cwd that triggers all 5 layers.

---

## Code Examples (Verified Snippets)

### 1. `silos` Row INSERT Template (Admin)

```sql
INSERT INTO silos (id, display_name, description, prompt_path, cadence_seconds, default_model, detect_rules, enabled)
VALUES (
  'admin',
  'Admin & Platform Operations',
  'Porter admin pages, audit hygiene, RBAC posture, review-surface workflows.',
  'backend/src/services/intellect/dream-prompts/admin.md',
  259200,
  'claude-sonnet-4-6',
  '{"project_types":[],"cwd_markers":[".admin-silo"],"file_globs":[]}'::jsonb,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
```

### 2. Per-Silo Cadence Scheduler Tick

```typescript
// backend/src/services/scheduler.ts (new — Phase 50 MSF-04)
const SILO_CADENCE_CHECK_INTERVAL = 1800; // 1h check granularity

async function runSiloCadenceCheck(): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    cadence_seconds: number;
    last_started_at: string | null;
  }>(`
    SELECT s.id, s.cadence_seconds,
           (SELECT MAX(started_at)::text FROM dream_runs WHERE silo_id=s.id AND status IN ('completed','running')) AS last_started_at
    FROM silos s WHERE s.enabled = TRUE
  `);
  const nowEpoch = Date.now() / 1000;
  for (const row of rows) {
    const last = row.last_started_at ? Number(row.last_started_at) : 0;
    if (nowEpoch - last < row.cadence_seconds) continue;
    runDreamWorker({ siloId: row.id, triggeredBy: 'schedule' })
      .catch(err => console.error(`[scheduler:silo-cadence] ${row.id}:`, err));
  }
}

// In tick():
if (tickCount > 0 && tickCount % SILO_CADENCE_CHECK_INTERVAL === 0) {
  runSiloCadenceCheck().catch(err => console.error('[scheduler:silo-cadence]', err));
}
```

### 3. Per-Silo `checkSkipRecent` Refactor

```typescript
// backend/src/services/intellect/dream-worker.ts (replace constant-based check)
async function checkSkipRecent(siloId: string): Promise<{ skip: boolean; lastRunAt?: number; cadenceSeconds?: number }> {
  const r = await pool.query<{ last: string | null; cadence: number }>(
    `SELECT (SELECT MAX(started_at)::text FROM dream_runs WHERE silo_id=$1 AND status='completed') AS last,
            (SELECT cadence_seconds FROM silos WHERE id=$1) AS cadence`,
    [siloId],
  );
  const last = r.rows[0]?.last ? Number(r.rows[0].last) : null;
  const cadence = r.rows[0]?.cadence ?? 604800;
  const floor = Math.floor(cadence * 0.95);
  if (last && Date.now() / 1000 - last < floor) {
    return { skip: true, lastRunAt: last, cadenceSeconds: cadence };
  }
  return { skip: false };
}
```

---

## Validation Architecture

Phase ships with nyquist_validation enabled (key absent in `.planning/config.json` per Phase 49 precedent → treat as enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bash 5 + `psql` + `curl` + `jq` (smoke harness pattern) |
| Config file | none — discoverable by convention (`tests/smoke-*.sh`) |
| Quick run command | `bash tests/smoke-50.sh` (~30 seconds end-to-end if Porter is running) |
| Full suite command | `for f in tests/smoke-*.sh; do bash "$f" || exit 1; done` (existing pattern) |
| Wave 0 gap | `tests/smoke-50.sh` + 2 fixture files (admin + data-room mock dream responses) — does NOT exist |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSF-01 | Admin silo seeded with 4 directives | smoke (DB) | `psql -tAc "SELECT COUNT(*) FROM directives WHERE scope='silo' AND scope_id='admin' AND source_type='moe-direct'"` ≥ 4 | ❌ Wave 0 |
| MSF-01 | Admin silo detect rule fires from cwd at `/home/lobster/projects/Porter/admin/frontend` | smoke (HTTP) | curl `/context?cwd=...&project=Porter` greps for `## Silo: Admin` | ❌ Wave 0 |
| MSF-02 | Data-room silo seeded with 5 directives | smoke (DB) | psql COUNT ≥ 5 on data-room scope | ❌ Wave 0 |
| MSF-02 | Data-room silo detect rule fires from cwd at `/home/lobster/projects/ymc.capital/dealdocs` | smoke (HTTP) | curl + grep `## Silo: Data Room` | ❌ Wave 0 |
| MSF-03 | Synthetic silo enrollment via SQL alone works end-to-end | smoke (DB+HTTP) | INSERT `silos id='test-msf03'`; touch prompt file at expected path; POST /dream-run with silo_id; assert dream_run row created; cleanup | ❌ Wave 0 |
| MSF-04 | `silos.cadence_seconds` correctly seeded per silo | smoke (DB) | psql SELECT cadence_seconds; admin=259200, data-room=604800, software=604800 | ❌ Wave 0 |
| MSF-04 | Per-silo scheduler tick function exists | smoke (grep) | `grep -q "runSiloCadenceCheck" backend/src/services/scheduler.ts` | ❌ Wave 0 |
| MSF-04 | Old `'Software dream — weekly consolidation'` workflow row deleted | smoke (DB) | `psql -tAc "SELECT COUNT(*) FROM workflows WHERE name='Software dream — weekly consolidation'"` = 0 | ❌ Wave 0 |
| Cross | Trigger immutable enforces on admin + data-room sealed seeds | smoke (DB exception) | psql expects RAISE EXCEPTION on UPDATE of `silo-admin-rbac-platform-admin-guard` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (scheduler.ts + dream-worker.ts type-check)
- **Per wave merge:** `bash tests/smoke-50.sh` end-to-end
- **Phase gate:** ALL smoke harnesses green: `bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && bash tests/smoke-49.sh && bash tests/smoke-50.sh` (regression posture — Phase 50 must not break prior phases)

### Wave 0 Gaps

- [ ] `tests/smoke-50.sh` — covers MSF-01..04 + synthetic enrollment proof + multi-silo /context layering
- [ ] `tests/fixtures/dream-response-admin.json` — mock dream-worker JSON adapted from `dream-response-pattern-detection.json` with admin-domain `conceptual_area` values
- [ ] `tests/fixtures/dream-response-data-room.json` — same shape, data-room-domain values
- [ ] `backend/src/db/migrate-multi-silo-v1.ts` — does not exist; created in 50-02/03
- [ ] `backend/src/services/intellect/dream-prompts/admin.md` — does not exist; created in 50-02
- [ ] `backend/src/services/intellect/dream-prompts/data-room.md` — does not exist; created in 50-03
- [ ] Marker files: `Porter/admin/frontend/.admin-silo`, `ymc.capital/site/app/routes/admin/.admin-silo`, `ymc.capital/{dealdocs,workoutdocs}/.data-room-silo`, `ymc.capital-private/workoutdocs/.data-room-silo`, `Funds/.data-room-silo` — all need creation + commits (cross-repo)
- [ ] No new framework install needed

---

## State of the Art

| Old Approach (pre-Phase 50) | Current Approach (post-Phase 50) | When Changed | Impact |
|-----------------------------|----------------------------------|--------------|--------|
| Single workflow row drives software dream cadence; `silos.cadence_seconds` is metadata-only | Per-silo scheduler tick reads `silos.cadence_seconds`; workflow row retired | Phase 50 MSF-04 | Enrolling new silo with new cadence = INSERT silos row, no code change |
| Silo enrollment requires INSERT + prompt file (Phase 48.1); cadence requires workflow row + scheduler tag (a code change) | Silo enrollment = INSERT silos row + INSERT directives rows + commit prompt file + commit marker file. Zero code changes | Phase 50 | True data-driven enrollment |
| Software is the only silo with seeds (5 moe-direct directives) | 3 silos seeded: software (5+), admin (4+), data-room (5+) | Phase 50 | Memory pipeline operates across operator's full work surface |
| /context emits up to 4 sections (System + Silo + Project + Concepts/Episodes) | /context can emit up to 6 sections per call when at multi-silo cwds (System + 2 Silos + Project + Concepts/Episodes) | Phase 50 | Layered context for operators working at code-and-admin overlap (Porter admin frontend) |

**Deprecated / outdated:**
- `'Software dream — weekly consolidation'` workflow row — replaced by per-silo scheduler tick. Migration deletes it.

---

## Sources

### Primary (HIGH confidence)

- Live DB 2026-05-16: `SELECT id, cadence_seconds, default_model FROM silos` → confirmed 1 row (software), 604800 cadence
- Live DB 2026-05-16: `SELECT scope, scope_id, COUNT(*) FROM directives WHERE scope='silo'` → 4 buckets (software=9, admin=1 [test row], software-smoke-48.3=6, software-smoke-48.4=34)
- Live DB 2026-05-16: `SELECT name, trigger_type, trigger_value, action_type, action_config FROM workflows WHERE action_type LIKE 'dream%'` → 2 rows (Software dream weekly + Sweep stuck dream runs)
- Live DB 2026-05-16: `\d dream_runs` confirmed silo_id TEXT NOT NULL (not scope_id)
- Live FS 2026-05-16: `ls /home/lobster/projects/Porter/backend/src/services/intellect/dream-prompts/` → only `software.md` exists
- Live FS 2026-05-16: `ls /home/lobster/projects/ymc.capital/site/app/routes/admin/` → admin directory exists
- Live FS 2026-05-16: `ls /home/lobster/projects/ymc.capital/{dealdocs,workoutdocs}/`, `/home/lobster/projects/Funds/` → all data-room candidate roots exist
- `backend/src/services/intellect/silo-detector.ts` (203 LOC, full read) — detect logic confirmed silo-agnostic
- `backend/src/services/intellect/dream-worker.ts` (677 LOC, full read) — silo-agnostic except for prompt-file path resolution which reads from DB row
- `backend/src/services/intellect/dream-sampler.ts` (349 LOC, full read) — silo_id passed as parameter, no hardcoded value
- `backend/src/services/scheduler.ts` (873 LOC, key sections read) — tick architecture + INTELLECT_WEEKLY_INTERVAL=302400 confirmed
- `backend/src/services/intellect/workflow-engine.ts` (391 LOC, full read) — `dream_run` action handler + BUILTIN_WORKFLOWS array confirmed
- `backend/src/routes/v1/intellect.ts` lines 230-281, 600-678 — silo injection in /context + POST /dream-run handler
- `backend/src/db/migrate-silos-v1.ts` (143 LOC, full read) — migration pattern + trigger definition
- `backend/src/services/intellect/dream-prompts/software.md` (113 lines, full read) — template structure for admin.md + data-room.md
- `.planning/REQUIREMENTS.md` lines 36-39 — MSF-01..04 locked text
- `.planning/ROADMAP.md` lines 34-43 — Phase 50 entry + dependency chain
- `.planning/phases/48.1-silo-foundation/48.1-RESEARCH.md` — silos schema + trigger pattern
- `.planning/phases/48.3-software-dream-worker/48.3-RESEARCH.md` lines 1-400 — dream-worker design discipline
- `.planning/phases/49-pattern-detection/49-RESEARCH.md` — project-scope schema confirmation + detectProject implementation
- `CHECKPOINT.md` 2026-05-16 — Phase 49 closeout context

### Secondary (MEDIUM confidence)

- `backend/src/services/intellect/silo-directives/software.md` — source-controlled mirror of software silo seeds; precedent for admin/data-room mirrors if planner wants them (optional)

### Tertiary (LOW confidence)

- None — every claim is backed by live code, live DB query, or canonical planning documents

---

## Metadata

**Confidence breakdown:**
- Silo schema + seed pattern: HIGH — direct extension of Phase 48.1 work, identical INSERT shape
- Detect rules design: HIGH — `cwd_markers` mechanism verified live in silo-detector.ts:124-138
- Admin seed directive content: MEDIUM — drafted from REQUIREMENTS.md + observed admin-work patterns; planner may tune
- Data-room seed directive content: MEDIUM — drafted from REQUIREMENTS.md + Moe's memory directives (no synthetic exhibits, strategic communication, regulatory filer profile); planner may tune
- Prompt template design: HIGH — direct adapt-from-software.md with domain framing; no Zod/parser changes required
- Silo-agnostic refactor audit: HIGH — exhaustive grep confirmed only 2 `'software'` defaults, both safe fallbacks
- Per-silo cadence (option B): HIGH — scheduler tick mechanism is well-established; `silos.cadence_seconds` column already exists; `dream-worker.ts` skip-recent guard refactor is a 10-LOC change
- Multi-match precedence: HIGH — current behavior is all-match; verified by reading silo-detector.ts:101-138 returning `DetectedSilo[]` array
- Migration risk: HIGH — pure INSERTs + idempotent + schema_migrations guarded
- Plan slicing: MEDIUM — 4-5 plan recommendation is opinionated; coarse alternative also valid

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days — stable codebase; major work surface is data-layer, low churn)

---

## RESEARCH COMPLETE
