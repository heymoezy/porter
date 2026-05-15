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

## Upcoming: v7.0

**TBD — awaiting Moe's scoping.**

Likely candidates carried over from v6.0 closeout (see `.planning/REQUIREMENTS.md` → "Carry-over from v6.0" section):

- Inter-agent delegation activation (task-planner agent-selection logic)
- PCP-02 tool-restriction enforcement on child dispatches
- Multi-silo support (admin / data-room silo)
- Dreams page UX (bulk accept/reject, edit-in-place, proposal search)
- Deeper Bridge consolidation cleanup
- Self-Improvement (SIM-01..03) — agent-driven development, pattern mining, self-modifying codebase
- SaaS Billing (BIL-01..03) — Lemon Squeezy, usage metering, plan limits

Run `/gsd:new-milestone` when ready to scope v7.0.

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
