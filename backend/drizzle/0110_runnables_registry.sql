-- 2026-07-14 — #52: ONE registry for everything that runs.
--
-- Moe: "porter should differentiate between what are the agents and what are the cron jobs because
-- there's obviously confusion... the concepts of agents, loops, hooks, goals, cron jobs seem to be
-- so overlapping, porter needs to organise all proper."
--
-- IT ALREADY COST HIM. The "Fatburger Daily" email (his FAT Brands / Wiederhorn legal digest) STOPPED
-- on 2026-06-18 and nobody noticed for 25 days. Root cause: it was registered NOWHERE. Not a systemd
-- timer, not a cron entry, not a script in any repo, not a Porter workflow (verified: 0 rows match).
-- An earlier Claude session conjured it inside its own context and it evaporated with that session.
-- A thing that runs but is registered nowhere cannot be monitored, and dies silently.
--
-- THE REAL FRAGMENTATION (audited 2026-07-14) — three registries that do not know about each other:
--   · 21 systemd --user timers      the actual executors
--   · 17 ymc ops/scheduler.manifest desired-state truth, but for ymc-* ONLY
--   · 21 Porter `workflows` rows    Porter's own engine — a separate universe
--   ·  7 git hooks                  invariant gates
--   ·  9 TIMERS GOVERNED BY NOTHING (journeyful-*, porter-db-backup, ymc-tom-birthday/idle/
--        overnight/question/research, launchpadlib-cache-clean)
--
-- This table is the ONE place. It does not replace the executors — systemd still runs the jobs — it
-- is the registry that KNOWS about all of them, so nothing can run unobserved and nothing can die
-- unnoticed.

CREATE TABLE IF NOT EXISTS runnables (
  id            text PRIMARY KEY,
  -- The taxonomy Moe asked for. These are NOT synonyms:
  --   agent  — a persona that REASONS (Tom, Marshall, Scout). Non-deterministic by design.
  --   job    — a scheduled DETERMINISTIC execution (a timer + a script). Must be observable.
  --   hook   — an invariant GATE (git/DB/send-gate). Fires on an event, never on a clock, and its
  --            whole purpose is to REFUSE. A hook is not a job.
  --   loop   — an agent iterating toward a condition (/loop). Bounded by a goal, not a clock.
  --   goal   — a desired OUTCOME a human wants. Has no schedule at all; it is satisfied or not.
  kind          text NOT NULL CHECK (kind IN ('agent','job','hook','loop','goal')),
  name          text NOT NULL,
  owner         text,              -- which product/project owns it (ymc, porter, journeyful, …)
  source        text NOT NULL,     -- where it was DISCOVERED (systemd, ymc-manifest, porter-workflows, git-hooks)
  unit          text,              -- the systemd unit, when it has one
  schedule      text,              -- human-readable cadence
  -- Desired state, per the ymc manifest convention. `manual` = deliberately unscheduled.
  desired_state text NOT NULL DEFAULT 'active' CHECK (desired_state IN ('active','paused','manual')),
  -- Observed reality.
  last_success_at  double precision,
  last_result      text,           -- success | failed | unknown
  -- The whole point: how long may this go without succeeding before it is STALE? A Fatburger Daily
  -- that has not run in 25 days must SCREAM, not sit quietly.
  max_silence_seconds bigint,
  governed      boolean NOT NULL DEFAULT true,  -- false = runs, but no manifest governs it
  notes         text,
  first_seen_at double precision NOT NULL,
  last_seen_at  double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS runnables_kind_idx  ON runnables (kind);
CREATE INDEX IF NOT EXISTS runnables_owner_idx ON runnables (owner);
