# Porter MASTER_EXECUTION_PLAN

Date: 2026-02-26
Status: Active implementation plan (single source of truth)

## Mission
Ship Porter as a reliable control plane (not a UI demo): trustworthy UX, real execution, scoped memory, and observable automation.

---

## Phase A — Product Truth & Trust Reset (Immediate)

### Objectives
- Eliminate fake/no-op controls.
- Make UI behavior honest and explicit.

### Work
1. Build and fill `FEATURE_TRUTH_MATRIX.md`.
2. Classify each user-facing feature as:
   - Working
   - Partial
   - Broken
3. For Broken features:
   - hide or mark preview/incomplete.
4. Add “active now” indicators for settings that currently affect runtime.

### Exit criteria
- No user-facing control appears functional unless it executes correctly.

---

## Phase B — R1 Refactor (Monolith split, parity only)

### Objectives
- Reduce risk from single-file architecture.
- Establish maintainable module boundaries.

### Target structure
- `app/server.py`
- `app/api/{agents,workspace,pep,memory,locations,files,tasks,schedules}.py`
- `app/services/{policy,resolver,usage,guards,onboarding}.py`
- `app/store/{config,runtime,db}.py`
- `app/web/{templates,assets}`
- Keep `porter.py` as thin bootstrap compatibility entry.

### Rules
- No feature expansion.
- Preserve endpoint behavior.

### Exit criteria
- Behavior parity verified against Phase A truth matrix.

---

## Phase C — PEP/1 Phase 1 (Contract-driven)

### Must ship
- Agent register + heartbeat
- Core FS ops via PEP/1
- Token onboarding flow
- Loop safeguards:
  - correlation IDs
  - idempotency keys
  - max hops
  - circuit breaker
- Provenance-aware audits:
  - project_id, session_id, scope_source, correlation_id, chain_ref
- Baseline metrics + tracing

### Split trigger thresholds
- p95 transfer > 200ms (5m)
- queue depth > 50 (1m avg)
- loop lag > 500ms (5m)
- error rate > 5% (10m)
- CPU > 70% (5m)
- memory > 80% (5m)

---

## Phase D — Project Scoping (v0.13.0 path)

### Must ship
- Project switcher
- Layered resolver:
  - Global → Project → Session/User → Agent
- Configure navigator grouped by scope:
  - Global Shared
  - Project
  - Agent-Specific
- Save confirmations show exact target scope
- Scope operations:
  - Promote to global
  - Reset to inherited
  - Copy to agent override

### Exit criteria
- No cross-project memory/settings bleed.

---

## Phase E — Agent UX Completion

### Must ship
- Clean card actions + stable two-column layout
- Real test roundtrip (hello→ack), not heartbeat inference
- Configure workspace polish:
  - active file highlight
  - save/discard prompts
  - find in file
  - dynamic file guide + md quality score
  - scope badges

---

## Phase F — Tasks & Schedules Reliability

### Must ship
- Scheduler that actually executes jobs
- Job state model: queued/running/success/failed
- Run history/logs/next-run visibility
- Retries/backoff + dead-letter handling

### Trust rule
- If Tasks/Schedules not truly executable, hide controls until fixed.

---

## Release discipline (always)
For every behavior/UI change:
1. Version bump
2. In-app changelog update
3. `RELEASE_NOTES.md` update
4. Acceptance checklist noted in commit/PR

---

## Ownership
- Claude: core implementation (B/C/F)
- Lobster: architecture QA, UX/system integration, scope/guardrail enforcement, release governance

---

## Immediate next actions
1. Execute Phase A truth matrix now.
2. Start Phase B refactor.
3. Start Phase C once Phase B boundaries are in place.
