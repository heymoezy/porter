## v6.90.0 (2026-07-13)

- **#27 R2 — product-first IA in the admin nav (additive; nothing removed).**
  Council design: "Add new primary nav: Overview, Vault, Services, Files, Open Items,
  Releases … keep legacy links behind a secondary group. Users can enter the new IA
  without losing old surfaces."
  - Nav is now **Product** (Overview · Vault · Services · Files · Open Items · Releases),
    **Porter** (System), and **Legacy** (Brain · Env Tools · MCP · Design System ·
    Architecture) — kept, not killed.
  - Sections map ONLY to routes that exist. `Products` and `Tenants` are in the target IA
    but have no pages yet, so they are deliberately omitted rather than shipped as dead
    links.
  - The destructive folds (R5/R6/R10 DELETE Brain/Recall/Bridge) are NOT in this release
    and require Moe's sign-off, per the design's own instruction.
  - Verified: tsc 0; SPA build clean; **0 dead links** (every nav path exists in routes.ts);
    every previously-reachable legacy route still registered; live askporter.app loads with
    **no JS errors**.

## v6.89.0 (2026-07-13)

- **#27 R1 — global product/tenant context switcher (additive; nothing removed).**
  Porter is multi-app (ymc.capital, themozaic, baanyindee, askporter) but the admin
  always showed one undifferentiated blob. This is the first surface that admits the
  real architecture: you are always looking at *some* product.
  - New `ContextSwitcher` in the admin shell top bar. Lists products from
    `/api/v1/projects`; persists the choice to the **same** pin the CLIs read
    (`POST /api/v1/intellect/active-project`) — so the admin and every claude/codex/grok
    session agree on "what are we working on". One context, not two.
  - Strictly R1 per the council design: adds the selector + context plumbing and
    **removes no existing nav**. The destructive folds (R5/R6/R10 delete Brain/Recall/
    Bridge) are NOT in this release and need Moe's sign-off.
  - Fail-open: an empty product list or an unreachable Porter must never break the shell.
  - Verified: tsc 0, SPA build clean, deployed, and the live chunk on askporter.app
    serves the component.

## v6.88.0 (2026-07-13)

- **#49 — cost per ACCEPTED change (the only loop metric that matters).**
  "Below 50% acceptance a loop costs more than it saves" — and we were flying blind
  on exactly that. I had claimed the token feed did not exist; it did: the CLI
  transcript carries exact per-message usage.
  - `session_usage` (0105) + `services/intellect/cost-metrics.ts`.
  - `POST /api/v1/intellect/session-usage` (idempotent per session — never double-counts)
    and `GET /api/v1/intellect/cost-per-change?project=`.
  - New SessionEnd hook `~/.claude/hooks/porter-session-usage.js`: parses the transcript
    for EXACT tokens and counts releases/reverts **observed from git**.
  - Built so it cannot flatter us: tokens exact; cost clearly an ESTIMATE from a rate
    table (never a bill; unknown models fall back to a mid rate, never free); acceptance
    OBSERVED from git — a session does not get to self-report how good it was. Under 50%
    the verdict says so bluntly.
  - First real reading: 406k output tokens, ~$16.71, 2 releases, 0 reverts →
    **$8.36 per accepted change, 100% acceptance.**

## v6.87.0 (2026-07-13)

- **Porter MCP is actually runnable — and registered in Claude Code (#37).**
  - Root cause found: `porter-mcp.ts` only EXPORTED a factory and never connected a
    transport, so the MCP server existed but **no CLI could run it**. That is why Porter
    was in nobody's `mcpServers`.
  - New `src/mcp/porter-mcp-stdio.ts` — the launchable stdio entrypoint.
  - Added the universal-memory tools to the server: **`porter_bootstrap`** (call first:
    returns the warm packet — where we got to, the handoff left for you, and pointers;
    honest `cold` on a fresh install) and **`porter_write_memory`** (leave a note/handoff
    for the next session).
  - Registered in Claude Code (`claude mcp list` → `porter: ✔ Connected`). The existing
    SessionEnd hook already POSTs `{project, gateway}` to `/intellect/session-end`, which
    now recomputes hot — so **every session end warms the cache for the next session**.
  - Verified over the real MCP protocol: 9 tools listed; `porter_bootstrap` returned a
    234-token warm packet containing a handoff written by a **grok_cli** session.

## v6.86.0 (2026-07-13)

- **Universal memory R2 — write path + vault mirror (#37, collapses #48's hot.md).**
  - `hot_notes` (0104) + `POST /api/v1/intellect/memory` (porter_write_memory):
    kinds `note` | `handoff`. A **handoff** lets a session pass its warm state to the
    NEXT session mid-flight, without ending — what long-running or crashed sessions need.
    Deliberately narrow: durable *meaning* still reaches the vault via the existing
    dream/promote path, so no CLI writes the knowledge graph directly.
  - Handoffs surface at the top of the hot packet (highest-signal lines — someone
    chose to write them).
  - **Vault mirror**: every recompute writes `~/vault/mirrors/hot/<project>.md` with a
    `generated: true / do NOT edit` header. Porter DB stays the source of truth; the
    file is a lag-tolerant human view. This IS the "hot.md" from the self-filing-vault
    research — built ONCE, in Porter, not duplicated as a second truth.
  - Verified cross-CLI: a `grok_cli` handoff was read back in the warm packet by a
    different CLI; mirror written; 234-token packet (cap 900).

## v6.85.1 (2026-07-13) — SECURITY

- **Path traversal in hot-context (introduced in 6.85.0, fixed before any real use).**
  `project` arrives from an HTTP query/body and was interpolated straight into a
  filesystem path (`path.join(PROJECTS_ROOT, project, 'CHECKPOINT.md')`), so
  `project=".."` / `"../../.ssh"` escaped the projects root — an arbitrary-file-read.
  Caught by the automated commit security review.
  - New `safeProjectDir()`: shape check (single dir name, no separators) AND path
    containment (resolve, then prove it is still under the root). A shape check alone
    is insufficient — `".."` matches `[A-Za-z0-9._-]+`.
  - Enforced at BOTH the service entry points (`getHot`, `recomputeHot`) and the route
    boundary (`GET /intellect/hot`, `POST /intellect/hot/recompute`).
  - Verified: 7 traversal vectors (incl. URL-encoded `%2e%2e%2f` and nested
    `ymc.capital/../../.ssh`) all rejected with 400; legitimate projects unaffected.

## v6.85.0 (2026-07-13)

- **Universal memory R1 — hot context (the warm session bootstrap).** Implements the
  council-ratified design in `planning/porter-universal-memory-37.md` (codex + grok).
  Every session (claude, codex, grok, antigravity) currently re-derives the same project
  state from zero, burning tokens to rediscover what the last session already knew.
  - `hot_contexts` table (0103): ONE row per (scope, project) — Porter DB is the source of
    truth; any vault file is a generated mirror.
  - `services/intellect/hot-context.ts`: composes a hard-capped (~900 token) warm packet —
    where we got to (CHECKPOINT.md latest), recent sessions, and POINTERS to drill into.
    Pointers, not payloads.
  - `GET /api/v1/intellect/hot?project=` — warm packet, or an honest COLD response on a
    fresh install (never fabricates history; the CLI still boots fine).
  - `POST /api/v1/intellect/hot/recompute` — force a rebuild.
  - **The de-risking hook:** `POST /session-end` (already gateway-aware) now recomputes hot
    as the ONE default write path — so any CLI ending a session warms the cache for
    whichever CLI opens next, and memory can't be polluted by ad-hoc writes.
  - Verified: cold→warm transition; 192-token packet; a `codex_cli` session-end warmed the
    context that a `claude_cli` session reads. Fail-open throughout.

## v6.70.0 (2026-07-08)

- R6: Files UI — Document Library in Porter admin (deduped graph tree)


## v6.69.0 (2026-07-08)

- v6.68.0: R4 POST /vault/reconcile — Files perfect-sync


## v6.67.0 (2026-07-08)

- v6.66.0: R1 vault_artifact_locations — Porter Files directory foundation


## v6.65.0 (2026-07-08)

- Vault association engine: record-links + edge-expanded focus (v6.64.0)


## v6.63.0 (2026-07-08)

- Canonical tools registry + discoverability (R8 first slice) (v6.62.0)


## v6.61.0 (2026-07-07)

- Scope ladder + product registry — identity spine (v6.60.0)


## v6.59.0 (2026-07-07)

- R6: Porter MCP server alpha (headless knowledge for Claude)


## v6.58.0 (2026-07-07)

- Admin hygiene: typecheck 0, untrack build/, dream-run json fix (v6.57.0)


## v6.56.0 (2026-07-07)

- Porter admin: MCP management page + forge dead-code cleanup (v6.55.0)


## v6.54.0 (2026-07-07)

- Vault v2 R1e: placement accept/refile — review-queue ops (v6.53.0)


## v6.52.0 (2026-07-07)

- Vault v2 R1c: ingest API — type-checked push + proposed placements (v6.51.0)


## v6.50.0 (2026-07-07)

- Vault v2 R1a: generic schema — 6 tables (v6.49.0)


## v6.48.0 (2026-07-06) — admin revamp: remove Forge/Email/skill-feedback

- feat(admin): removed the Forge, Email, and Skill-Feedback screens from the Porter admin (their backends were already deleted — Forge v6.28.0, mail-pillar purge 2026-07-04 — so these were dead frontends). Route files + nav entries + backend/src/routes/admin/email.ts removed; deregistered. tsc 0, react-router build clean (no orphan chunks). Net −2067 lines.
- Design doc for the replacements (vault: porter-admin-revamp.md): MCP management, tools consolidation, and a CLI config view (Porter visualises ~/.claude config). Those land as follow-up releases.

## v6.47.0 (2026-07-06) — Bridge model failover

- feat(bridge): FAILOVER CHAIN (Moe: "bridge should be switching tom into other models... if claude fails or quota is reached. right now he just breaks"). Every /agent-message dispatch now runs through `dispatchWithFailover`: on gateway failure — process error, timeout, or a quota/usage-limit signature — the SAME task retries on the next gateway in the configured chain (claude_cli → codex_cli → antigravity_cli; env PORTER_BRIDGE_FALLBACK_CHAIN or gateways.priority is the config). Shared 300s budget across the chain (raceBudget). `fallback:false` opts a caller out (hard-fail, no model switch). Loopback-only `simulateFailure` proof hook. The failover chain + per-attempt outcome/reason + who answered persist to bridge_dispatch_log.failover and surface in the response envelope (failover.switched/answeredBy). Proven live: simulate claude_cli fail → codex_cli answered; fallback:false → clean hard-fail; log recorded.
- Covers all Bridge consumers (Tom workers, digests, Marshall/Sentinel, ops-chat, vault-chat, evolution loop). Tom's live WhatsApp chat runs in openclaw's own gateway (not Bridge) — its chat-surface failover lands with the openclaw upgrade.
