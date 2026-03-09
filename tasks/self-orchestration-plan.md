# Porter Self-Orchestration Plan
**Created:** 2026-03-09 | **Authors:** Claude (Opus 4.6) + GPT-5.4 (Codex)
**Directive from Moe:** "Make Porter smarter so it can take over at some point."

---

## Vision
Porter evolves from a tool humans drive → a system that drives itself. Agents don't wait for dispatch — they pick up work, coordinate, learn, and improve Porter's own codebase.

## The Three Stages

### Stage 1: Self-Monitoring (Foundation)
Porter already has pieces of this. Formalize them:
- **Health loop:** Porter watches its own `/api/admin/health`, restarts if degraded
- **Test loop:** Playwright suite runs on every commit (pre-commit hook exists, extend to post-deploy)
- **Anomaly detection:** Telemetry baselines (7-day rolling avg) flag latency/error spikes
- **Log analysis:** MissionLog + AlertEngine already exist — add auto-triage (pattern match known errors → known fixes)

### Stage 2: Self-Healing (Autonomy)
Porter detects issues and fixes them without human intervention:
- **Auto-rollback:** If health check fails after deploy, `git revert HEAD && restart`
- **Circuit breaker on backends:** Auto-disable failing backends, re-enable after recovery probe passes
- **Config drift detection:** Compare running state vs config file, auto-correct
- **Memory hygiene:** Cortex consolidation already runs — add auto-archive for contradicted facts

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

## Next Steps (Phase 1 — Self-Monitoring)
1. [ ] Formalize health loop as a workflow automation (not just background thread)
2. [ ] Add post-deploy test trigger (after systemctl restart → run Playwright)
3. [ ] Wire anomaly detection into AlertEngine (latency spike → mission log warning)
4. [ ] Auto-triage: map common error patterns → fix scripts
