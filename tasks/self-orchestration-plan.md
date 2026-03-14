# Porter Self-Orchestration Plan
**Created:** 2026-03-09 | **Authors:** Claude (Opus 4.6) + GPT-5.4 (Codex)
**Directive from Moe:** "Make Porter smarter so it can take over at some point."

---

## Vision
Porter evolves from a tool humans drive → a system that drives itself. Agents don't wait for dispatch — they pick up work, coordinate, learn, and improve Porter's own codebase.

## The Three Stages

### Stage 1: Self-Monitoring (Foundation) ✅ COMPLETE (v0.30.32-35)
- ✅ **Health loop:** `_startup_self_check()` verifies 5 checks post-boot, System Health card in Runtime tab
- ✅ **Anomaly detection:** `_detect_anomalies()` — 7-day rolling baselines, 2x deviation flagging (v0.30.34)
- ✅ **Auto-triage:** `_error_self_heal_once()` — 10 error patterns with actionable remediation (v0.30.35)
- ⬜ **Test loop:** Post-deploy Playwright trigger (deferred — pre-commit hook covers commits)

### Stage 2: Self-Healing (Autonomy) ✅ COMPLETE (v0.30.6, v0.30.27, v0.30.36)
- ✅ **Auto-rollback:** Critical self-check failure → `git revert HEAD --no-edit` + restart, with loop prevention (v0.30.36)
- ✅ **Circuit breaker on backends:** PEP/1 circuit breaker (v0.13.7) + dispatch circuit breaker (v0.30.6) + rate-limit tracking (v0.30.27)
- ✅ **Config drift detection:** Hourly comparison of in-memory vs disk config, logs discrepancies (v0.30.36)
- ✅ **Memory hygiene:** Cortex consolidation (4 rules, 6h cycle) + context hygiene (4 rules, 12h cycle)

### Stage 3: Self-Improvement (Intelligence)
Porter improves its own code and capabilities:
- **Agent-driven development:** BugBanisher runs tests, files issues → LogicLord picks up tasks, writes patches → DeployDude ships
- **Pattern mining:** Analyze dispatch history — which agents succeed on which task types? Auto-tune routing weights.
- **Cortex-driven optimization:** Extract "what went wrong" from failed dispatches → inject as context into future similar dispatches
- **Feedback loops:** Every dispatch result scored (latency, token cost, user satisfaction if available) → model ranking auto-adjusts

## Architectural Requirements

### What Porter needs to get there:
1. **Task queue with agent assignment** — agents pull work, not just receive pushes
2. **Dispatch result scoring** — every response gets a quality signal (even if heuristic)
3. **Self-dispatch capability** — Porter can dispatch to its own agents without human trigger
4. **Code-aware agents** — agents can read/write porter.py (via patch scripts), run tests, ship
5. **Approval gates** — self-improvement changes go through verification loop before deploy
6. **Rollback safety** — every self-modification is reversible (git-backed)

### What we should NOT build:
- No unsupervised code changes to production (always verification loop)
- No infinite recursion (dispatch limit per hour, circuit breaker on self-dispatch)
- No bypassing ship process (version bump, test, commit, push, restart, verify)

## Collaboration: Claude + GPT-5.4

**Division of labor:**
- **GPT-5.4:** Performance optimization, algorithm design, Models tab, backend integration
- **Claude:** Architecture, Cortex intelligence, agent coordination, project integration
- **Together:** Self-orchestration primitives, shared through this doc + Porter's own dispatch

**Feedback protocol:**
- After each commit, the other model reviews the diff and flags concerns
- Patterns that work get captured in Cortex (project-scoped to Porter)
- Patterns that fail get captured in tasks/lessons.md

---

## Next Steps (Stage 3 — Self-Improvement)
1. [x] Dispatch result scoring — quality signal 0-100 per response (v0.30.37)
2. [x] Score-based routing — smart router overrides to higher-scoring backends after 10+ dispatches (v0.30.38)
3. [x] Cortex-driven optimization — inject failure lessons from last 24h into dispatch context (v0.30.39)
4. [x] Self-dispatch — Porter triggers agent work on anomalies/health failures (v0.30.40)
5. [x] Pattern mining — 7-day dispatch analysis: per-agent scores, backend reliability, failure patterns, hourly trends (v0.30.41)
6. [ ] Agent-driven development — BugBanisher → LogicLord → DeployDude pipeline (requires Moe's approval — allows agents to modify code)
