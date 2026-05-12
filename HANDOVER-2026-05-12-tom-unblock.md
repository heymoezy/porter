# Porter Handover — Trim Porter to background services, unblock Tom

**Date:** 2026-05-12
**Goal:** Trim Porter to a focused background system (Bridge / Intelligence / Memory) so other apps can consume it without dragging Porter's full operating context into every claude invocation. Concrete unblock: YMC Capital's WhatsApp assistant "Tom" routes inference through Porter Bridge → `claude_cli` backend, but Porter's CLAUDE.md gets auto-loaded by the claude CLI on every call. Tom's per-turn latency is 60–160s as a result; openclaw times out at 120s.

Two-stage fix below. After this handover, Tom should run at ~2–3s per turn via Porter Bridge + Moe's Claude Max OAuth.

---

## 1. What's breaking Tom (read first)

### The chain

YMC Tom (openclaw agent on WhatsApp)
  → openclaw provider `porter` (api=anthropic-messages)
  → YMC backend shim `/api/admin/whatsapp/tom/llm/v1/messages` (`backend/src/routes/tom-llm.ts`)
  → Porter Bridge `POST /api/v1/chat/stream` with `backend: 'claude_cli'`
  → Porter spawns `claude` CLI subprocess
  → **claude CLI auto-discovers `/home/lobster/CLAUDE.md` and `~/projects/Porter/CLAUDE.md`** based on cwd
  → loads ~10–30KB of Porter operating context as system prompt
  → Tom's actual prompt (Tom IDENTITY.md + SOUL.md + user message ≈ 1.6KB) gets sandwiched under that
  → claude responds in Porter's voice, not Tom's, AND takes 60–160s on the inflated context

### Evidence

Smoke test, 2026-05-11 PM:
- Direct shim call with minimal prompt → 12s, response: *"Hey Moe. Loaded Porter. Last work: 48.2-02 transcript capture endpoint shipped. What are we doing?"* — Porter's voice, not Tom's.
- openclaw → shim → Porter Bridge with Tom's full ~1.6KB workspace → 138s, then 120s timeout.
- Same workspace, codex backend (no CLAUDE.md auto-load) → 12s cold, 10–13s warm. Voice intact.

The latency and the persona drift are both symptoms of CLAUDE.md being injected. Trim Porter's CLAUDE.md and prevent claude_cli from auto-loading it for non-Porter consumers.

---

## 2. Tasks

### Task A — Trim `/home/lobster/CLAUDE.md` (global)

This file is loaded by `claude` for every invocation under `/home/lobster/`. It's the dominant source of context pollution for any consumer of Porter Bridge's claude_cli backend.

**Keep (essential for cross-project Claude Code use):**
- The project-aware session-start rule (read project's CHECKPOINT, etc.)
- Project layout convention
- `Porter Bridge API` line (`POST http://127.0.0.1:3001/api/v1/chat/stream`) — one line, just the URL
- OS/shell/python/node basics (4 lines)
- Multi-session coordination rules (`.coordination/SESSIONS.md`)
- Known constraints (no sudo, no package installs without approval)
- Hard rules section but trimmed to the genuinely cross-cutting ones

**Delete:**
- Detailed Porter project context (any line that's only relevant when working on Porter — those belong in Porter's own CLAUDE.md, not the global)
- Tone/voice rules specific to Porter Brain UI
- Anything that names internal Porter modules, schemas, ports

**Target:** ≤ 80 lines, < 4KB. Currently 196 lines.

### Task B — Trim `/home/lobster/projects/Porter/CLAUDE.md` (project)

Porter's own project file. Loaded when claude runs in the Porter cwd.

**Reposition Porter as a background services platform.** The three pillars stay: Bridge, Intelligence, Memory. Everything else gets cut.

**Keep:**
- Bridge layer (request routing, backends, claude_cli specifics)
- Intelligence Feed (extraction, signal classification, surfacing)
- Memory V2 (directives, concepts, episodes, signals — the 4-layer model)
- Database conventions (postgres, drizzle, migrations)
- API metering model (one line)
- Service ports (Brain :3001, Admin :5175)

**Delete:**
- People section (CRM-style user management — this concept moves to consuming apps like YMC, not Porter itself)
- Costs section (cost tracking — also moves to consumers)
- Project/task management surfaces (Now / Plan / Timeline / Records tabs, milestones, task decomposition trees, deliverables) — these were product-direction experiments. Porter going forward is "background system for other apps", not a product UI.
- Agents-as-product vision (agents are now an internal implementation detail of Bridge routing, not a user-facing concept in Porter)
- Workspace identity / branding stuff
- Any Polsia / design-reference / Mistral / "Porter must feel ALIVE" lines — premature polish for a background service

**Target:** ≤ 60 lines, < 3KB. Currently 110 lines.

### Task C — Delete the People + Costs surfaces from the codebase

The CLAUDE.md trim only documents the new reality. The code has to follow.

**People (whole CRM):**
- `backend/src/routes/people.ts` (or equivalent — grep `people`/`crm`)
- `backend/src/db/schema.ts` — drop `people`, `contacts`, `relationships`, any CRM-only tables
- `backend/drizzle/` — write a migration to drop those tables
- `admin/src/pages/People*` (and matching route registrations)
- Any frontend nav entries
- Any tests pointing at these surfaces

**Costs:**
- `backend/src/routes/costs.ts` (or wherever cost tracking lives — grep `cost`, `usage`, `billing` in routes/)
- DB tables tracking cost
- Admin pages
- Cost rollups in /api/admin/health or stats

**Workflow:**
1. Grep first to enumerate the surface area. Don't assume.
2. Write a "what I'm about to delete" list. Confirm none of it is consumed by Tom's path (`/api/v1/chat/stream`, directives, concepts) or by other YMC integrations (search `ymc.capital` codebase for `127.0.0.1:3001` to find all consumers).
3. Migration to drop tables. **Do not silently destructively-migrate** — write down what data is lost and confirm with Moe before applying.
4. Delete routes, pages, tests in one commit per surface.

### Task D — Make `claude_cli` backend invoke claude WITHOUT CLAUDE.md auto-load

Even with trimmed CLAUDE.mds, the right architecture is: when Porter Bridge calls claude on behalf of OTHER consumers (Tom, future apps), claude should NOT auto-discover Porter's operating context. Two options:

**Option 1: clean cwd.** Invoke claude from a directory that has no CLAUDE.md ancestry, e.g. `/tmp/porter-bridge-sandbox/` (created at startup, empty). claude searches up from cwd; a sandbox dir under `/tmp/` won't hit `/home/lobster/CLAUDE.md` if you `cd` there first.

**Option 2: explicit flag.** Check if claude CLI supports `--no-system-prompt` / `--system-prompt-override` / `--no-project-context`. If yes, pass it from Porter Bridge.

**Option 3: pass an empty CLAUDE.md.** Set `CLAUDE_PROJECT_DIR=/tmp/empty` (or whatever env var claude honors) and put an empty CLAUDE.md there.

**Find the spawn site in Porter:** grep `backend/` for the place that constructs the claude CLI command — that's where to add the cwd / flag fix. The right place is likely `backend/src/services/bridge/claude-cli.ts` or similar.

**Verification:**
```bash
# From the Porter repo:
curl -sS -X POST http://127.0.0.1:3001/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "X-Porter-Service-Token: porter-local-service-2026" \
  -d '{"message":"who are you, in one sentence","backend":"claude_cli"}'
```
**Before fix:** reply mentions "Porter", "Loaded checkpoint", "Phase 48.x".
**After fix:** reply is something like "I'm Claude, made by Anthropic." — generic Claude, no Porter context bleeding in.

### Task E — YMC-side verification (after A, B, D land)

On the YMC side, the entire Tom → Porter Bridge integration is committed and ready. To flip Tom back from codex to claude-via-Porter:

```bash
# Edit ~/.openclaw/openclaw.json — change Tom's model line:
#   "model": { "primary": "openai-codex/gpt-5.4" }
# to:
#   "model": { "primary": "porter/claude-via-porter" }

systemctl --user restart openclaw-gateway
sleep 3
time openclaw agent --agent tom --message "who are you" --json | jq '.result.payloads[0].text, .result.meta.durationMs'
```

**Pass criteria:** Reply is in Tom's voice ("I'm Tom — your YMC CRM on WhatsApp" or similar warm + brief), duration < 5000ms. If it's >30s or returns Porter voice, the claude_cli backend hasn't been properly isolated — go back to Task D.

After verification, tell Moe Tom is fast. He can then lift the Clement/Yai allowlist freeze on the YMC side (currently locked to Moe-only in `backend/.env`).

---

## 3. Files to read for context

- `/home/lobster/projects/ymc.capital/backend/src/routes/tom-llm.ts` — the Anthropic-Messages → Porter Bridge shim. Stable; no changes needed here.
- `/home/lobster/projects/ymc.capital/CHECKPOINT.md` (top) — what Tom is, what was shipped, where the blocker is.
- `/home/lobster/.openclaw/openclaw.json` — `agents.list` has Tom; `models.providers.porter` is registered with `api: "anthropic-messages"`.
- `/home/lobster/.openclaw/workspace-tom/{IDENTITY,SOUL}.md` — Tom's persona files (~1.6KB combined). NOT the bloat source — Porter's CLAUDE.md is.

---

## 4. What NOT to break

These YMC integrations consume Porter today; don't regress them while trimming:

- **Porter Bridge `/api/v1/chat/stream`** — Tom's LLM path goes here.
- **Porter Bridge `/api/v1/chat/completions`** (if exists) — not currently used but reserved.
- The `claude_cli` backend specifically — Tom is wired to use this backend. If you remove / rename it, update the Tom shim's hardcoded `PORTER_TARGET_GATEWAY=claude_cli` env var.
- Directives/Concepts read endpoints if YMC consumes them (grep `ymc.capital/backend` for `3001` to confirm).

`POST /api/admin/whatsapp/tom/llm/v1/messages` is the YMC-side mount, NOT a Porter route — that's the YMC backend's shim. Don't worry about it from the Porter side.

---

## 5. Suggested execution order

1. Task A (global CLAUDE.md trim) — 15 min, low-risk.
2. Task B (Porter CLAUDE.md trim + reposition) — 30 min.
3. Task D (claude_cli isolation) — 30-60 min. **This is the actual latency unblock for Tom.** Smoke-test via the curl command above.
4. Task E (YMC switch + verify) — 10 min, mostly confirmation.
5. Task C (delete People + Costs from code) — 1-2 hr, larger surgery. Can be a separate ship; doesn't block Tom.

Commit each task separately. Ship process: version bump → git add → commit → push → restart → health check.

---

## 6. After all of this lands

Update Porter's CHECKPOINT.md. Mention specifically: claude_cli backend now isolated from Porter's operating context — safe for cross-app consumers. Tom's per-turn latency dropped from X to Y seconds. People + Costs surfaces removed (link to deletion commits).

When Moe gives the green light on Tom stability, the YMC side will re-add Clement/Yai/group JID to `OPENCLAW_TOM_ALLOWLIST` and re-enable the `admin_*` templates that are currently disabled (slug LIKE 'admin_%' have `enabled = FALSE` in YMC's `templates` table during the freeze).
