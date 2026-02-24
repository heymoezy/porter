# Claude Code Next Run Instructions (Post UX Remediation Release)

## Context snapshot
Recent release completed major UX remediation items:
- Account UX owner-mode password flow
- Location type picker and Tailscale peer discovery
- Network tab with live Tailscale status
- Access Model rename from Permissions
- Settings transparency with Config tab and export
- Sidebar/hamburger usability fixes
- Agent key copyability and nav cleanup

This means the remediation-first sprint is largely complete.

## Objective for next run
Shift from baseline UX cleanup to orchestration value layers while preserving new UX quality.

---

## Priority order (next)

## Priority 0.5 — Locations model correction (blocker before next UX additions)
Implement from:
- `openclaw/17-locations-model-v2.md`

Required:
- node-first model (machines first, then mounted paths)
- default local node should be the VPS host (for example `srv1379868`), not generic `Documents`
- tailscale auto-discovers peer nodes only
- user manually configures paths per discovered node
- automatic migration from current location entries into node+mount structure

## Priority 1 — Universal Agent Usage Tracker (MVP)
Implement from:
- `openclaw/10-claude-usage-session-tracker-feature.md`
- `openclaw/prompts/agent-usage-tracker-prompt.md`

Required:
- multi-provider adapter model (OpenClaw + Claude Code first)
- usage snapshot APIs
- current status panel in UI
- next-reset countdown and threshold alerts
- parser tests for multiple provider status formats

## Priority 2 — Task Operations Panel (Mission-control Lite)
Add minimal but real controls:
- running tasks list by agent
- status: queued/running/blocked/exhausted/completed
- pause/resume/cancel actions with role checks
- per-agent concurrency limit settings

## Priority 3 — Policy presets
Add strategy presets for routing and execution behavior:
- Cost-sensitive
- Balanced
- Speed-first
- Quality-first
- Local-first

No autonomous optimizer yet. Preset-based control first.

## Priority 4 — Stability, cleanup, and regression hardening
- run full regression over file manager workflows
- verify settings tabs and sidebar behavior on narrow widths
- verify Tailscale fallback states when command unavailable
- perform targeted code cleanup (remove dead/legacy paths, tighten duplicated logic, improve naming)
- avoid broad refactor risk; cleanup must be incremental and test-backed

---

## Non-negotiables
- No breakage to existing file manager behavior.
- No removal/regression of recently shipped UX improvements.
- Keep all new functionality additive and permission-aware.
- Auditability required for privileged task control actions.
- Apply `openclaw/19-security-baseline-every-run.md` on this run.

---

## Deliverables expected
1. commits by priority block
2. screenshots of new Agent Usage + Task Operations UI
3. test output summary (existing + new)
4. short risk notes and what remains for next sprint
5. version bump and changelog updates

Release policy is mandatory:
- `openclaw/18-release-discipline-and-versioning-policy.md`
