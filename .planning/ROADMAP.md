# Roadmap: Porter

## Milestones

- ✅ **v1.0 Foundation + Core Platform** — Phases 1-7 (shipped 2026-03-21)
- ✅ **v2.0 Backend Ready** — Phases 8-15 (shipped 2026-03-24)
- ✅ **v3.0 Porter Bridge** — Phases 16-23 (shipped 2026-03-25) — AI gateway, model intelligence, smart routing
- ⏸️ **v4.0 The Arena** — Phases 24-30 (6/7 shipped, Phase 28 Battle Arena deferred)
- ✅ **v5.0 Living Skills** — Phases 31-39 (shipped 2026-04-03) — Skills as live behavioral modules, bridge task dispatch
- ✅ **v6.0 The Orchestration Platform** — 12 phases (40-48.4), 60 requirements, shipped 2026-05-13. Full details: [.planning/milestones/v6.0-ROADMAP.md](milestones/v6.0-ROADMAP.md)

## Past Milestones (Line Summaries)

- **v1.0** — Foundation, Memory V2, agent autonomy, guided wizard, transparency, external connections. 30/30 reqs. 7 phases. See `.planning/MILESTONES.md`.
- **v2.0** — API foundation, streaming chat, collaboration, unified chat+CRM, agent templates, autonomous learning, PostgreSQL migration, Memory V3, skills/tools. 38/41 reqs (3 billing deferred). 9 phases. Archive: `milestones/v2.0-ROADMAP.md`.
- **v3.0** — Porter Bridge: gateway foundation, provider adapters, resilience, model catalog, smart routing, first-run setup, bridge admin, multi-tenant. 46/46 reqs. 8 phases.
- **v4.0** — The Arena: schema migration, RPG engine, forge unification, character sheet UI, session registry + message bus, intelligence loop. 17/17 plans, Phase 28 Battle Arena deferred. 6 phases.
- **v5.0** — Living Skills: source-of-truth cleanup, skill pack explorer, runtime selector, feedback telemetry, evolution loop, quality scoring, template UX, adaptive context, bridge task dispatch. 30/30 reqs. 9 phases.
- **v6.0** — The Orchestration Platform: gateway capabilities, session intelligence, task decomposition, inter-agent messaging, autonomous job queue, Porter control plane, project monitoring, project substrate, **Dream Silos series (48.1-48.4 inserted)**: silo foundation, transcript capture, software dream worker, review surface. 60/60 reqs. 12 phases. Archive: `milestones/v6.0-ROADMAP.md`.

## In Progress: v7.0 The Living Memory

**Scoped:** 2026-05-16. **Trigger:** the YMC logo freehand incident — dream worker had Moe's frustrated turns in the corpus but extracted generic structural patterns instead of the recurring failure. System is alive but blind to its primary signal. v7.0 fixes that, scales memory beyond software silo, and activates the dormant Phase 43 delegation loop.

**4 phases, ~17 requirements** — full breakdown in `.planning/REQUIREMENTS.md`:

### Phase 49: Pattern Detection (LRN-*)  ✅ COMPLETE (2026-05-16)
**Goal:** Dream worker actually catches recurring failures (the YMC logo pattern that v6.0 missed). Project-level directive scoping so project-specific rules (YMC logo at X, brand casing Y) live at the project, not the global silo.
**Plans:** 5/5 plans complete. 49-VERIFICATION.md PASSED 5/5 LRN must-haves. Porter v6.17.1 live, all 5 phase smokes (48.1-48.4 + 49) green, TSC clean.
- [x] 49-01-PLAN.md — LRN-01 frustration-marker boost in dream-sampler.ts (Pass A0 + recency-first force-include + samplingLog audit fields)
- [x] 49-02-PLAN.md — LRN-02 prompt rewrite (Failure Patterns section in software.md) + dream-parser.ts Zod schema extension + dream-worker.ts failure_pattern proposal insertion + audit event
- [x] 49-03-PLAN.md — LRN-03 project-scope directive layering in /context (effectiveProject derivation + symmetric concepts/episodes scoping + optional partial-index migration 049) [Wave 2 — depends on 49-04]
- [x] 49-04-PLAN.md — LRN-04 detectProject pure function + detectContext composite + DetectedContext interface in silo-detector.ts (additive sibling exports, detectSilos unchanged)
- [x] 49-05-PLAN.md — LRN-05 smoke harness tests/smoke-49.sh + fixture dream-response-pattern-detection.json (covers all 5 LRNs + trigger immutability across scopes) [Wave 3 — depends on 49-01..04]
- [x] 49-VALIDATION.md — Nyquist coverage map (per-LRN sampling strategy, manual-only verifications, sign-off checklist)
- [x] 49-VERIFICATION.md — 5/5 must-haves PASSED, autonomous execution under Moe delegation
**Depends on:** Phase 48.3 + 48.4 (Dream Silos series — shipped).

### Phase 50: Multi-Silo Foundation (MSF-*)  ✅ COMPLETE (2026-05-17)
**Goal:** Admin silo + data-room silo + silo enrollment workflow (adding a silo = one SQL block + one prompt file, no code change). Per-silo dream cadence wired.
**Plans:** 4/4 plans executed. smoke-50 phase gate green.
- [x] 50-01-PLAN.md — MSF-04 + MSF-03 scheduler refactor (runSiloCadenceCheck + SILO_CADENCE_CHECK_INTERVAL) + dream-worker checkSkipRecent per-silo rewrite (SKIP_RECENT_THRESHOLD_S deleted) + migration scaffold + delete legacy `Software dream — weekly consolidation` workflow row + document `software` safe-default fallbacks [Wave 1 — gates Wave 2]
- [x] 50-02-PLAN.md — MSF-01 admin silo seed (silos row id=admin cadence 259200 + 4 moe-direct directives + dream-prompts/admin.md + .admin-silo marker files in Porter admin/frontend AND ymc.capital site/app/routes/admin via cross-repo commit) [Wave 2 — parallel with 50-03]
- [x] 50-03-PLAN.md — MSF-02 data-room silo seed (silos row id=data-room cadence 604800 + 5 moe-direct directives + dream-prompts/data-room.md + 4 .data-room-silo marker files across ymc.capital dealdocs/workoutdocs + ymc.capital-private/workoutdocs + Funds via cross-repo commits) [Wave 2 — parallel with 50-02]
- [x] 50-04-PLAN.md — Smoke harness tests/smoke-50.sh + 2 fixtures (dream-response-admin.json + dream-response-data-room.json) covering MSF-01..04 + silo-agnostic synthetic-silo enrollment proof (SC-11) + multi-silo /context layering (SC-19/20) + trigger immutability across new silos [Wave 3 — depends on 50-01..03]
- [x] 50-VALIDATION.md — Nyquist coverage map (per-MSF sampling, manual-only verifications, cross-repo coordination notes, sign-off checklist)
**Depends on:** Phase 49 (project scoping makes per-silo cadence meaningful).

### Phase 51: Dreams Review UX (DRX-*)
**Goal:** Make the review surface actually usable at volume — bulk accept/reject, edit-in-place, proposal search, live silos list.
**Plans:** 4 (bulk actions, edit-in-place, search, silos endpoint).
**Depends on:** Phase 50 (more silos = more proposals = the UX matters).

### Phase 52: Closed Loop Activation (CLA-*)
**Goal:** Wire the cold loops from v6.0 — task-planner picks an agent (activates Phase 43), child dispatches inherit tool restrictions (PCP-02), and deeper Bridge cleanup removes Ollama refs from `learner.ts` / `config.ts` / `task-decomposition` / etc.
**Plans:** 3 (planner agent-selection, tool-restrictions, Bridge deeper cleanup).
**Depends on:** Phase 49 (project scope informs agent selection).

**Execution order:** 49 ✅ → 50 ✅ → 51 → 52 (linear; each phase enables the next).

Deferred to v8.0: SIM-01..03 (Self-Improvement), BIL-01..03 (SaaS Billing).

Run `/gsd:plan-phase 51` to continue.

## Progress

**Execution Order:** Phases 1-48.4 complete. v6.0 archived 2026-05-15.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 51/51 | Complete | 2026-03-21 |
| 8-15 | v2.0 | 28/31 | Complete (3 billing deferred) | 2026-03-24 |
| 16-23 | v3.0 | - | Complete | 2026-03-25 |
| 24-30 | v4.0 | 17/17 | Partial (28 deferred) | 2026-04-02 |
| 31-39 | v5.0 | 27/27 | Complete | 2026-04-03 |
| 40-48.4 | v6.0 | 41/41 | Complete | 2026-05-13 |
| 49 | v7.0 | 5/5 | Complete | 2026-05-16 |
| 50 | v7.0 | 4/4 | Complete | 2026-05-17 |
