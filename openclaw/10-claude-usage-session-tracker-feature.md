# Feature Design: Universal Agent Usage and Session Reset Tracker

## Problem
When any connected agent hits API/session limits, workflow stalls and users do not know exactly when the next usable window begins.

## Goal
Add a Porter feature that tracks usage windows for all connected agents and shows:
- current usage state
- estimated time to reset
- next session start time
- per-agent status across devices

This should work for one user running multiple agents (VPS + Mac mini + others).

---

## Product outcome
In Porter UI, user can open **Agent Usage** and immediately see:
- Per-agent status: Available / Limited / Exhausted
- Next reset: timestamp + countdown
- Last successful activity
- Suggested handoff target (for example OpenClaw) if Claude is blocked

---

## Core concept
Treat usage state as a shared runtime object in Porter.

Each agent publishes periodic status snapshots to Porter:
- provider (`claude_code`, `openclaw`, etc.)
- account identifier (masked)
- usage window metadata
- reset timestamp if available
- health signal

Porter aggregates and displays this in one panel.

---

## Data model
## Entity: AgentUsageSnapshot
Fields:
- snapshot_id
- agent_id
- provider
- captured_at
- status (`available`, `degraded`, `rate_limited`, `unknown`)
- usage_percent
- window_started_at
- window_resets_at
- next_session_at (derived)
- source_type (`cli_parse`, `api`, `manual`)
- raw_excerpt (optional, sanitized)

## Entity: AgentProfile
- agent_id
- display_name
- role
- host_type (`vps`, `mac-mini`, etc.)
- permissions

## Entity: UsageAlert
- alert_id
- agent_id
- threshold (`50`, `75`, `90`, `exhausted`)
- triggered_at
- acknowledged

---

## Ingestion methods (priority order)
1. **CLI parser adapter** (first)
   - each agent connector runs provider-appropriate status command
   - parser extracts usage %, reset time, and window info
   - pushes normalized snapshot

2. **Provider API adapter** (later)
   - direct metadata pull if provider supports it

3. **Manual fallback**
   - user can paste status output and Porter parses it

---

## API design
### POST /agent-usage/snapshot
Create usage snapshot.

Request:
```json
{
  "agent_id":"claude-vps-1",
  "provider":"claude_code",
  "status":"rate_limited",
  "usage_percent":100,
  "window_started_at":"2026-02-24T02:00:00Z",
  "window_resets_at":"2026-02-24T10:00:00Z",
  "source_type":"cli_parse"
}
```

### GET /agent-usage/current
Return latest status per agent + global summary.

### GET /agent-usage/history?agent_id=...
Return snapshots for trends.

### POST /agent-usage/parse
Accept raw status text and return parsed structured fields.

---

## UI/UX
## New sidebar item: Agent Usage
Sections:
1. **Now**
   - table of agents + status pills + next reset countdown
2. **Upcoming resets**
   - timeline in next 24h
3. **Recommendations**
   - "Claude blocked, route heavy tasks to OpenClaw"
4. **History**
   - usage trend chart

Status colors:
- green: available
- yellow: high usage (>=75%)
- red: exhausted/rate-limited
- gray: unknown

---

## Multi-agent workflow support
When one provider is blocked:
- Porter emits handoff suggestion with context link
- user can click "handoff packet" to move task to another agent
- packet includes:
  - current objective
  - latest checkpoint
  - required files/refs

This aligns with your strategy of keeping all agents in sync via Porter.

---

## Alerting rules
Default alerts:
- 50% usage
- 75% usage
- 90% usage
- exhausted
- reset reached

Destinations:
- in-app banner
- optional webhook/notification

---

## Security and privacy
- Do not store raw credentials/tokens
- redact account identifiers in UI
- retain raw status excerpts only if explicitly enabled
- role-based visibility for usage data

---

## MVP scope (build first)
1. Connector-agnostic parser ingestion (Claude Code + OpenClaw + extensible adapters)
2. snapshot storage
3. current-status dashboard
4. countdown to next reset
5. threshold alerts

## Phase 2
- additional adapters for other providers
- automated handoff packets
- historical analytics and forecast

---

## Acceptance criteria
- User can see next Claude availability time in one click
- Usage state is visible for all registered agents
- Alerts trigger at configured thresholds
- No secrets exposed in logs/UI
- Handoff recommendation appears when agent is exhausted

---

## Build constraints for Claude Code
- additive feature only; do not break existing Porter file flows
- maintain backward compatibility
- include parser tests with sample Claude status outputs
- include timezone-safe countdown calculations
