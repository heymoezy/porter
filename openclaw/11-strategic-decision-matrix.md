# Strategic Decision Matrix
## Porter roadmap choices, tradeoffs, and sequencing

## Product north star
Porter is the shared memory and control layer for multi-agent work across devices.

## Decision criteria (weighted)
- Strategic moat (30%)
- Revenue impact (25%)
- Build complexity/risk (15%)
- Time-to-value (20%)
- Compliance/operational robustness (10%)

---

## Option matrix

## Track A: File product only
Description:
- Keep Porter as file sync and file management only.

Pros:
- lowest complexity
- fastest incremental polish

Cons:
- weak differentiation
- limited AI-era moat
- low strategic upside

Score:
- Strategic moat: Low
- Revenue impact: Medium
- Time-to-value: High
- Overall: Medium-Low

## Track B: Memory substrate + pointer orchestration (recommended base)
Description:
- Keep file core intact, add memory pointers, retrieval APIs, checkpoint runtime.

Pros:
- strong differentiation
- immediate token/cost efficiency win
- supports multi-agent continuity

Cons:
- requires careful permission model
- introduces reliability expectations

Score:
- Strategic moat: High
- Revenue impact: High
- Time-to-value: Medium
- Overall: High

## Track C: Full Mission Control now (jobs, scheduler, optimization, policy routing)
Description:
- Build control center and automation layer immediately.

Pros:
- very strong long-term value
- high enterprise relevance

Cons:
- high complexity early
- risk of overbuilding before core adoption

Score:
- Strategic moat: Very High
- Revenue impact: High
- Time-to-value: Low
- Overall: Medium-High (too early as first major move)

---

## Recommended strategy
Phase into C through B:
1. Build B completely and reliably first.
2. Add lightweight mission-control primitives.
3. Add optimizer and policy routing only after observability baseline.

This balances strategic upside with execution risk.

---

## What to ship now (next 2 sprints)
## Sprint 1 (must)
- UX onboarding for locations, agents, permissions
- permission enforcement at endpoint level
- runtime durability and memory pointers exposed in UI
- universal agent usage tracker panel (all providers, adapter model)

## Sprint 2 (must)
- task list and run-state visibility (running, blocked, exhausted)
- pause/resume/cancel controls with role checks
- per-agent concurrency limit settings
- policy presets: speed / accuracy / balanced / lowest-cost

---

## What to delay until signal appears
- full autonomous optimizer and dynamic routing
- advanced forecasting
- enterprise RBAC depth

Delay condition:
- at least 3 real users using multi-agent workflows weekly
- evidence that manual policy controls are insufficient

---

## Policy model recommendation
User-level strategy profile:
- Cost sensitive (optimize token burn)
- Balanced
- Throughput first (speed)
- Quality first (accuracy)
- Local compute priority (if local model cost ~0)

Per-agent overrides:
- max concurrent jobs
- max context size
- escalation target when exhausted

---

## Guardrails
- Regulatory workflows: force conservative mode (quality + compliance checks)
- Commercial workflows: allow speed/cost tuning
- Never auto-route sensitive tasks to non-permitted agents

---

## KPI dashboard for decisions
Track weekly:
- average task completion time
- handoff success rate between agents
- interrupted-task recovery success
- token cost per completed workflow
- unauthorized access incidents (target zero)

Use these metrics to decide when to move from manual controls to auto-optimization.
