# Porter task — Recall as the single memory writer (kill the parallel stores)

> Scoped 2026-06-25 (from a ymc.capital session). Owner: external tool develops Porter
> (Claude Code / Codex), per "no developing Porter from within Porter." Porter hooks live
> in `~/.claude/hooks/`.

## Problem
Three parallel memory stores exist today — a direct ONE-TRUTH violation:
1. **Porter Recall** (intended backbone) — feeds the SessionStart hook (Recent Sessions, Relevant Concepts).
2. **Claude Code file-memory** — `~/.claude/projects/-home-lobster/memory/MEMORY.md` (index) + **268 topic files**. Auto-loaded into the model's context each session. Grew to **402 lines**; the loader caps at ~200 → **~half was silently dropped every session** (the "everything is dumber today" symptom). Just compacted to 153 lines as a stopgap.
3. **Per-project `CHECKPOINT.md`** (~30 files).

These don't sync. Durable facts get written to local files (the harness instructs the model to), not to Recall, so Recall and the files drift.

## Goal
**Porter Recall is the single source + single writer.** The Claude Code file-memory becomes a *rendered, read-only cache* of Recall, and per-project CHECKPOINTs become Recall projections. One writer, many windows.

## Design
**Write path** — `porter-session-end.js` / `porter-stop.js` hooks extract durable facts at turn/session end and POST them to Recall (`/api/v1/intellect/*`, Concepts layer), with project scope. Stop writing independent local topic files (or write them only as a cache, never as the source).

**Read path** — `porter-user-prompt.js` (SessionStart) *renders* `MEMORY.md` (and the active project's checkpoint context) **from Recall** at session start:
- ranked by relevance to cwd / active-project pin,
- enforced to a hard line/token budget so it **never silently truncates** (the budget that bit us),
- written to the local file purely as a cache the harness then loads.

**Dedup / merge** — map each existing topic file → a Recall Concept; reconcile duplicates (Recall's Concepts layer already exists). Tier by trust (Directives > Concepts > Episodes), as Memory V2 already defines.

**Migration (one-time)** — back up the 268 topic files + 30 CHECKPOINTs first, then import into Recall Concepts scoped by project. Verify counts before deleting any local source.

## Acceptance
- `MEMORY.md` is *generated* from Recall, ≤ budget, relevance-ranked, never truncated on load.
- New facts a session learns land in **Recall**, retrievable by every model/CLI via Bridge.
- No independent local write path; CHECKPOINTs are projections.
- ONE TRUTH satisfied: one store, many windows.

## Risks / guardrails
- **Don't lose curated facts** — back up before migrating; diff Recall import vs the 268 files.
- Keep the local cache so offline/headless sessions still have context if Recall is briefly unreachable.
- Roll out read-path (render-from-Recall) before cutting the write-path, so there's always a working memory during migration.

## Immediate stopgap already done
- `MEMORY.md` compacted 402 → 153 lines (loads in full again); stale Porter v0.31–v4.5 inline dev-notes collapsed to pointers; all live topic-file links preserved.
