# Porter Dreams — Silo-Scoped Memory Loops

**Status:** Draft spec v2 (2026-05-11) — silo-scoped rewrite
**Owner:** Claude Code (Opus 4.7) — input for `/gsd:plan-phase`
**Inspired by:** Anthropic Managed Agents — Dreams (released 2026-04-21). Porter steals the *pattern* (periodic memory consolidation via a model dispatch), never the product. Stays Bridge-routed, model-agnostic, on-prem.

---

## Reframe (vs v1)

v1 of this spec treated Dreams as one global memory-consolidation loop. **Wrong.** Moe's framing:

> "Dream silos. First we focus on software. Always create a design system. Never freehand. Always use components. 'Compact' = vertical padding, not font size. Always use Porter as backbone. Admin / data-room dreams come later, different mechanism."

So:

- **Dreams are silo-scoped**, not global.
- **Silo = a coherent domain of work with its own rules, cadence, and review surface.**
- **Software silo ships first.** Admin / data-room silo is a separate phase with a different shape (operates at data-room level, not transcript level) — out of scope here.
- Cross-silo bleed is forbidden by design. Software rules never inject into a legal-review session and vice versa.

---

## Refinement Doctrine (locked 2026-05-11)

Three principles every Dream Worker obeys, no exceptions:

### 1. Refine, don't append.

The Worker's win condition is a **smaller, sharper rule set** — not a bigger one. Output kinds are weighted explicitly:

| Output kind | Worker bias |
|---|---|
| `merge` (two directives → one) | encouraged |
| `supersede` (rewrite existing) | encouraged |
| `delete` (archive stale/contradicted) | encouraged |
| `new_directive` | last resort — only when no existing rule covers it |

The prompt template *demands* dedup/delete output before allowing additions. Active-directive count per silo is a tracked health metric. Monotonic growth triggers an alert (silo getting noisier, not smarter).

### 2. Authority to delete with judgment.

The Worker proposes deletions when it finds:
- **Contradictions** — two directives that disagree. Picks the newer or higher-priority; archives the loser.
- **Staleness** — no reinforcement signal in ≥6 weeks AND no recent evidence in transcripts.
- **Supersession** — a newer directive fully subsumes an older one.
- **Redundancy** — same rule, different phrasing, ≥3 active rows. Collapses to one.

Deletions still flow through the human-review queue in v1 (no auto-delete). But the Worker is *expected* to propose them — silence on stale data is a failure mode, not a safety feature.

**Exception: hand-curated seed directives** (e.g., the 4 software-silo seeds) are immutable to the Worker. It can flag them for Moe's review but cannot propose deletion. Marked via `source_type='moe-direct'`.

### 3. Reinforcement learning from every CLI prompt.

Every prompt Moe types is a signal. The Worker reads accumulated transcripts and treats:
- **Repetition** (rule restated 3+ times across sessions, different phrasing, same intent) → strong reinforcement. Raise priority or formalize as directive.
- **Contradiction** (recent prompts disagree with an active rule) → propose supersession with evidence turn IDs.
- **Imperative phrasing patterns** (`always X`, `never Y`, `stop doing Z`, `it should be W`) → directive candidates. The existing correction-detector handles single messages; the Worker extends this across the corpus, weighted by recency.

Reinforcement is asymmetric: **a single fresh contradiction outranks five older confirmations**. Moe's most recent stated preference wins.

### 4. Per-prompt silo classification (capture-time + synthesis-time).

Each captured user prompt gets a silo tag in two passes:

- **Capture-time (cheap, deterministic):** the `Stop` / `UserPromptSubmit` hook tags `silo` via heuristics on cwd + prompt content keywords (file paths, code verbs `refactor`/`ship`/`tsc`/`npm`/`deploy`/`commit`, type names). Default null if ambiguous. Stored on `session_transcript_turns.silo`.
- **Synthesis-time (precise, model-driven):** the Dream Worker for silo S re-filters the transcript window — discards turns whose model-judged silo ≠ S. Wrong tags at capture get corrected; mixed-silo sessions get split per turn.

Only silo-relevant turns feed a given silo's Dream Worker. This is what stops cross-silo bleed and what makes the software Worker actually *focused* instead of mining noise.

---

## The Software Silo

### Seed directives (already inserted in `directives` table, scope=`silo`, scope_id=`software`, priority 95)

| id | Rule |
|---|---|
| `silo-sw-design-system` | Always create a design system for every new project. Tokens (color/spacing/typography/radius/shadow) + component library before any screen is built. Never freehand. Never one-off markup. |
| `silo-sw-components-only` | Always use components. Every UI element is a reusable component instance. If a needed component does not exist, create it in the library first, then consume it. |
| `silo-sw-compact-means-padding` | "Compact" / "denser" / "tighter" = reduce vertical padding and gap spacing. Never shrink font size. Same rule inverse for "looser" / "breathe". |
| `silo-sw-porter-backbone` | Porter is the backbone for every software project. Model calls → Bridge. Memory → Intellect. Agents → Forge. No direct provider SDKs, no flat-file mailboxes, no side channels. |

These are **non-negotiable, hand-curated, priority 95**. The Dream Worker proposes *additions* to this set — never modifications. Hand-curated seed rules are immutable except by Moe directly.

### Silo detection (at session start)

A CLI session belongs to the software silo when **any** of:

1. `cwd` is inside a known code project root (has `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `.git` and `_project_type ∈ {website, app, api, library}`).
2. The session's first 3 prompts contain code-domain markers (function names, file paths matching `*.{ts,tsx,py,go,rs,sql,sh}`, terms like "refactor", "ship", "deploy", "type error").
3. Moe explicitly tags it via `/silo software` (new CLI command — Phase 48.3).

Detection is per-session and **stable**: once a session is tagged, it doesn't flip. Default if ambiguous: **none** (no silo directives injected — better miss than mix).

Multi-silo sessions (rare but possible — e.g., legal review *of code*) get **both** sets of directives unioned, never blended.

### Injection (session start)

The existing `/api/v1/intellect/context` endpoint already feeds the session-start hook. Add one query:

```sql
SELECT id, content, priority FROM directives
WHERE status='active'
  AND scope='silo'
  AND scope_id = ANY($1)        -- detected silos
ORDER BY priority DESC
LIMIT 20;
```

Silo directives sit in a dedicated section of the injected prompt — labeled `## Silo: Software — Operating Rules` — so they're never confused with project-scope or global directives.

### Dream Worker — Software

Runs **per-silo**. The Software Dream Worker:

1. Reads `session_transcript_turns` from sessions tagged `silo=software` since last run (cap 100 sessions).
2. Reads current software-silo directives + concepts.
3. Dispatches via Bridge with a software-specific prompt template (`backend/src/services/intellect/dream-prompts/software.md`). The template anchors the model to *software development judgment* — pattern recognition for design/architecture/style preferences, not general advice.
4. Returns structured proposals tagged `silo=software`. Goes to the same `memory_proposals` queue as global Intellect proposals, but **review UI filters by silo**.

**Cadence:** weekly for the software silo (not 24h). Software preferences change slowly. Manual trigger always available.

**Model:** Sonnet 4.6 default for nightly, Opus 4.7 for manual deep runs. Configurable per-silo, not global.

Each future silo gets its own:
- prompt template
- worker schedule
- review filter
- accept-handler policy

This is what makes silos *silos* and not just tags.

---

## Architecture (silo-aware)

```
                                ┌────────────────────────┐
   CLI session ──── turns ───▶  │ session_transcript_    │
   (Stop hook)                  │ turns (silo-tagged)    │
                                └─────────┬──────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
        ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
        │ Software Dream   │   │ (future) Admin   │   │ (future) Legal   │
        │ Worker — weekly  │   │ Dream — different│   │ Dream Worker     │
        └────────┬─────────┘   │ mechanism, TBD   │   └──────────────────┘
                 │             └──────────────────┘
                 ▼
        ┌──────────────────┐
        │ memory_proposals │     filtered by silo in Admin UI
        │ (silo-tagged)    │
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ accept ⇒ insert  │
        │ into directives  │
        │ scope='silo'     │
        │ scope_id='software'
        └──────────────────┘
                 │
                 ▼
        next CLI session ── injected on SessionStart, software-silo section
```

### Schema changes (minimal)

- `directives`: **already supports it** via `scope='silo'` + `scope_id='<silo-name>'`. No migration. ✅ Verified.
- `concepts`: same scope/scope_id pattern — verify columns exist (likely yes — same Memory V3 schema family).
- New: `session_transcript_turns` (as v1 spec) + `silo TEXT` column.
- New: `memory_proposals` (as v1 spec) + `silo TEXT` column.
- New: `silo_registry` — small table for silo metadata (name, prompt template path, cadence, review filter). Lets you add silos via config, not code.

```sql
CREATE TABLE silos (
  id              TEXT PRIMARY KEY,             -- 'software', 'admin', 'legal', …
  display_name    TEXT NOT NULL,
  description     TEXT,
  prompt_path     TEXT NOT NULL,                -- relative path to template .md
  cadence_seconds INT NOT NULL DEFAULT 604800,  -- weekly default
  default_model   TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  detect_rules    JSONB NOT NULL DEFAULT '{}',  -- silo-detection config
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO silos (id, display_name, prompt_path, cadence_seconds, default_model, detect_rules)
VALUES ('software', 'Software Development',
        'backend/src/services/intellect/dream-prompts/software.md',
        604800, 'claude-sonnet-4-6',
        '{"project_types":["website","app","api","library"],"file_globs":["*.ts","*.tsx","*.py","*.go","*.rs","*.sql","*.sh"]}'::jsonb);
```

---

## Phase 48 decomposition (silo-aware)

| Sub-phase | Scope | Demo |
|---|---|---|
| **48.1 Silo Foundation** | `silos` table, silo-aware injection in `/intellect/context`, silo detection in session-start hook, `/silo` CLI command. Software silo seeded with 4 directives (✅ done). | A CLI session in `/projects/Porter` shows "Silo: software" injected. Same hook in `/projects/Funds` shows none. |
| **48.2 Transcript Capture** | `session_transcript_turns` table with `silo` column, `Stop` hook, `UserPromptSubmit` extension, `/transcript/turn` endpoint, PII filter, 30-day retention | One session produces N×2 silo-tagged turn rows. |
| **48.3 Software Dream Worker** | `dream-worker.ts` with silo dispatch, software prompt template, workflow registration (`software_dream` weekly), `memory_proposals` writes | Manual run against backlog yields ≥1 silo-tagged proposal. |
| **48.4 Review Surface** | Admin UI: Dreams tab with **silo filter**. Accept/reject handlers (transactional). Auto-expiry. | Accept a software-silo proposal → directive appears with `scope='silo' scope_id='software'`. Next session injects it. |

**Admin / data-room silo = NOT in this phase.** Per Moe, it's a different mechanism at data-room level. Spec for it lands when we get there.

---

## What changes vs v1

| v1 spec | v2 spec (silo) |
|---|---|
| One global Dream Worker, 24h cadence | Per-silo workers, per-silo cadence (software=weekly) |
| Single review queue | Same queue, filtered by silo in UI |
| Transcripts captured globally | Transcripts silo-tagged at capture |
| Model and prompt: same for everything | Per-silo prompt template + default model |
| No seed content | Software silo pre-seeded with 4 standing rules (✅ done) |
| Cross-silo bleed possible (just tags) | Cross-silo bleed forbidden — separate workers, separate prompts |
| Admin silo handwaved | Admin/data-room silo deferred to a separate phase with different mechanism |

---

## Open decisions

All locked as of 2026-05-11. Going in with:

- **Silo detection:** cwd + cheap content heuristics at capture, model-precise re-filter at synthesis (per Refinement Doctrine #4).
- **Review mode:** human-only for v1, no auto-accept (per Refinement Doctrine #2; seeds are short, stakes are high).
- **Cadence:** software silo weekly + manual trigger always available.
- **Model:** Sonnet 4.6 nightly, Opus 4.7 on manual deep runs.
- **Deletes:** worker is expected to propose them; queue handles approval.
- **Seed immutability:** `source_type='moe-direct'` directives cannot be deleted/superseded by the Worker.

---

## What's already done (no further action)

- ✅ Two auto-memory files written: `feedback_dream_silos.md`, `feedback_compact_means_padding.md`
- ✅ Indexed in `MEMORY.md` under Build Discipline
- ✅ 4 software-silo directives seeded in `directives` table, priority 95, scope=`silo`/scope_id=`software`
- ✅ Phase 48 registered on `.planning/ROADMAP.md`
- ✅ This spec rewritten silo-first

The directives are **already injectable** today — anything reading the `directives` table with `scope='silo'` queries will get them. The remaining work is the capture-and-propose loop.

---

## Non-goals (unchanged)

- Not migrating to Anthropic's Managed Agents stack.
- Not auto-modifying live memory.
- Not retroactive (existing 971 episodes not re-mined on first run).
- Not building the admin / data-room silo in this phase.
