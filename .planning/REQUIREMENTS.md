# Porter Requirements — Active

**Milestone:** v7.0 Living Memory
**Last updated:** 2026-05-16
**Status:** Scoped 2026-05-16 — 4 phases, ~17 requirements. Awaiting `/gsd:plan-phase 49` to start execution.

For shipped v6.0 requirements + traceability, see `.planning/milestones/v6.0-REQUIREMENTS.md`.

---

## v7.0 — The Living Memory

**Theme:** v6.0 built the memory loop (silo → capture → dream → review → directive). v7.0 makes the loop actually catch the patterns Moe complains about, and scales it beyond the software silo.

**Why this milestone:** The 2026-05-16 logo-freehand incident was the trigger. The Dream Silos system had Moe's frustrated turns in the corpus but the dream worker generated generic structural rules instead of extracting the recurring failure pattern. The system is alive but blind to its primary signal. v7.0 fixes that — plus brings memory to non-software work (YMC admin, data-room) and activates the cold inter-agent delegation loop.

**Phases (4):**

- **Phase 49:** Pattern Detection — dream worker actually catches recurring failures + project-level directive scoping
- **Phase 50:** Multi-Silo Foundation — admin + data-room silos, enrollment workflow
- **Phase 51:** Dreams Review UX — bulk accept/reject, edit-in-place, search, silos list endpoint
- **Phase 52:** Closed Loop Activation — task-planner agent-selection, PCP-02 tool restrictions, Bridge deeper cleanup

---

### Phase 49 — Pattern Detection (LRN-*)

- [ ] **LRN-01:** Frustration-marker boost in transcript sampler — recent turns containing repeated user complaints, all-caps emphasis, "EVERY TIME"-style markers get force-included in the stratified sample (currently a uniformly-sampled turn buried in 1416 has no chance against generic structural patterns).
- [ ] **LRN-02:** Dream prompt rewrite to extract failure patterns explicitly — current prompt asks model to refine operating rules; new section asks "list any failure pattern that recurred ≥2 times in the corpus" as a separate output field, surfaced into proposals via a new kind.
- [ ] **LRN-03:** Project-level directive scoping — `directives.scope='project'` with `scope_id=<project-slug>`. Sessions in a software-silo cwd inherit silo directives AND any project-scope directives for that project. Lets YMC-specific rules (logo at X, brand casing Y) live at the YMC project, not in the global software silo.
- [ ] **LRN-04:** Project detection from cwd — silo-detector returns `(silo_id, project_id)` so `/context` can layer project directives on top of silo ones. Project-id derivation: trailing path segment of cwd (e.g., `/home/lobster/projects/ymc.capital` → `ymc.capital`).
- [ ] **LRN-05:** Smoke harness for pattern detection — `tests/smoke-49.sh` covering frustration-boost + project-scope read/write + project-silo layering.

### Phase 50 — Multi-Silo Foundation (MSF-*)

- [ ] **MSF-01:** Admin silo seed — `silos` row with `id='admin'`, prompt template at `dream-prompts/admin.md`, detect rules for admin-work cwds (Porter project, ymc admin code paths). Initial directive set: review-surface workflow, audit-event hygiene, RBAC posture.
- [ ] **MSF-02:** Data-room silo seed — `silos` row with `id='data-room'`, prompt template at `dream-prompts/data-room.md`, detect rules for fund operations (KYC, deal-flow, investor docs). Initial directives: no synthetic exhibits, audit primary sources, confidentiality posture.
- [ ] **MSF-03:** Silo enrollment workflow — adding a new silo requires only (a) a `silos` row, (b) a prompt template file, (c) seed directives via SQL. No code changes needed. `dream-worker.ts` is silo-agnostic by design but currently hardcodes some software-silo assumptions in the sampler — extract.
- [ ] **MSF-04:** Per-silo dream cadence — `silos.cadence_seconds` already exists but unused; wire scheduler to pick per-silo cadence (admin: every 3 days, data-room: weekly, software: weekly).

### Phase 51 — Dreams Review UX (DRX-*)

- [ ] **DRX-01:** Bulk accept/reject — multi-select rows on Dreams page, batch action with confirmation modal showing count.
- [ ] **DRX-02:** Edit-in-place on proposals — admin amends `proposed_content` before accept; captured in audit `details_json.original_content`.
- [ ] **DRX-03:** Proposal search — full-text across `proposed_content` + `source_evidence` via `tsvector` column.
- [ ] **DRX-04:** Silos list endpoint `/api/admin/silos` — replace hardcoded `software`/`software-smoke-48.4` filter dropdown with live data from new endpoint.

### Phase 52 — Closed Loop Activation (CLA-*)

- [ ] **CLA-01:** Task-planner agent-selection — `task-planner.ts` `assignedAgentId` populated from skills-vs-task match (replaces hardcoded `null` at lines 295, 355). Lookup via `personas.skills` JSONB vs task's required capabilities. Phase 43's `delegateToAgent` finally exercised by the decomposition pipeline.
- [ ] **CLA-02:** PCP-02 tool-restrictions — child dispatches inherit a subset of the parent's tool allowlist. Default: child can use any subset, never expand. Configurable per-agent via `personas.tool_restrictions` JSONB.
- [ ] **CLA-03:** Bridge deeper cleanup — address v6.0.1 carry-over (`learner.ts`, `config.ts`, `context-compressor.ts`, `task-decomposition` modules) that still reference removed gateways. Migrate live Ollama calls to Bridge OR remove the feature explicitly. (Was `BCC-01..09` in carry-over; `BCC-09 admin/backend` already done in v6.0.1.)

---

## Out of Scope for v7.0 (Deferred to v8.0+)

- **SIM-01..03 Self-Improvement** — agent-driven development, pattern mining across dispatch history, self-modifying codebase. Big enough for its own milestone. Wait for v7.0 to show what memory-pipeline metrics matter first.
- **BIL-01..03 SaaS Billing** — Lemon Squeezy, usage metering, plan enforcement. Revenue-side concern, decoupled from v7.0's memory work.

---

## Out of Scope (Unchanged from v6.0)

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first, responsive design |
| Self-hosting support | SaaS-only for now |
| Custom model training | Use existing providers via routing |
| Video/voice calling | Chat and messaging only |
| Distributed substrate (multi-machine) | v6.0 is local-first; distributed is v7+ |
| Unsupervised code mutation | Always requires verification loop |

---

*Active requirements file for v7.0 Living Memory. For v6.0 archive (60 reqs complete), see `milestones/v6.0-REQUIREMENTS.md`.*
