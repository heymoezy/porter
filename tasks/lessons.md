# Lessons Learned

## L1: Always update projects.md on every version bump
**Date:** 2026-02-28
**Trigger:** Shipped v0.15.3, v0.15.4, v0.15.5 and wrote ROADMAP.md without touching projects.md. Moe had to catch it.
**Rule:** Every patch script that bumps the version MUST also update `/home/lobster/documents/projects.md` — current version, next action, changelog entry. No exceptions. This is the single source of truth for all models. If the strategic direction changes (like pivoting from sprints to phased roadmap), projects.md gets updated in the SAME session, not later.
**Enforcement:** Add projects.md update as a mandatory step in every patch script's checklist. Before calling a task "done", verify projects.md reflects the change.

## L2: Roadmap tasks must exist in the task registry, not just markdown
**Date:** 2026-02-28
**Trigger:** Wrote a 300-line ROADMAP.md with 38 tasks across 8 phases but never created them in `runtime/task-registry/`. The Projects tab still showed only 2 stale pending tasks. Moe had to catch it.
**Rule:** When a plan or roadmap is created/updated, its tasks MUST be simultaneously pushed into the task registry so they appear in the Porter UI. A plan that only exists in markdown is invisible to the product. Three things happen together, always: (1) markdown plan/roadmap, (2) task registry entries, (3) projects.md update.
