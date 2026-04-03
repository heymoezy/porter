# Overnight Release Plan — 2026-03-23

> **HISTORICAL DOCUMENT** — This plan was for Phase 13.05 PostgreSQL migration (completed 2026-03-23). porter.py is now deleted. PostgreSQL is the sole DB. All tasks below have been completed.

**Owner:** Claude (taking over from Moe + GSD)
**Trigger:** GSD completes Phase 13.05 PostgreSQL migration
**Goal:** Stabilize, consolidate, ship, push, document

---

## Priority 0: Single Source of Truth Consolidation

**Non-negotiable.** Before anything ships, the architecture must be: 1 database, 1 schema, 1 API. Admin and UI are windows, not owners.

### 0.1 — Kill the Admin DB
- Admin currently has its own sqlite at `~/.porter/porter.db`
- Brain has `~/documents/porter/porter.db` (migrating to PostgreSQL)
- After PG migration: Admin backend connects to the SAME PostgreSQL instance
- Delete `~/.porter/porter.db` entirely
- Admin's `agent_templates` table moves into Brain's schema
- Admin's forge pipeline tables move into Brain's schema
- All admin migrations become Brain migrations

### 0.2 — Reconcile Templates
- Seed file has 103 templates, DB has 84 — reconcile to ONE correct set
- Delete porter.py hardcoded template dicts (legacy)
- Admin stops proxying through porter.py for template data
- All template CRUD goes through Brain API (`/api/v1/templates`)
- Verify: Queue Master exists once, with one ID (`forge-queue-master`), in one place

### 0.3 — Shared Design System
- ONE design system, consumed by both Admin and UI frontends
- Shared Tailwind config, CSS variables, component tokens
- No repo-local component re-implementations
- Path: extract to `@porter/ui` package OR shared directory both repos import from

---

## Priority 1: Verify PG Migration (after GSD completes)

### 1.1 — Validate migration
- [ ] PostgreSQL is running (docker-compose up)
- [ ] `migrate-sqlite-to-pg.ts` ran successfully (exit 0)
- [ ] Row counts match: compare every table sqlite vs pg
- [ ] Spot-check 5-10 records per table
- [ ] FTS equivalence: tsvector search returns same results as FTS5

### 1.2 — Run tests
- [ ] 35 Playwright tests pass against PostgreSQL-backed Fastify
- [ ] Manual smoke: login, create project, chat, file upload, agent create

### 1.3 — Fix breakage
- [ ] Any test failures → fix immediately
- [ ] Any data gaps → backfill from sqlite before deleting it

---

## Priority 2: Git Hygiene — Push Everything

### Porter Brain (22 unpushed commits + 50+ uncommitted files)
- [ ] Review all uncommitted changes (PG migration work)
- [ ] Stage and commit in logical groups:
  - Commit 1: Phase 13 completion (Autonomous Learning)
  - Commit 2: Phase 13.05 planning docs
  - Commit 3: Schema migration (pgTable rewrite)
  - Commit 4: Route/service SQL conversion
  - Commit 5: Infrastructure (docker-compose, .env.example, config)
  - Commit 6: Data migration script
  - Commit 7: Admin DB consolidation (Priority 0 work)
- [ ] Push all to origin/master
- [ ] Verify GitHub shows current state

### Porter Admin (31 uncommitted files + 8 untracked)
- [ ] Commit Agent Forge Phase 2 work (step 12/15)
- [ ] Commit chat engine, forge UI, template cleanup
- [ ] Push to origin/main
- [ ] Verify GitHub shows current state

### Porter UI (7 uncommitted files)
- [ ] Commit dashboard overhaul, auth changes
- [ ] Push to origin/main
- [ ] Verify GitHub shows current state

---

## Priority 3: Release Notes & Documentation

### RELEASE_NOTES.md (Porter Brain)
- [ ] Document v1.0.1 → v1.1.0 (or v2.0.0 if PG migration warrants major bump)
- [ ] Sections: PostgreSQL migration, Autonomous Learning (Phase 13), single-truth consolidation
- [ ] Include breaking changes (SQLite → PostgreSQL, DATABASE_URL required)

### CHANGELOG.md (Porter Admin)
- [ ] Document v0.5.1 → v0.6.0
- [ ] Agent Forge Phase 2, template cleanup, chat engine, queue system

### projects.md
- [ ] Update all three repo versions
- [ ] Update changelog with today's work
- [ ] Note: "single source of truth consolidation complete"

---

## Priority 4: Pending Work Items

### Porter Admin — Agent Forge (remaining from checkpoint)
- [ ] Fix agent detail tabs — standardize to match template tabs
- [ ] Sync template IDs (part of Priority 0.2)
- [ ] Fix Writer to create agents without instantiate API
- [ ] Improve disintegration animation (particle effects)
- [ ] Fix moe@themozaic.com missing from customer list
- [ ] Investigate Queue Master data consistency (part of Priority 0.2)

### Porter Brain — Post-Migration
- [ ] Plans 06-07: Merge admin backend into Brain, update admin frontend proxy
- [ ] Verify all services restart cleanly with PostgreSQL
- [ ] Update systemd service file if needed (DATABASE_URL env var)

---

## Priority 5: Ideas Captured This Session

### Agent Continuous Learning (detailed plan exists)
- **File:** `research/agent-continuous-learning.md`
- **Status:** Approved concept, 5 phases detailed
- **Blocked on:** Email infrastructure
- **Action:** Slot as future GSD phase after PG migration stabilizes

### Visual Quality Bar (Unicorn Studio reference)
- **File:** Memory reference saved
- **Status:** Design inspiration, not a dependency
- **Action:** When touching UI, achieve Three.js/R3F WebGL effects with open-source tools
- **Applies to:** Marketing site, dashboard hero, agent office

### Template Reconciliation → Single Registry
- Absorbed into Priority 0.2 above

---

## Execution Order

```
GSD finishes PG migration
    ↓
1. Verify migration (Priority 1)
    ↓
2. Single-truth consolidation (Priority 0) ← most important
    ↓
3. Commit + push all repos (Priority 2)
    ↓
4. Release notes + projects.md (Priority 3)
    ↓
5. Pending Forge fixes (Priority 4)
    ↓
6. Report back to Moe
```

---

## Success Criteria

- [ ] ONE PostgreSQL database, all repos connect to it
- [ ] ZERO sqlite files in use
- [ ] ZERO template duplicates across systems
- [ ] All 3 repos pushed to GitHub with current code
- [ ] Release notes document everything shipped
- [ ] projects.md reflects actual state
- [ ] 35 Playwright tests green
- [ ] All services healthy on restart
- [ ] Moe wakes up to a clean, consolidated, documented system

---

## Open Questions for Moe (non-blocking, will decide)

1. Version bump: v1.1.0 or v2.0.0 for PG migration?
2. Should admin frontend live in Brain repo long-term (monorepo) or stay separate with shared DB?
3. Shared component library: npm package (`@porter/ui`) or git submodule or monorepo workspace?
