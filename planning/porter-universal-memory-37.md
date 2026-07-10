# Porter Universal Memory — MCP into every Bridge CLI (#37)

**Status:** council-ratified (codex/GPT-5 + grok/Grok-4.5 via Bridge, 2026-07-10). Design-first;
no code yet. Synthesises the 4 patterns Moe surfaced (hot.md, context-engineering, signal-store,
portable skills) against our ONE-TRUTH architecture.

## Goal
Porter installed INSIDE every Bridge CLI (claude, codex, grok, antigravity) as one MCP server — so every
session opens already knowing the work, drinks from ONE knowledge base, and burns fewer tokens. The app UI
is a visualization/manual-control layer, NOT the product. Engine/MCP first, UI second. [[project_porter_headless_endgame]]

## Invariant (both council members, verbatim agreement)
**Vault owns meaning. Porter owns runtime (hot, episodes, signals, injection). Harness files stay
harness-owned. MCP is the single mouth every CLI drinks from; the app is glass, not plumbing.** No per-CLI
memory files (duplicates vault + Recall). Never rebuild Claude's SessionStart hook inside MCP — keep the
Claude hooks as the *push* path; MCP is the *pull* path for all CLIs + mid-session refresh. One payload
builder, two delivery modes.

## Adopt / reject (council)
| Pattern (Moe's articles) | Verdict |
|---|---|
| hot.md warm-context cache | ADOPT — Porter-owned cache, not a second truth |
| Context-engineering (compaction/masking/KV/partition) | ADOPT — token caps + drill-on-demand, not a new store |
| Shared signal-store (compounding loops) | ADOPT — scoped signals/episodes in Porter DB |
| Portable skills (SKILL.md every run) | ADOPT — `get_skill` over disk/Forge |
| Per-CLI memory files | REJECT — duplicates vault + Recall |
| Rebuild SessionStart injection inside MCP for Claude | REJECT — keep Claude hooks; MCP is the *universal* path |

## A. Minimum MCP surface (thin contracts; several already exist)
- `porter_bootstrap` — session-start ONE-SHOT: hot + active project/checkpoint + top directives for cwd/scope. Fail-open empty. Cap ~800–1200 tok.
- `porter_get_hot` — warm cache for scope (hot body + metadata: written_at, session_id, approx_tokens).
- `porter_recall` — ranked recall over directives + vault concepts + episodes (query, scope, limit, kinds). Titles first, capped.
- `porter_context_pack` — **EXISTS** — topic → ≤~2k-tok markdown from vault nodes. Prefer before repo grep.
- `porter_search_vault` — **EXISTS** — find nodes (id/title/type/endpoint) before packing.
- `porter_write_memory` — append `{kind: episode|signal|note|handoff, scope, project, body, tags}`. Never invents vault concepts (durable meaning stays vault-promoted via dream).
- `porter_register_signal` — typed signal (`blocked|decision|ship|finding|handoff`) + schema + TTL. Other loops read these.
- `porter_read_signals` — recent signals by scope/project/type since ts. Default 24–72h, hard cap N.
- `porter_get_skill` — load one SKILL.md/persona by name; body + version hash. Intent compounds per run.
- `porter_select_scope` — **EXISTS** (`porter_select_product`) — pin app_scope for subsequent calls.
- `porter_resolve_endpoint` (codex) — resolve a node's canonical ENDPOINT before writing/expanding.
- `porter_close_session` — submit final state/decisions/changed-files/risks/next-actions (the write path, see D).

Defer (NOT MVP): write vault nodes, edit directives, agent dispatch, admin.

## B. hot.md
- **Contents (strict, ordered, hard-capped ~600–900 tok):** (1) active project + path + one-line goal; (2) checkpoint last-done/next/blockers; (3) open signals ≤5 (type + one line); (4) POINTERS only — CHECKPOINT.md, vault INDEX hits, skill NAMES (not bodies); (5) last-session handoff line (who/when/CLI).
- **Excludes:** transcripts, vault concept bodies, business DB rows, directive dumps (those stay on recall/inject).
- **Writer:** primary = Porter SessionEnd / session-analyzer (already fires for Claude) generalised to ALL gateways: `{sessionId, project, gateway}` → recompute hot. Secondary = explicit `porter_write_memory(kind=handoff)` mid-session. NOT ad-hoc file edits per CLI.
- **Storage:** source of truth = Porter Postgres (`hot_contexts`: scope, project_key, body, hash, updated_at, source_session). Optional read-only mirror `~/vault/mirrors/hot/<project>.md` or `.porter/hot.md` (generated, lag-tolerant, DB wins).
- **Fresh-install rule:** no Postgres / empty hot / unknown cwd → `{status:"cold", hot:null, hints:[...]}`. Never fabricate history. Bootstrap still succeeds on local CLAUDE.md/CHECKPOINT.md if present, else pure model+tools. First SessionEnd creates the first hot row; cold→warm automatic after one real session.

## C. Universal read path (session start) — one `porter_bootstrap` call, internally:
1. **hot** — if fresh (<24–48h) + same project: inject as-is (≤~900 tok); stale/missing → skip.
2. **index** — active-project pin + checkpoint summary + INDEX front-door TITLES only for scope.
3. **domain** — top-N scoped directives (priority-ranked) + vault concepts ranked for this silo; titles + 1-line; cite endpoint.
4. **drill** — ON DEMAND only via `porter_context_pack` / `porter_recall` / `porter_get_skill`.
- **Cheap:** hard token budgets per tier; never auto-dump skills/full nodes; progressive disclosure (titles→pack→node); mask/cap tool outputs; stable prefix order (scope→hot→directives) for KV-cache reuse; partition by scope+project_key; signals are the cross-loop bus, not shared full context.

## D. Biggest risk + the ONE de-risking hook
- **Risk:** divergent memory across CLIs / memory pollution — Claude gets hooks+episodes, others stay cold or write conflicting local state → token burn + one-truth break.
- **Hook:** **universal SessionEnd → Porter hot-recompute** is the ONLY default write path. Every gateway (claude/codex/grok/antigravity) fires the same session-end contract (`POST /api/v1/intellect/session-end` + hot recompute), enforcing compaction + dedupe-by-ENDPOINT + confidence/source metadata + diffable output. No end → no hot → next session cold (and you MEASURE it). Ship this before fancy signal schemas. Secondary: fail-open/empty-honest so offline Porter never blocks a CLI.

## E. First 3 releases (smallest-first)
- **R1 — Wire + bootstrap (cold-safe).** Register Porter MCP on all Bridge CLIs (same stdio server). Add `porter_bootstrap` + `porter_get_hot` over existing intellect/context + checkpoint. Universal SessionEnd for non-Claude gateways (or a Bridge wrapper that always POSTs session-end). Fresh-install empty responses. No new UI.
- **R2 — hot + write path.** DB-backed hot recompute on session-end; optional vault mirror under `mirrors/`. `porter_write_memory` + handoff kind. Token budgets + bootstrap metrics (cold-vs-warm, tokens injected).
- **R3 — signals + skills (compounding).** `porter_register_signal`/`porter_read_signals` (TTL + types). `porter_get_skill` over skill packs / SKILL.md. Cross-CLI signal read in bootstrap (≤5 lines). UI later: visualize hot/signals only.

## Ties to sibling tasks
- Feeds #26 (Porter product program) and #27 (per-product/tenant UI — see planning/porter-admin-reframe-27.md).
- `porter_write_memory(kind=signal)` is the substrate for #49 cost-per-change (loops emit `ship`/`finding` signals; a reconciler scores acceptance).
- hot.md here is the same mechanism as #48 item-1 (vault self-brain) — build ONCE in Porter, mirror to vault.
- `porter_get_skill` is where #47's residual (portable skills for non-Claude CLIs) lands.

## Council provenance
codex dispatchLog 5a3c0171 · grok dispatchLog ffda9d34 (Bridge, 2026-07-10). Raw responses converged on
every point above; grok added the "several tools already exist" correction (context_pack/search_vault/
select_product) that shrinks R1.
