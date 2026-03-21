---
phase: 07-external-connections
plan: "04"
subsystem: infra
tags: [config, hardcoding, env-vars, porter.py, billing]

# Dependency graph
requires:
  - phase: 07-01
    provides: External connections schema and config.ts foundation

provides:
  - Zero hardcoded IPs, ports, paths, or tokens in backend/src/ outside config.ts defaults
  - porter.py JS _projArtifactUrl uses generic /home/<user>/ regex instead of /home/lobster/
  - porter.py ship command helper no longer references hardcoded porter/tests path
  - porter.py memory config panel uses window._porterDataDir instead of hardcoded path
  - CONN-05 compliance achieved across both backend and porter.py

affects: [all-phases, deployability, fresh-install, external-connections]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All service URLs and redirect targets route through config.ts imports, never direct process.env"
    - "porter.py embedded JS uses generic regex /home/<user>/ pattern instead of machine-specific paths"
    - "window._porterDataDir as the canonical frontend access point for server data directory"

key-files:
  created: []
  modified:
    - backend/src/services/billing.ts
    - porter.py

key-decisions:
  - "billing.ts redirect_url fallback changed from localhost:8877 (porter.py port) to localhost:3001 (Fastify backend port) — aligns with Fastify-first architecture"
  - "_projArtifactUrl JS function uses /home/<user>/ regex stripping — works on any Linux deployment, not just Moe's machine"
  - "Changelog entry in porter.py release notes rephrased to remove literal /home/lobster text — even display strings should not contain machine-specific paths"

patterns-established:
  - "config.publicUrl as the single source for public-facing URL in backend — never process.env.PORTER_PUBLIC_URL directly"

requirements-completed: [CONN-05]

# Metrics
duration: 8min
completed: 2026-03-21
---

# Phase 07 Plan 04: Hardcoding Elimination Summary

**Zero hardcoded IPs, ports, paths, or tokens in backend/src outside config.ts; porter.py embedded JS generalized from /home/lobster/ to any /home/<user>/ deployment**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-21T16:40:00Z
- **Completed:** 2026-03-21T16:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Audited all backend/src TypeScript files — found one violation in billing.ts redirect_url fallback which used direct `process.env.PORTER_PUBLIC_URL` with a hardcoded `:8877` port default instead of `config.publicUrl`
- Fixed four violations in porter.py embedded JavaScript: artifact URL function, ship command helper, memory config panel path, and a changelog display string
- All porter.py PORTER_DATA_DIR, PORTER_PORT, PORTER_HOST, and PORTER_PUBLIC_IP env var lookups were already in place from earlier sprints — this plan completed the CONN-05 audit

## Task Commits

Each task was committed atomically:

1. **Task 1: Purge hardcoded values from Fastify backend** - `03abbef` (fix)
2. **Task 2: Purge hardcoded values from porter.py** - `7c48178` (fix)

## Files Created/Modified

- `backend/src/services/billing.ts` - Fixed redirect_url to use `config.publicUrl` instead of `process.env.PORTER_PUBLIC_URL || 'http://localhost:8877'`
- `porter.py` - Fixed 4 embedded JS violations: _projArtifactUrl generic regex, ship command text, memory panel path, changelog text

## Decisions Made

- **billing.ts fallback port**: Changed hardcoded `:8877` fallback to `:3001` since this is the Fastify backend (PORTER_BACKEND_PORT) — the redirect comes from Fastify, not porter.py
- **_projArtifactUrl regex**: Used `/home/<user>/` pattern (`/^\\/home\\/[^\\/]+\\/workspace\\//`) rather than deleting the path-stripping logic entirely — artifact paths stored in DB may still contain absolute paths on existing installs
- **window._porterDataDir**: Used as the dynamic replacement for hardcoded projects.md path in memory config panel — this global can be populated by porter.py's boot/config response

## Deviations from Plan

None — plan executed as written. All backend/src files were already clean except billing.ts. The porter.py violations were exactly as documented in CLAUDE.md Known Hardcoding Violations section.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. All changes are internal env var routing.

## Next Phase Readiness

- CONN-05 requirement fully satisfied — zero hardcoded values in either backend subsystem
- Codebase is now deployment-agnostic: works on any Linux machine by setting PORTER_DATA_DIR, PORTER_PORT, PORTER_HOST, PORTER_PUBLIC_IP
- Ready to continue with remaining Phase 07 plans

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*
