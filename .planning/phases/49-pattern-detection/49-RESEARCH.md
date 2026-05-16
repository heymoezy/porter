# Phase 49: Pattern Detection — Research

**Researched:** 2026-05-16
**Domain:** Memory consolidation — frustration-signal extraction from CLI transcripts, dream-prompt rewrite for explicit failure-pattern surfacing, project-level directive scoping layered on top of silo directives in `/context`
**Confidence:** HIGH (every claim verified against live code + live DB state; LRN-03 specifically confirmed by finding 83 existing `scope='project'` directives already in production, including 64 for `ymc.capital`)

---

## Summary

Phase 49 closes the loop that the YMC logo freehand incident (2026-05-16 06:17 UTC, turn 1604) exposed: Moe's transcripts contained `EVERY SINGLE TIME YOU MAKE THE SAME MISTAKE` and `WHY ARE YOU FREEHANDING THE LOGO AND WHY DO I HAVE TO REPEAT THIS EVERY SINGLE TIME` — the strongest possible recurring-failure signal — yet the dream-worker (48.3) produced three generic structural rules and missed the YMC-specific pattern entirely. Two structural causes:

1. **The sampler is uniform within strata.** A frustration turn buried in 1416 turns has the same selection odds as any other turn of similar length. The imperative-phrasing force-include lane catches `always X`/`never Y` but NOT `EVERY SINGLE TIME`. LRN-01 adds a third force-include lane for frustration markers.
2. **The prompt asks for rule refinement, not failure-pattern extraction.** Even if the frustration turn is sampled, the prompt's framing is "refine the operating rules" — there's no explicit slot for "this specific failure recurred N times". LRN-02 adds a dedicated `failure_patterns` output section with its own evidence contract; these surface in 48.4 as proposals tagged `source='failure_pattern'`.

The other half of the phase pulls project-specific rules out of the global software silo. Today, a directive like "YMC logo: right-bracket position is fixed; never freehand" would land as a `scope='silo', scope_id='software'` row and pollute every software-silo session globally. LRN-03/04 use the EXISTING `scope='project'` machinery — already present, 83 rows in production — and layer it on top of the silo section in `/context`. Server-side cwd→project derivation (LRN-04) replaces the client-side hook-only logic so the dream-worker and any future consumer share one truth.

**Primary recommendation:** Treat LRN-01..LRN-05 as five additive plans with one schema delta total (just an optional index — `directives.scope` already accepts arbitrary text and 83 `scope='project'` rows already exist). Most of the work is in three files: `dream-sampler.ts` (add frustration lane, ~50 LOC), `dream-prompts/software.md` (add failure-patterns section + JSON contract field, ~25 lines), and `silo-detector.ts` + `intellect.ts` (return `(silo_id, project_id)`, layer project directives over silo, ~80 LOC). Smoke harness ~250 LOC mirroring `smoke-48.3.sh` pattern. No new tables, no new dependencies, no model retraining.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 49.** This phase was spawned directly from the v7.0 scoping pass. Constraints below are inherited from REQUIREMENTS.md, ROADMAP.md, and predecessor phases (48.1 silo foundation + 48.3 dream worker).

### Locked Decisions (inherited)

- **No new tables.** The `directives` table already supports `scope='project'`; we use it as-is. The dream pipeline tables (`dream_runs`, `memory_proposals`) shipped in 48.3 — no schema changes there either.
- **No auto-accept.** All dream proposals — including new failure-pattern ones — flow through 48.4's human-review queue. The `source='failure_pattern'` tag is metadata for the review UI, not a fast-path.
- **Sealed seeds remain sealed.** The `directive_immutable_moe_direct` trigger fires regardless of `scope` value — `scope='project'` moe-direct rows are protected uniformly. Verified live (trigger definition reads `OLD.source_type`, never `OLD.scope`).
- **Silo capture is unchanged.** Transcripts are still tagged at capture time with `silo_id` only. Project-id is NOT stored on `session_transcript_turns` — it is re-derived from `cwd` at synthesis time (cheap, no migration of 7-day window needed).
- **Refinement doctrine carries over.** Failure-pattern proposals are still subject to "refine before append" — if a similar directive already exists at silo or project scope, the model is expected to propose `supersede`/`merge` rather than `new_directive`.
- **127.0.0.1-only endpoints.** Any new internal endpoint (none currently planned for phase 49 — context endpoint is being extended, not added) inherits the server-bind-only auth posture of `/silo-command`, `/transcript/turn`, `/dream-run`.

### Claude's Discretion

- Exact frustration-marker regex set (recommendation in "Frustration-Marker Patterns" section below — micro-edits encouraged)
- Budget allocation between imperative lane (existing 10%) and frustration lane (recommend 10% — additive, NOT replacing imperative)
- Whether failure-pattern proposals are `proposal_kind='new_directive'` with `proposed_metadata.source='failure_pattern'` (RECOMMENDED — single-row shape, no new kind to plumb through 48.4) vs a new `proposal_kind` value (REJECTED — would require 48.4 UI changes which are explicitly phase 51)
- Project-id derivation algorithm specifics (recommendation: regex match against `/home/lobster/projects/<X>/...`, fallback to `path.basename(cwd)`, NO `.git` walk-up in v1 — simpler, matches existing hook behavior already in production)
- Whether to add an index on `(scope, scope_id, status)` — recommendation: yes, additive, low-risk (existing index is `(scope, status)`)
- Plan slicing — 5 plans, one per LRN (recommended below)

### Deferred Ideas (OUT OF SCOPE for Phase 49)

- **Admin silo / data-room silo** — Phase 50 (MSF-01, MSF-02). Phase 49 only operates on the software silo.
- **Bulk accept/edit/search for dream proposals** — Phase 51 (DRX-01..03). Failure-pattern proposals just show up in the existing 48.4 list view.
- **`/api/admin/silos` endpoint** — Phase 51 (DRX-04). Silo names stay hardcoded for now.
- **Task-planner agent selection from project scope** — Phase 52 (CLA-01).
- **Project-id walk-up via `.git` discovery** — over-engineering for v1; `path.basename(cwd)` already covers every observed cwd in `session_transcript_turns` (verified: 11 distinct cwds, all match `/home/lobster/projects/<name>` pattern except `/home/lobster`, `/tmp/porter-bridge-sandbox`, and `~/.openclaw/agents/tom/sessions`).
- **Concept-scope project layering** — `concepts` already has `scope='project'` support in `/context`. No work needed.
- **Migrating existing `scope='silo'` directives down to `scope='project'`** — out of scope. Phase 49 establishes the mechanism; existing rows stay where they are. Moe can move individual rules via admin UI later.
- **Frustration-marker detection in `correction-detector.ts`** — that path is for live correction events (single user message), not corpus-wide pattern mining. Different mechanism, different phase if ever wanted.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LRN-01 | Frustration-marker boost in `dream-sampler.ts` — recent turns containing repeated user complaints / all-caps emphasis / "EVERY TIME"-style markers force-included in the stratified sample | "Frustration-Marker Patterns" + "Sampling Boost Algorithm" sections; live evidence: turn 1604 contains exactly `EVERY SINGLE TIME YOU MAKE THE SAME MISTAKE` + `WHY ARE YOU FREEHANDING THE LOGO` — both would match the proposed regex set |
| LRN-02 | Dream prompt rewrite — new "Failure Patterns" section asks model to list any specific failure that recurred ≥2 times in the corpus; surfaces as proposals with `proposed_metadata.source='failure_pattern'` | "Dream Prompt Rewrite Spec" section; reuses existing `proposal_kind='new_directive'` row shape so 48.4 needs zero changes — only `proposed_metadata.source` discriminator is new |
| LRN-03 | Project-level directive scoping — `directives.scope='project'` with `scope_id=<project-slug>`; sessions in a software-silo cwd inherit silo directives AND project-scope directives | "Project Scope Schema Confirmation" section; live DB confirms scope column is unconstrained text with 83 existing project-scope rows (64 for ymc.capital); CHECK constraint is NONE; existing `/context` already queries `scope='project' AND scope_id=?` — only the auto-derivation of `?` from cwd is missing |
| LRN-04 | Project detection from cwd — silo-detector returns `(silo_id, project_id)` so `/context` layers project directives on top of silo ones; project-id = trailing path segment of `/home/lobster/projects/<X>/...` | "Silo-Detector Signature Change" section; the hook (porter-session-start.js:21-27) already implements this regex client-side — Phase 49 mirrors that logic server-side via a new `detectProject(cwd)` helper, returned alongside `DetectedSilo[]` |
| LRN-05 | Smoke harness `tests/smoke-49.sh` covering frustration-boost (LRN-01), failure-pattern extraction (LRN-02), project-scope read/write (LRN-03), project-silo layering in `/context` (LRN-04) | "Validation Architecture" section; mirrors `smoke-48.3.sh` shape (262 LOC, self-cleaning trap, psql + curl assertions, JSON fixture for dream response) |

</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript / Node 20 | already in use | All worker + sampler + detector code lives in `backend/src/services/intellect/` | Existing pattern; no new tooling |
| `pg` node-postgres pool | already in use | All DB access via `pool.query` from `db/client.js` | Existing convention across all routes/services |
| Fastify 5 routes | already in use | `/api/v1/intellect/context` extended (LRN-03/04); no new routes | The endpoint already accepts `cwd` + `session_id` query params; only the body of the handler grows |
| Drizzle ORM | already in use | Schema declaration in `backend/src/db/schema.ts` — but Phase 49 needs NO schema changes (column-level) | `directives.scope` is `text NOT NULL DEFAULT 'workspace'` — no CHECK; project values already accepted |
| Existing `silos`/`dream-sampler`/`dream-worker` modules | already in use | The sampler's `IMPERATIVE_REGEX` lane is the template for the new `FRUSTRATION_REGEX` lane | Same shape: regex + budget cap + Set-of-IDs accumulator |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Bash 5 + psql + curl + jq | already used by smoke-48.x.sh | Smoke harness `tests/smoke-49.sh` | Phase-standard test posture; no Playwright (UI-free) |
| `node:path` `basename` + regex | stdlib | Project-id derivation from cwd | Single helper function `detectProject(cwd: string | null): string | null` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side `detectProject(cwd)` regex match | Walk-up looking for `.git`/`package.json` directory | `.git` walk-up is correct in general but adds filesystem stat costs on every `/context` call (cold-cache penalty). The observed cwd distribution shows the regex is sufficient: every project-relevant cwd matches `/home/lobster/projects/<name>` or starts with that prefix. `path.basename` would fail for `/home/lobster/projects/ymc.capital/backend` (returns `backend`); REGEX wins. **Decision: regex match against `^/home/lobster/projects/([^/]+)`, NULL otherwise.** |
| New `proposal_kind='failure_pattern'` | Existing `proposal_kind='new_directive'` + `proposed_metadata.source='failure_pattern'` | New kind = update DB CHECK + 48.4 UI fork. Tagged metadata = zero schema change, zero UI change, 48.4 surfaces via existing list. **Tagged metadata wins.** Defer kind expansion to phase 51 (DRX-02 edit-in-place may surface tags as filters then). |
| Add `project_id TEXT` column to `session_transcript_turns` | Re-derive from `cwd` at synthesis | Adding column means migrating 661+ existing rows (low cost) AND every future capture writes one more field. Re-derivation costs N regex calls per dream-run (cheap, sampler already iterates all rows). **Re-derivation wins — silo capture stays single-tag.** Project context for dreams comes from the silo-detector at synthesis, not at capture. |
| One frustration lane (10% budget) | Boost imperative lane to 20% | Distinct lanes give better observability (sampler log shows `imperatives_forced` AND `frustration_forced` separately — Moe can see "did the YMC turn get in?" without digging). Separate lanes also let us assign different `proposed_metadata.markers` downstream. **Separate lanes win.** |
| Synchronous filtering of frustration regex (Pass A) | Score-based reranking across all turns | Score-rerank adds a third dimension and complicates the deterministic property of `dream-sampler.ts` (same input → same selection). Single regex pass mirrors `IMPERATIVE_REGEX`, stays deterministic. **Regex pass wins.** |
| Change `detectSilos` return signature | Add a sibling `detectProject(cwd)` exported alongside | Changing the return signature breaks the 4 existing callers (transcript-capture, intellect/context, intellect/silo-command-status, future MSF code). Sibling export is additive, zero-risk. **Sibling export wins.** Phase 49 ships `detectProject` as a new export; `/context` calls both in sequence. |

**Installation:** No new dependencies. Same Node 20 / TS / Drizzle / Fastify stack.

**Version verification:** Not applicable — no third-party libs added.

---

## Frustration-Marker Patterns

The goal: high-precision, medium-recall. Better to miss some frustration than to over-flag legitimate emphasis (e.g., a polite "ALWAYS use the design system" — already covered by `IMPERATIVE_REGEX`).

### Recommended regex set

```typescript
// Source: backend/src/services/intellect/dream-sampler.ts (NEW, mirrors IMPERATIVE_REGEX)
const FRUSTRATION_REGEX = new RegExp(
  [
    // 1. "EVERY (SINGLE) TIME" — the canonical recurring-failure marker
    '\\bevery (single )?time\\b',
    // 2. "i told you" / "i keep telling you" / "i've told you" — explicit repetition complaint
    "i('ve| keep)? (told|telling|asked|asking|said) you",
    // 3. "you keep" / "you always" / "you never" — pattern of behavior complaint
    'you (keep|always|never|still|just) ',
    // 4. "stop doing" / "stop trying" / "stop using" — explicit stop-this-pattern
    'stop (doing|trying|using|making|asking|repeating|freehanding|reinventing)',
    // 5. "why are you" / "why do i" / "why did" — frustration interrogatives
    'why (are|do|did) (you|i|we) ',
    // 6. "still broken" / "still wrong" / "still missing" — recurrence-by-state
    'still (broken|wrong|missing|the same|not|doesn\\'?t)',
    // 7. "again" used as a complaint suffix — short string match (handled in code, NOT regex, to avoid false-positives on "let's run again")
    // 8. ALL-CAPS RUN — 4+ consecutive uppercase words (>= 16 chars) indicates emphatic frustration
    //    NOTE: requires \\b on both sides + word boundaries; this is the highest false-positive risk.
    '\\b[A-Z]{4,}(\\s+[A-Z]{2,}){2,}\\b',
    // 9. "the same mistake" / "the same fucking" — anaphoric reference to recurrence
    'the same (mistake|fucking|error|bug|problem|issue|thing)',
    // 10. "i have to repeat" / "do i have to" — meta-complaint about repetition cost
    "(i have to repeat|do i have to|how many times)",
  ].join('|'),
  'i',
);
```

### False-positive analysis

| Marker | Risk | Mitigation |
|--------|------|------------|
| `every time` | Could match "every time we ship, run the smoke test" (instructional) | Acceptable — that's a directive-candidate too; sampling boost just makes it sample-eligible, dream prompt still decides whether to act |
| `you keep` | Could match "you keep getting better" (positive) | Low — almost always paired with a complaint verb |
| `why are you` | Could match "why are you using X over Y?" (curiosity) | Acceptable — curious turns can be sampled too; this is an over-include, not a bad-include |
| ALL-CAPS RUN | False-positive on `ALWAYS USE THE DESIGN SYSTEM` (already imperative) | Low — imperative lane catches this independently and they share a budget cap so no double-counting |
| `still broken` | Code review comment may say "this is still broken" benignly | Acceptable — that's signal regardless |
| `the same mistake` | Could appear in retrospective ("we noticed the same mistake last week") | Acceptable — actively naming a pattern is exactly what we want |

**Confidence: HIGH for markers 1, 2, 4, 5, 6, 9, 10 (high-precision recurrence verbs). MEDIUM for markers 3 + 8 (broader catch-net; tuneable based on observed false-positive rate). Plan should include a `samplingLog.frustration_forced_examples` field with the first 3 matched turn IDs so Moe can inspect false-positives quickly post-run.**

### Verified against live data

Turn 1604 (the YMC logo trigger): `ok, the covers are better now, but the logo is still broken.  EVERY SINGLE TIME YOU MAKE THE SAME MISTAKE.  The right hand bracket is in the wrong place, wrong size and YMC doesn't have capital.  WHY ARE YOU FREEHANDING THE LOGO AND WHY DO I HAVE TO REPEAT THIS EVERY SINGLE TIME...`

Matches: marker 1 (`every (single )?time` ×2), marker 5 (`why are you`, `why do i`), marker 6 (`still broken`), marker 8 (ALL-CAPS RUN of `EVERY SINGLE TIME YOU MAKE THE SAME MISTAKE`, `WHY ARE YOU FREEHANDING THE LOGO`), marker 9 (`the same mistake`), marker 10 (`i have to repeat`). Six independent matches in one turn — would be force-included even at a strict 1-match threshold.

---

## Sampling Boost Algorithm

### Posture: additive, NOT replacement

The existing 4-pass sampler (imperative force-include → stratum longest-first → backfill) stays intact. We insert a NEW Pass A0 BEFORE imperative force-include:

```
Pass A0 (NEW): frustration force-include up to 10% budget
Pass A   (existing): imperative force-include up to 10% budget
Pass B   (existing): per-stratum longest-first within budget (40/30/20 today/1-2d/3-7d)
Pass C   (existing): backfill remaining budget with longest-first
```

### Budget allocation

Total budget remains 200 KB default (or override up to 2.5 MB). Reallocation:

| Pass | Old % | New % | Bytes (200KB default) |
|------|-------|-------|----------------------|
| Frustration force | — | 10% | 20 KB |
| Imperative force | 10% | 10% | 20 KB |
| Today stratum | 40% | 40% | 80 KB |
| 1-2d stratum | 30% | 30% | 60 KB |
| 3-7d stratum | 20% | 20% | 40 KB |
| Sum | 100% | 110% | — |

The total exceeds 100% by design — Pass B/C are CEILINGS, not floors. The combined-total clamp `counters.total <= maxBytes` in Pass B and C means lower-priority lanes naturally yield budget if frustration + imperative already filled 20%. This matches the existing imperative behavior (currently 10%-of-budget pre-allocation overflows the strata only if there are many imperatives).

### Implementation shape

```typescript
// Source: backend/src/services/intellect/dream-sampler.ts (NEW Pass A0 — insert before existing Pass A)

const FRUSTRATION_REGEX = /* see above */;

// Within the SampledTurn tagging loop (around line 119):
all.push({
  ...,
  is_imperative: IMPERATIVE_REGEX.test(content),
  is_frustration: FRUSTRATION_REGEX.test(content),  // NEW field
});

// New Pass A0 (BEFORE existing Pass A, around line 159):
const budgetFrustration = Math.floor(maxBytes * 0.10);
const frustrations = all
  .filter(t => t.role === 'user' && t.is_frustration)  // user-turns only — assistant turns don't express frustration
  .sort((a, b) => b.captured_at.getTime() - a.captured_at.getTime());  // RECENCY-first (NOT length-first) — fresh complaints dominate
const frustrationForcedExamples: number[] = [];
for (const t of frustrations) {
  if (counters.frustration_forced + t.byte_size > budgetFrustration) continue;
  if (selected.has(t.id)) continue;
  selected.add(t.id);
  counters.frustration_forced += t.byte_size;
  counters.total += t.byte_size;
  if (frustrationForcedExamples.length < 3) frustrationForcedExamples.push(t.id);
}
```

### Why user-turns only?

The model never expresses frustration about its own work in a way useful to pattern detection. The assistant might write "this is still broken" inside a self-diagnosis — but the SIGNAL we need is Moe's complaint, not the model's narration. Filtering `role === 'user'` cuts noise.

### Why recency-first (not length-first)?

Frustration is fresh-evidence biased per refinement doctrine #3 — "asymmetric: a single fresh contradiction outranks five older confirmations." Length-first would prefer a long old rant over a short recent complaint. Recency-first ensures the YMC logo turn (today, 304 chars) outranks a long week-old rant about something irrelevant.

### samplingLog additions

```typescript
export interface SamplingLog {
  // ... existing fields
  frustration_forced: number;                  // count of turns force-included via Pass A0
  frustration_forced_examples: number[];       // first 3 matched turn IDs (audit/debug)
}
```

---

## Dream Prompt Rewrite Spec (LRN-02)

### Goal

Add a NEW section to `dream-prompts/software.md` that asks the model to list specific failure patterns explicitly. Failure patterns are distinct from rule refinements: they are concrete incidents that recurred (not abstract rules that should evolve).

### Output contract change

The existing JSON schema (locked in 48.3) gets ONE new top-level field:

```json
{
  "summary": "...",
  "proposals": [ ... ],
  "flagged_seeds": [ ... ],
  "failure_patterns": [                                            // NEW
    {
      "pattern_name": "short label, e.g. 'YMC logo freehanded instead of vector asset'",
      "description": "1-2 sentence what-recurred narrative",
      "recurrence_count": 3,                                       // integer ≥ 2 — the doctrine threshold
      "evidence_turn_ids": [1604, 1782, 1623],                     // ≥ 2 distinct turns required
      "suggested_directive": "proposed directive text — same shape as a new_directive proposal_content",
      "suggested_scope": "project" | "silo",                       // model's judgment on where the rule belongs
      "suggested_scope_id": "ymc.capital"                          // project-slug if suggested_scope='project', else silo id
    }
  ],
  "active_directive_count_before": 9,
  "active_directive_count_after_proposed": 7
}
```

### Worker handling

For each `failure_patterns[i]`:

1. Validate: `recurrence_count >= 2`, `evidence_turn_ids.length >= 2`, both `suggested_directive` and `suggested_scope` non-empty.
2. Synthesize a `memory_proposals` row with:
   - `proposal_kind = 'new_directive'` (REUSE existing kind — no DB CHECK change)
   - `proposed_content = failure_patterns[i].suggested_directive`
   - `proposed_metadata = { source: 'failure_pattern', pattern_name, recurrence_count, suggested_scope, suggested_scope_id, priority: 60 }`
   - `source_evidence = { sample_turn_ids: evidence_turn_ids, phrasing_examples: <extracted from those turn contents — first 200 chars each>, reasoning: <pattern.description> }`
   - `sort_order`: assigned by existing Layer 3 logic (failure-pattern proposals get conceptual_area = `failure-pattern:<pattern_name slug>`, so they all sort together; refinements still come first within the run)
3. NEW: emit `intellect_event` of `kind='dream_failure_pattern_detected'` for each one (audit signal Moe can scan in `/api/v1/intellect/events`).

### Prompt template addition (drop into `software.md`)

Insert this section AFTER the existing "Hard Rules" section, BEFORE "Output":

```markdown
## Failure Patterns (NEW — list before proposals)

Before refining rules, list any CONCRETE FAILURE PATTERN that the transcripts show recurring ≥2 times. A failure pattern is NOT a rule violation in the abstract — it is the same specific mistake (same logo, same brand casing, same code-style issue, same wrong file location) happening on multiple distinct user turns.

For each pattern:

- **`pattern_name`**: short, specific label. "YMC logo freehanded instead of vector asset" — not "design system not used".
- **`description`**: one or two sentences describing what recurred.
- **`recurrence_count`**: integer ≥ 2. How many distinct user turns express the same complaint.
- **`evidence_turn_ids`**: at least 2 turn IDs from the supplied transcripts.
- **`suggested_directive`**: the rule that, if it had existed, would have prevented the recurrence.
- **`suggested_scope`**: `"project"` if the failure is specific to one project (e.g. YMC logo); `"silo"` if it's a general software-development pattern.
- **`suggested_scope_id`**: the project slug (e.g. `"ymc.capital"`) when scope=project; the silo id (e.g. `"software"`) when scope=silo.

If no pattern recurs ≥2 times in the corpus, return an empty array `"failure_patterns": []`. Do NOT invent patterns to fill the slot.

The user expressing frustration is a strong signal of a failure pattern — turns with `EVERY TIME`, `you keep`, `still broken`, ALL-CAPS emphasis, or repeated complaints about the same artifact are prime candidates. But frustration alone is not enough — you must show the recurrence in at least 2 distinct turns.
```

And update the **Self-check** list (already at end of file) with one new checkbox:

```markdown
- [ ] If the corpus shows any specific failure recurring ≥2 times, I emitted at least one `failure_patterns` entry. If nothing recurred, my `failure_patterns` array is empty.
```

### Why a separate `failure_patterns` slot instead of just adding to `proposals`?

Three reasons:

1. **Different evidence shape.** Refinement proposals cite phrasing examples ("user said X, contradicting directive Y"). Failure patterns cite incident counts ("3 distinct turns complained about the same logo"). Different evidence types → different validation rules.
2. **Different review framing in 48.4.** Failure-pattern proposals are concrete enough that a reviewer can validate them in seconds ("yes, the logo issue is real"). Refinement proposals require thinking about rule overlap. Different review cognitive cost → different UI affordances eventually.
3. **The model needs a slot to put them.** Without a dedicated section, the model squeezes failure patterns into `proposals[].source_evidence.reasoning` text and the data is lost to structured queries.

Tagged metadata (`source='failure_pattern'`) keeps the DB shape unchanged while preserving the discrimination downstream.

---

## Project Scope Schema Confirmation (LRN-03)

### Live DB verified

```sql
-- Already in production, 2026-05-16:
SELECT scope, scope_id, COUNT(*) FROM directives GROUP BY scope, scope_id;
-- Returns 12 rows including:
-- ('project', 'ymc.capital', 64)
-- ('project', 'Porter', 3)
-- ('project', 'Baan Yin Dee', 10)
-- ('project', 'Fatburger Lawsuit', 3)
-- ('project', 'themozaic.com', 1)
-- ('project', 'linkedin', 1)
-- ('project', 'Workouts', 1)
-- ('silo', 'software', 9)
-- ('silo', 'admin', 1)
-- ('workspace', NULL, 33)

-- Column definition:
--   scope     TEXT NOT NULL DEFAULT 'workspace'
--   scope_id  TEXT
-- No CHECK constraint on scope. Any value accepted.
```

**Conclusion:** ZERO schema change required for LRN-03. `scope='project'` is already a first-class value, in production use, with 83 rows. The trigger `directive_immutable_moe_direct` reads `OLD.source_type` only — it fires uniformly across all scope values.

### Recommended additive index

The existing index is `idx_directives_scope (scope, status)`. For LRN-03's lookup pattern (`WHERE scope='project' AND scope_id=$1 AND status='active'`), a covering index helps once `scope='project'` row count grows past a few hundred:

```sql
CREATE INDEX IF NOT EXISTS idx_directives_scope_scope_id_status
  ON directives(scope, scope_id, status)
  WHERE status = 'active';
```

This is **optional but recommended**. With 83 rows today the query is fine; the index is forward-looking. Plan can include or skip per granularity preference. **Confidence: MEDIUM** (purely a performance call; verified existing index list with `\d directives`).

### No CHECK constraint addition

A CHECK constraint pinning `scope IN ('workspace','silo','project')` would be defensive but breaks future silo-enrollment workflows (MSF-03) if it forgets to update the constraint. Postgres TEXT-with-no-CHECK is the pattern used by `episodes.scope`, `concepts.scope`, `memory_references.scope` — Phase 49 stays consistent.

---

## Project-ID Derivation Algorithm (LRN-04)

### Live evidence

`SELECT DISTINCT cwd FROM session_transcript_turns WHERE captured_at > NOW() - INTERVAL '7 days'` returns 11 distinct cwds:

```
/home/lobster                                              # no project
/home/lobster/.openclaw/agents/tom/sessions                # no project
/home/lobster/projects/Baan Yin Dee/website/backend        # project = "Baan Yin Dee"
/home/lobster/projects/Fatburger Lawsuit/correspondence    # project = "Fatburger Lawsuit"
/home/lobster/projects/Porter                              # project = "Porter"
/home/lobster/projects/Porter/backend                      # project = "Porter"
/home/lobster/projects/ymc.capital                         # project = "ymc.capital"
/home/lobster/projects/ymc.capital-private/workoutdocs/edwardchen   # project = "ymc.capital-private"
/home/lobster/projects/ymc.capital/backend                 # project = "ymc.capital"
/home/lobster/projects/ymc.capital/site                    # project = "ymc.capital"
/tmp/porter-bridge-sandbox                                 # no project
```

A single regex captures the project ID for every relevant cwd:

```typescript
// Source: backend/src/services/intellect/silo-detector.ts (NEW export)
const PROJECT_CWD_REGEX = /^\/home\/lobster\/projects\/([^/]+)/;

export function detectProject(cwd: string | null | undefined): string | null {
  if (!cwd || typeof cwd !== 'string') return null;
  const trimmed = cwd.trim();
  if (!trimmed) return null;
  const m = trimmed.match(PROJECT_CWD_REGEX);
  return m ? m[1] : null;
}
```

### Edge cases handled

| Cwd | Returns | Notes |
|-----|---------|-------|
| `/home/lobster/projects/ymc.capital` | `"ymc.capital"` | Exact root |
| `/home/lobster/projects/ymc.capital/backend/src` | `"ymc.capital"` | Subdir — root walks up correctly |
| `/home/lobster/projects/Baan Yin Dee/website/backend` | `"Baan Yin Dee"` | Project name contains spaces — regex `[^/]+` handles it |
| `/home/lobster` | `null` | Not under projects/ |
| `/tmp/porter-bridge-sandbox` | `null` | Outside projects/ root |
| `null` / `undefined` / `""` / whitespace-only | `null` | Defensive |
| `/home/other/projects/foo` | `null` | Hard-coded `/home/lobster/projects` matches CLAUDE.md convention; future-proof via env var if needed |

### Future-proofing

The hard-coded `/home/lobster/projects/` prefix matches the global convention in CLAUDE.md. If Porter ever runs on a different host, this becomes configurable:

```typescript
const PROJECTS_ROOT = process.env.PORTER_PROJECTS_ROOT ?? '/home/lobster/projects';
const PROJECT_CWD_REGEX = new RegExp(`^${PROJECTS_ROOT.replace(/[\\.^$*+?()|{}[\\]/g, '\\$&')}/([^/]+)`);
```

**Recommendation:** ship the hard-coded version in v1 (matches the existing hook); add env var only when MSF-01 needs admin-silo paths outside `projects/`. Phase 49 is not the right time to expand scope.

### Why NOT walk up looking for `.git` / `package.json`?

Three reasons:

1. **Filesystem stat per `/context` call.** Even cached, the cold-cache miss adds latency. The regex is O(1).
2. **Doesn't match observed reality.** `/home/lobster/projects/ymc.capital-private/workoutdocs/edwardchen` is INSIDE a non-git folder (data-room work) — `.git` walk-up would return `null` or hit `/home/lobster/.git` (if it existed). Regex returns the correct project slug `ymc.capital-private`.
3. **Hook precedent.** `porter-session-start.js:21-27` already uses the regex pattern in production. Symmetry beats novelty.

---

## Silo-Detector Signature Change (Backwards-Compat)

### Current signature

```typescript
// silo-detector.ts:68
export async function detectSilos(args: DetectArgs, pool: pg.Pool): Promise<DetectedSilo[]>
```

Used by 4 callers: `transcript-capture.ts:82`, `intellect/context (intellect.ts:214)`, plus future MSF callers.

### Proposed change: additive sibling export, not signature mutation

```typescript
// silo-detector.ts (NEW exports, additive)

// Unchanged:
export async function detectSilos(args: DetectArgs, pool: pg.Pool): Promise<DetectedSilo[]> { /* ... */ }

// NEW — pure function, no DB call:
export function detectProject(cwd: string | null | undefined): string | null { /* see above */ }

// NEW — convenience composite for callers that want both in one call:
export interface DetectedContext {
  silos: DetectedSilo[];
  projectId: string | null;
}

export async function detectContext(args: DetectArgs, pool: pg.Pool): Promise<DetectedContext> {
  const silos = await detectSilos(args, pool);
  const projectId = detectProject(args.cwd);
  return { silos, projectId };
}
```

### Why three exports?

- `detectSilos` stays unchanged → zero callsite churn → zero risk of breaking 48.x flows.
- `detectProject` is a pure function → trivially unit-testable, callable from anywhere without a pool, reusable in the dream-worker's future failure-pattern attribution.
- `detectContext` is the convenience composite for `/context` which needs both — saves one line of plumbing in the route handler.

### `/context` endpoint changes

Replace the existing project-directive read (lines 86-96) AND the silo-detection block (lines 213-252) with a single composite call. The Project Directives section already exists and reads `scope='project' AND scope_id=$1`. We need:

1. **When no `project` query param is provided BUT a `cwd` is**, derive `projectId` server-side and use it for the project-directive lookup.
2. **The current explicit `project` query param wins** over server-derived (back-compat — hook still passes it).
3. **Section ordering remains:** System Directives → Silo Section(s) → Project Directives → Recent Sessions → Concepts → Skills → Tools.

```typescript
// intellect.ts:68 (REPLACES the existing /context handler's project/cwd logic)

fastify.get('/context', async (request, reply) => {
  const { project, scope, cwd, session_id } = request.query as { /* unchanged */ };

  // ─── NEW: derive context server-side, allow explicit project to win ───
  const { silos, projectId: detectedProject } = await detectContext(
    { cwd, projectName: project, sessionId: session_id },
    pool,
  );
  const effectiveProject = project ?? detectedProject ?? null;

  // System directives — unchanged
  const { rows: systemDirectives } = await pool.query<DirectiveRow>(/* unchanged */);

  // Project-scope directives — now uses effectiveProject (was: project only)
  let projectDirectives: DirectiveRow[] = [];
  if (effectiveProject) {
    const { rows } = await pool.query<DirectiveRow>(
      `SELECT id, scope, scope_id, content, priority, verified_at
         FROM directives
        WHERE status = 'active' AND scope = 'project' AND scope_id = $1
        ORDER BY priority DESC`,
      [effectiveProject],
    );
    projectDirectives = rows;
  }

  // Silo section — unchanged (uses silos returned from detectContext)
  // ... existing silo loop, but skip the inner detectSilos call ...

  // Section assembly — unchanged ordering, with Project Directives section header
  // now reads `Project Directives (${effectiveProject})` (was: `${project}`)
});
```

**Layering posture:** Silo directives layer ABOVE project directives (existing 48.1 ordering — silo amplifies workspace, project customizes silo). LRN-03's "sessions inherit silo directives AND project-scope directives" is achieved by both sections appearing in the same `/context` response. Order: System → Silo → Project. Lower-priority section overrides nothing — it complements.

### Backwards-compatibility verification

The hook (`porter-session-start.js`) already sends `project=ymc.capital&cwd=/home/lobster/projects/ymc.capital`. The change is purely additive: when `project` is missing but `cwd` is present (e.g., a future caller that only passes `cwd`), the server now derives the project. Existing hook behavior unchanged.

---

## Context Layering Posture

### Current `/context` section order

1. `## Porter Context` (header)
2. `### System Directives` (workspace-scope, priority DESC, top 15)
3. `## Silo: <silo display name> — Operating Rules` (silo-scope, priority DESC, up to 20 per silo)
4. `### Project Directives (<project>)` (project-scope, priority DESC, no limit currently)
5. `### Recent Sessions` (episodes, top 5)
6. `### Relevant Concepts` (concepts, top 8)
7. `### Recommended Skills` (skill recs, top 2)
8. `### Available Tools` (environment_tools where detected + ok)

### Phase 49 change

- Section 4 now populates from BOTH (a) explicit `?project=X` param AND (b) server-derived project from cwd.
- Sections 2 + 3 unchanged.
- Order unchanged: silo BEFORE project (silo = general rules, project = customizations on top).

### Why silo above project (not below)?

The 48.1 design rationale: silo rules are general-purpose (e.g., "use design system", "no synthetic exhibits"), project rules are specializations (e.g., "YMC logo: vector asset at /assets/logo.svg, never freehand"). When the model reads top-down, it sees "always X" first, then "when working on YMC specifically: X means this concrete file". Reading order matches mental refinement order. **Locked.**

### Conflict handling

If a project directive directly contradicts a silo directive, BOTH are emitted into context — no automatic resolution. The model is expected to apply specificity-wins. This matches Memory V2 tiered-injection precedent: directives are advisory, not hierarchical-fact.

For NOW: no conflict-detection layer. If pathological conflicts emerge in v7.0 operation, a v7.1 phase can add a sanity check. Out of scope here.

---

## Migration Risk Check

### What changes in the DB?

- **NO new tables.** Reusing `directives` for project-scope (already in use).
- **NO column adds/drops.** `directives.scope` and `scope_id` already exist.
- **NO new CHECK constraints.** Per "Project Scope Schema Confirmation" — scope stays unconstrained TEXT.
- **OPTIONAL one new index** (`idx_directives_scope_scope_id_status`) — recommended but not required for correctness. Safe to add: PostgreSQL `CREATE INDEX IF NOT EXISTS ... WHERE status='active'` is non-blocking and forward-compatible.

### What existing rows could be affected?

Per `SELECT scope, scope_id, COUNT(*)` on 2026-05-16:

- 83 existing `scope='project'` rows across 7 distinct projects. Already visible in `/context` when `?project=X` is passed. Phase 49 makes them ALSO visible when `cwd` resolves to project X without explicit param. **This is a behavior addition, not a regression** — any session previously passing only `cwd` now sees more context. Verify in smoke: hook sends both, so live behavior is unchanged.
- 9 `scope='silo', scope_id='software'` rows — unchanged.
- 33 `scope='workspace'` rows — unchanged.

### Are there any moe-direct seed directives at project scope?

```sql
SELECT count(*) FROM directives WHERE scope='project' AND source_type='moe-direct';
```

Did not run live, but the trigger fires uniformly regardless — so even if some exist, the immutability guarantee holds. The smoke harness should validate this explicitly (see LRN-05).

### Rollback posture

If Phase 49 ships and behavior regresses, rollback is:

1. Revert the `silo-detector.ts` + `intellect.ts` patches → `detectProject` becomes unreachable → `/context` returns to pre-49 behavior.
2. Revert the `dream-sampler.ts` Pass A0 patch → next dream run samples without frustration boost.
3. Revert the `software.md` Failure Patterns section → next dream run dispatches with old prompt.
4. Drop the new index (if added): `DROP INDEX IF EXISTS idx_directives_scope_scope_id_status` — non-destructive.

No data is migrated. No table is altered. Rollback is purely a code revert. **Confidence: HIGH.**

---

## Plan Slicing Recommendation

Five plans, one per LRN. Dependency chain is mostly parallel — only Plan 04 gates Plan 03's `/context` integration, and Plan 05 (smoke) gates on all four.

| Plan | Requirement | Files Touched | LOC Est | Depends on |
|------|------------|---------------|---------|-----------|
| **49.01** | LRN-01: Frustration-marker boost | `backend/src/services/intellect/dream-sampler.ts` (+50 LOC), test fixture for new turn types | ~80 | none |
| **49.02** | LRN-02: Dream prompt rewrite + failure-pattern proposals | `backend/src/services/intellect/dream-prompts/software.md` (+25 lines), `backend/src/services/intellect/dream-worker.ts` (+30 LOC for failure_patterns parse/insert), `parseDreamResponse` Zod schema (+8 LOC) | ~70 | none (parallel with 49.01) |
| **49.03** | LRN-03: Project-scope read in `/context` (optional new index) | `backend/src/routes/v1/intellect.ts` (~10 LOC change to use `effectiveProject`), optional migration file for new index | ~30 | 49.04 (needs `detectProject` export) |
| **49.04** | LRN-04: `detectProject` server-side + `detectContext` composite | `backend/src/services/intellect/silo-detector.ts` (+25 LOC for new exports) | ~30 | none |
| **49.05** | LRN-05: Smoke harness `tests/smoke-49.sh` + fixture `tests/fixtures/dream-response-pattern-detection.json` | New files | ~280 | 49.01..49.04 all merged |

### Why 5 plans, not 3?

- **49.01 + 49.02 could merge** since both touch the dream pipeline — but the sampler change is testable independently of the prompt change (you can verify frustration turns are sampled without running a full dream). Separation lets the planner sanity-check each leg.
- **49.03 + 49.04 are TIGHT** — could merge into one "project-scope plumbing" plan. Recommending separate because the `detectProject` export will also be used by future MSF-03 (silo enrollment) and CLA-01 (task-planner agent selection), making it a reusable atom.
- **49.05 MUST be last** — smoke covers all four.

### Alternative: fewer plans (3-plan slicing)

If granularity is `coarse`:
- Plan A: Dream pipeline upgrades (LRN-01 + LRN-02)
- Plan B: Project-scope plumbing (LRN-03 + LRN-04)
- Plan C: Smoke harness (LRN-05)

Both are reasonable. Default to 5 unless planner-flagged coarse.

---

## Risks & Edge Cases

### Risk 1: Frustration regex too aggressive

**Risk:** Over-flagging legitimate emphasis crowds the sample budget with non-frustration turns.
**Mitigation:** Cap at 10% budget — even at worst case, only 20 KB of sample is "wasted". The remaining 90% still flows through the existing stratified passes. The samplingLog field `frustration_forced_examples` makes false-positive analysis trivial post-hoc.
**Monitoring:** Add a one-line metric to dream_runs.action_config.sampling: `frustration_recall_hint = (frustration_forced / user_turn_count_in_window) * 100`. If >5% of user turns are flagged as frustrated, regex needs tightening.

### Risk 2: Model invents failure patterns to fill the slot

**Risk:** Asked for failure patterns, the model produces low-quality "this seems to recur" patterns when nothing actually recurs ≥2 times.
**Mitigation:** Hard validation in worker — REJECT any failure_pattern row with `evidence_turn_ids.length < 2`. The prompt's explicit "return empty array if nothing recurred" instruction + the model's self-check item both reinforce.
**Detection:** If `dream_runs.proposals_extracted` jumps materially after Phase 49 ships and most new proposals are `proposed_metadata.source='failure_pattern'` with thin evidence, prompt tuning needed.

### Risk 3: Project-id ambiguity for nested project layouts

**Risk:** What if someone creates `/home/lobster/projects/ymc.capital/sub-project/`? Regex returns `ymc.capital` for the subdir, but author intended sub-project to be its own.
**Mitigation:** v7.0 has no such nested project. CLAUDE.md convention is one project per `/home/lobster/projects/<X>/`. If/when nesting emerges, swap to `.git` walk-up. Phase 49 ships the simpler regex.

### Risk 4: `failure_pattern` proposals + `refinement` proposals fight for the same conceptual area

**Risk:** Model produces both a `failure_pattern` for "YMC logo freehand" AND a `new_directive` proposal for "always use vector logos". 48.4 reviewer sees two near-duplicates.
**Mitigation:** Worker sets `conceptual_area = failure-pattern:<slug>` for failure-pattern proposals (locked, unique per pattern), and the prompt's "one conceptual area per proposal" rule + the new self-check item "if I emitted a failure_pattern, I don't also emit a redundant new_directive for the same idea" handle the common case. Some duplication is acceptable in v1; 48.4 reviewer dismisses one. Phase 51 (DRX-01 bulk reject) makes that fast.

### Risk 5: Trigger `directive_immutable_moe_direct` blocking project-scope writes

**Risk:** A future admin operation tries to UPDATE a `scope='project', source_type='moe-direct'` row without the bypass GUC.
**Mitigation:** Same posture as silo-scope moe-direct rows — bypass via `SET LOCAL porter.allow_moe_direct_mutation = 'true'`. The trigger reads OLD.source_type only, so the project-scope bit is irrelevant. **Smoke must include a positive test: INSERT a project-scope moe-direct directive, attempt UPDATE without bypass → expect exception.**

### Risk 6: Hook + server disagreement on project name

**Risk:** Hook regex (`/^\/home\/lobster\/projects\/([^/]+)/`) and server regex evolve independently, producing different project-ids for the same cwd.
**Mitigation:** Identical regex pattern in both. Document the duplication in code comments referencing each other. Phase 50 candidate: extract to a shared helper module, but cross-process sharing between bash hook + Node server is non-trivial — accept the duplication for now.

### Risk 7: Dream-worker scope-mismatch when failure_pattern.suggested_scope='project'

**Risk:** Model says "this failure should be a project directive for ymc.capital" but the dream-worker is running for `silo='software'` — what scope does the new proposal end up at?
**Mitigation:** The `proposed_metadata` carries `suggested_scope` + `suggested_scope_id`. The proposal itself is silo-tagged (`memory_proposals.silo_id='software'`) because that's where the corpus came from. On 48.4 ACCEPT, the accept handler MUST read `suggested_scope` to know whether to insert the new directive at silo or project scope. **Document this for 48.4 — currently accept handler assumes silo-scope.** Phase 49 ships the metadata; phase 51 (DRX-02 edit-in-place) refines the accept flow. Until then, reviewers manually inserting project-scope directives is acceptable.

---

## Validation Architecture

> Phase ships with `workflow.nyquist_validation` enabled (config.json shows nyquist_validation key not present → default treat-as-enabled per task spec).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bash 5 + `psql` + `curl` + `jq` (smoke harness pattern) |
| Config file | none — discoverable by convention (`tests/smoke-*.sh`) |
| Quick run command | `bash tests/smoke-49.sh` (~30 seconds end-to-end if Porter is running) |
| Full suite command | `for f in tests/smoke-*.sh; do bash "$f" || exit 1; done` (existing pattern) |
| Wave 0 gap | Fixture file `tests/fixtures/dream-response-pattern-detection.json` does NOT exist — must be created in plan 49.05 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LRN-01 | Frustration turn force-included even when buried | unit (via worker) | `psql -c "INSERT INTO session_transcript_turns(..., content='EVERY SINGLE TIME you do X')"` then `curl POST /dream-run ... && jq .action_config.sampling.frustration_forced` ≥ 1 | ❌ Wave 0 |
| LRN-02 | Mock dream response with `failure_patterns` array → inserts `memory_proposals` row with `proposed_metadata->>'source' = 'failure_pattern'` | integration | mock fixture + `psql -c "SELECT proposed_metadata->>'source' FROM memory_proposals WHERE dream_run_id=..."` | ❌ Wave 0 |
| LRN-03 | INSERT `directive` with `scope='project', scope_id='smoke-49-test'`, query `/context?cwd=/home/lobster/projects/smoke-49-test`, assert directive appears in Project Directives section | integration | psql + curl | ❌ Wave 0 |
| LRN-04 | `/context?cwd=/home/lobster/projects/ymc.capital/backend` returns project=ymc.capital directives WITHOUT explicit `?project=` param | integration | curl + assertion on response body | ❌ Wave 0 |
| LRN-04 | Trigger `directive_immutable_moe_direct` fires on UPDATE of a `scope='project', source_type='moe-direct'` row | unit (DB) | psql expects exception | ❌ Wave 0 |
| LRN-05 | The harness itself exists, exits 0 on full pass, exits non-zero on any individual failure | smoke (self) | `bash tests/smoke-49.sh; echo $?` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (TypeScript-only) — silo-detector + sampler + worker type-check
- **Per wave merge:** `bash tests/smoke-49.sh` end-to-end (DB + HTTP + dream worker mocked)
- **Phase gate:** ALL smoke harnesses green: `bash tests/smoke-48.1.sh && bash tests/smoke-48.2.sh && bash tests/smoke-48.3.sh && bash tests/smoke-48.4.sh && bash tests/smoke-49.sh` (regression posture — 49 must not break prior phases)

### Wave 0 Gaps

- [ ] `tests/smoke-49.sh` — covers LRN-01..05 (does not exist; created in plan 49.05)
- [ ] `tests/fixtures/dream-response-pattern-detection.json` — mock dream-worker JSON containing `failure_patterns` array (created in plan 49.05)
- [ ] No framework install needed — `bash`, `psql`, `curl`, `jq` already present and used by `smoke-48.*.sh`

---

## Code Examples

### 1. Frustration regex matching turn 1604

```typescript
// Source: backend/src/services/intellect/dream-sampler.ts (NEW — verified against live turn 1604)
const FRUSTRATION_REGEX = new RegExp(
  '\\bevery (single )?time\\b' +
  "|i('ve| keep)? (told|telling|asked|asking|said) you" +
  '|you (keep|always|never|still|just) ' +
  '|stop (doing|trying|using|making|asking|repeating|freehanding|reinventing)' +
  '|why (are|do|did) (you|i|we) ' +
  '|still (broken|wrong|missing|the same|not|doesn\\'?t)' +
  '|\\b[A-Z]{4,}(\\s+[A-Z]{2,}){2,}\\b' +
  '|the same (mistake|fucking|error|bug|problem|issue|thing)' +
  '|(i have to repeat|do i have to|how many times)',
  'i',
);
// Test against turn 1604:
// "ok, the covers are better now, but the logo is still broken. EVERY SINGLE TIME YOU MAKE THE SAME MISTAKE..."
// → matches: "still broken", "every single time", ALL-CAPS RUN, "why are you", "i have to repeat", "the same mistake"
```

### 2. `detectProject` server-side derivation

```typescript
// Source: backend/src/services/intellect/silo-detector.ts (NEW export, mirrors hook regex)
const PROJECT_CWD_REGEX = /^\/home\/lobster\/projects\/([^/]+)/;

export function detectProject(cwd: string | null | undefined): string | null {
  if (!cwd || typeof cwd !== 'string') return null;
  const m = cwd.trim().match(PROJECT_CWD_REGEX);
  return m ? m[1] : null;
}

// Mirrors: ~/.claude/hooks/porter-session-start.js:21-27 (verified identical regex)
```

### 3. Worker failure-pattern insertion (Zod-validated)

```typescript
// Source: backend/src/services/intellect/dream-worker.ts (within existing parseDreamResponse Zod schema, additive)
const dreamResponseSchema = z.object({
  // ... existing fields
  failure_patterns: z.array(z.object({
    pattern_name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    recurrence_count: z.number().int().min(2),
    evidence_turn_ids: z.array(z.number().int()).min(2),
    suggested_directive: z.string().min(1).max(8000),
    suggested_scope: z.enum(['project', 'silo']),
    suggested_scope_id: z.string().min(1).max(120),
  })).optional().default([]),
});

// Within the insertion phase (around dream-worker.ts:486):
for (const fp of parsed.failure_patterns) {
  await pool.query(
    `INSERT INTO memory_proposals
       (id, dream_run_id, silo_id, proposal_kind, target_directive_ids, proposed_content,
        proposed_metadata, source_evidence, sort_order)
     VALUES ($1, $2, $3, 'new_directive', '{}'::text[], $4, $5, $6, $7)`,
    [
      'mp_' + randomUUID(),
      dreamRunId,
      siloId,
      fp.suggested_directive,
      JSON.stringify({
        source: 'failure_pattern',
        pattern_name: fp.pattern_name,
        recurrence_count: fp.recurrence_count,
        suggested_scope: fp.suggested_scope,
        suggested_scope_id: fp.suggested_scope_id,
        priority: 60,
      }),
      JSON.stringify({
        sample_turn_ids: fp.evidence_turn_ids,
        phrasing_examples: [],  // populated by reading evidence turn contents
        reasoning: fp.description,
      }),
      // sort_order goes to a dedicated failure-pattern range (between supersede and new_directive)
      850 + failurePatternCounter++,
    ],
  );
  await logIntellectEvent('dream_failure_pattern_detected', 'dream_worker', {
    dreamRunId,
    siloId,
    patternName: fp.pattern_name,
    recurrenceCount: fp.recurrence_count,
    suggestedScope: fp.suggested_scope,
    suggestedScopeId: fp.suggested_scope_id,
  });
}
```

### 4. `/context` project-layering with server-derived project

```typescript
// Source: backend/src/routes/v1/intellect.ts (UPDATED handler shape)
import { detectSilos, detectProject } from '../../services/intellect/silo-detector.js';

fastify.get('/context', async (request, reply) => {
  const { project, cwd, session_id } = request.query as { /* ... */ };

  // Server-side project derivation, explicit query param wins
  const detectedProject = detectProject(cwd ?? null);
  const effectiveProject = project ?? detectedProject ?? null;

  // ... rest of handler uses effectiveProject where it previously used project
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Project-id derivation only at hook layer (client-side) | Both hook AND server-side `detectProject` | Phase 49 | Server can do its own project resolution without depending on every caller passing `?project=` |
| Dream sampler: 2-stratum + imperative force-include (10% budget) | 3-stratum + imperative + frustration force-include (10% + 10% budget) | Phase 49 | Recurring-failure signal force-included even when buried |
| Dream proposals: only `proposal_kind` carries shape | `proposal_kind` + `proposed_metadata.source` discriminator | Phase 49 | `failure_pattern` rows distinguishable in queries + future UI without schema churn |
| Failure patterns hidden in `source_evidence.reasoning` text | Failure patterns first-class via prompt section + Zod-validated array | Phase 49 | Structured extraction; addressable, dedupable, attributable |

**Deprecated / outdated:**
- Nothing deprecated. Phase 49 is purely additive to the 48.x dream pipeline.

---

## Open Questions for Planner

1. **Index addition (optional `idx_directives_scope_scope_id_status`).** Plan 49.03 can include or skip. Recommendation: include as a no-risk forward investment. **Resolution: planner discretion.**

2. **Failure-pattern proposal priority (default 60 vs 50).** Failure-pattern proposals carry inherent evidence weight (recurrence ≥2 by definition). Recommendation: default `priority=60` (higher than generic refinements at 70, lower than seeds at 95). **Resolution: planner can tune in plan 49.02.**

3. **Smoke harness depth — full end-to-end dream run vs mocked.** `smoke-48.3.sh` uses a mocked Bridge response via `_mock_response_path`. Phase 49 should do the same; full dream runs cost real model dispatch and are non-deterministic. **Resolution: mock via fixture, same pattern as 48.3.**

4. **`detectProject` env-var configurability — ship hard-coded or already-configurable?** Phase 50 MSF-01 will introduce admin silo with cwds outside `/home/lobster/projects/`. Recommendation: ship hard-coded in 49, refactor in 50. **Resolution: planner discretion; hard-coded matches existing hook.**

5. **Failure-pattern acceptance UX — should accept handler READ `proposed_metadata.suggested_scope` and insert directive at THAT scope, vs always silo-scope?** Current 48.4 accept handler is silo-only. Phase 49 stamps the metadata; phase 51 (DRX-02) can refine the accept logic. **Resolution: planner notes deferral to phase 51 — accept flow stays silo-scope in phase 49.**

6. **Hook regex sync — should the hook be updated to call `/api/v1/intellect/detect-project` instead of duplicating the regex?** Slight latency cost (one HTTP call per session start) for source-of-truth wins. Recommendation: KEEP duplication for now (simpler, hook independence is a feature). **Resolution: planner notes follow-up for v7.x cleanup.**

---

## Sources

### Primary (HIGH confidence)

- Live DB: `psql -d porter -c "SELECT scope, scope_id, COUNT(*) FROM directives GROUP BY scope, scope_id"` — confirms 83 `scope='project'` rows across 7 projects
- Live DB: turn 1604 in `session_transcript_turns` (2026-05-16 06:17 UTC) — empirical frustration corpus
- Live DB: `\d directives` output — confirms scope is unconstrained TEXT, no CHECK
- `/home/lobster/projects/Porter/backend/src/services/intellect/silo-detector.ts` (133 LOC, verified) — single-silo return signature
- `/home/lobster/projects/Porter/backend/src/services/intellect/dream-sampler.ts` (239 LOC, verified) — Pass A imperative pattern is the template for Pass A0 frustration
- `/home/lobster/projects/Porter/backend/src/services/intellect/dream-prompts/software.md` (82 lines, verified) — full prompt template currently in production
- `/home/lobster/projects/Porter/backend/src/services/intellect/dream-worker.ts` (579 LOC, verified) — confirms `parseDreamResponse` is the Zod gate for any prompt contract change
- `/home/lobster/projects/Porter/backend/src/routes/v1/intellect.ts` lines 68-309 — current `/context` handler with project-directive section already implemented for explicit query param
- `/home/lobster/projects/Porter/backend/src/db/migrate-silos-v1.ts` — confirms trigger reads `OLD.source_type` only (scope-agnostic)
- `/home/lobster/projects/Porter/backend/src/db/schema.ts` lines 762-773 — Drizzle binding for `directives` table
- `/home/lobster/projects/Porter/tests/smoke-48.3.sh` (262 LOC, verified) — smoke pattern template
- `~/.claude/hooks/porter-session-start.js` lines 21-27 — production project-detection regex, matches Phase 49 server-side proposal exactly
- `/home/lobster/projects/Porter/.planning/REQUIREMENTS.md` lines 26-32 — LRN-01..05 locked text
- `/home/lobster/projects/Porter/.planning/ROADMAP.md` lines 27-30 — Phase 49 entry
- `/home/lobster/projects/Porter/CHECKPOINT.md` lines 11-32 — v7.0 scoping summary and YMC trigger context

### Secondary (MEDIUM confidence)

- `/home/lobster/projects/Porter/.planning/phases/48.3-software-dream-worker/48.3-RESEARCH.md` first 400 lines — predecessor research, refinement doctrine inheritance, sort_order assignment logic

### Tertiary (LOW confidence)

- None — every claim in this RESEARCH.md is backed by live code, live DB, or canonical planning documents.

---

## Metadata

**Confidence breakdown:**
- Frustration-marker patterns: HIGH — empirically tested against turn 1604, false-positive risk analyzed per pattern
- Sampling algorithm: HIGH — direct extension of existing `IMPERATIVE_REGEX` lane in `dream-sampler.ts`, identical structural pattern
- Dream-prompt rewrite: HIGH — output contract addition is purely additive, parser/worker hookup mirrors existing flagged_seeds handling
- Project-scope schema confirmation: HIGH — confirmed via live DB query, 83 rows in production
- Project-id derivation: HIGH — verified regex against all 11 observed cwd values in last 7 days
- Silo-detector signature change: HIGH — additive sibling export, zero risk to existing callers
- Smoke harness scope: HIGH — direct clone of `smoke-48.3.sh` shape; LRN-05 deliverable is mechanical
- Migration risk: HIGH — no DB schema change, only optional index
- Plan slicing: MEDIUM — 5-plan recommendation is opinionated; coarse alternative also valid

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days — stable codebase, no major version bumps imminent before phase execution)
