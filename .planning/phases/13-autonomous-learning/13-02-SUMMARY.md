---
phase: 13-autonomous-learning
plan: "02"
subsystem: services
tags: [learner, duck-duck-scrape, robots-parser, ollama, github, reddit, pii-scrubbing, memory-v2]

# Dependency graph
requires:
  - phase: 13-autonomous-learning
    plan: "01"
    provides: concepts and learning_sessions tables
  - phase: 12-crm-intelligence-and-agent-templates
    provides: agent_templates table, contact-analyzer.ts Ollama call pattern
provides:
  - backend/src/services/learner.ts — full research loop engine
  - runLearningSession(templateId) — main entrypoint for autonomous learning
  - LearningSessionResult, SourceVisit exported types
  - duck-duck-scrape 2.2.7 — DuckDuckGo HTML scraping
  - robots-parser 3.0.1 — robots.txt compliance
affects: [13-autonomous-learning plan 03 (scheduler integration uses runLearningSession)]

# Tech tracking
tech-stack:
  added:
    - "duck-duck-scrape@2.2.7 — DuckDuckGo search (no API key, HTML scraping)"
    - "robots-parser@3.0.1 — robots.txt parsing for politeness compliance"
  patterns:
    - "Direct Ollama fetch() pattern for background extraction (no AI router) — same as contact-analyzer.ts"
    - "SessionBudget class tracks outbound HTTP request budget (20 per session)"
    - "In-memory robots.txt cache Map<hostname, {rules, expiresAt}> with 24h TTL"
    - "Domain-authority confidence scoring: official_docs=85/high, stackoverflow=55/medium, reddit=30/low"
    - "PII scrubbing: prompt instruction + post-extraction regex (emails, @handles, phone numbers)"
    - "3-iteration research loop: broad -> gap refinement -> depth pass"
    - "Deduplication by first-100-chars content key"

key-files:
  created:
    - backend/src/services/learner.ts
  modified:
    - backend/package.json

key-decisions:
  - "Source authority (not LLM self-assessment) for confidence scores — locked from context doc"
  - "Ollama called directly via fetch() — never through AI router — cost efficiency at scale"
  - "Concepts scoped to template: scope='agent', scope_id=templateId — locked from context doc"
  - "20-request session cap includes all outbound HTTP fetches (not just search queries)"
  - "robots.txt fetches are free (not counted against budget) — politeness without burning cap"
  - "PII double protection: extraction prompt instruction + post-extraction regex"
  - "Unauthenticated Octokit fallback when no GitHub connection configured"
  - "Source failures are caught silently; only template-not-found and DB write errors throw"

requirements-completed: [LEARN-01, LEARN-02]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 13 Plan 02: Autonomous Learning Engine Summary

**Core research loop engine (learner.ts) with DuckDuckGo/GitHub/Reddit search, Ollama/Qwen concept extraction, PII scrubbing, domain-authority confidence scoring, robots.txt compliance, 20-request budget, and DB writes to concepts + learning_sessions tables**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-22T21:29:51Z
- **Completed:** 2026-03-22T21:33:47Z
- **Tasks:** 2
- **Files modified:** 2 (package.json, learner.ts created)

## Accomplishments

- `duck-duck-scrape@2.2.7` and `robots-parser@3.0.1` installed and importable
- `backend/src/services/learner.ts` created (720 lines)
- `runLearningSession(templateId)` — main entrypoint orchestrating 3-iteration research loop
- `searchWeb()` — DuckDuckGo via duck-duck-scrape with `{ safeSearch: 0 }`
- `searchGitHub()` — GitHub REST `/search/repositories` via Octokit; unauthenticated fallback
- `searchReddit()` — public `.json` endpoint with `User-Agent` header and robots.txt check
- `extractConcepts()` — Ollama/Qwen `format: 'json'` call; strips markdown fences; returns empty on failure
- `scrubPII()` — three regex patterns: emails, `@handles`, phone numbers
- `sourceConfidence()` — domain-based tiers: 9 official domains (85/high), 5 medium domains (55/medium), reddit (30/low), default (40/low)
- `isAllowedByRobots()` — in-memory Map cache with 24h TTL; permissive on fetch error
- `SessionBudget` class — tracks `MAX_REQUESTS_PER_SESSION = 20`
- Concepts written to `concepts` table with `scope='agent'`, `scope_id=templateId`
- Learning session record written to `learning_sessions` table
- TypeScript compilation passes with zero errors

## Task Commits

1. **Task 1: Install dependencies** — `3170c41` (chore)
2. **Task 2: Create learner.ts** — `cc83f81` (feat)

## Files Created/Modified

- `backend/package.json` — added duck-duck-scrape@^2.2.7 and robots-parser@^3.0.1
- `backend/src/services/learner.ts` — 720-line research loop engine (new file)

## Decisions Made

- Source authority confidence scoring: domain-based hierarchy locked from CONTEXT.md — never LLM self-assessment
- Direct Ollama fetch() pattern (no AI router): same principle as contact-analyzer.ts for cost efficiency at autonomous scale
- robots.txt fetches are free (excluded from 20-request cap): politeness layer should not consume learning budget
- Unauthenticated Octokit fallback: learner degrades gracefully when no GitHub connection configured
- PII double-protection: extraction prompt + regex pass — GDPR-safe by design

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. GitHub connection optional (learner falls back to unauthenticated Octokit).

## Next Phase Readiness

- `runLearningSession()` ready for Plan 03 (scheduler integration: wiring into agent_jobs + bootstrap sweep)
- `LearningSessionResult` and `SourceVisit` types exported for use in Plan 03 and API routes
- Both concepts and learning_sessions tables written to correctly

---
*Phase: 13-autonomous-learning*
*Completed: 2026-03-22*
