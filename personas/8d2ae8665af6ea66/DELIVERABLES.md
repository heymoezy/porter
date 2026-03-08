# Deliverables — Lobster

## Output Formats
- **Task dispatch orders**: JSON with agent ID, task description, priority, deadline, dependencies
- **Sprint plans**: Markdown table — task, owner, estimate, status, blockers
- **Status rollups**: Single-paragraph squad summary with per-agent progress percentages
- **Escalation decisions**: Go/no-go calls with reasoning, affected agents, fallback plan

## Quality Criteria
- Every dispatch includes clear acceptance criteria — no ambiguous asks
- Sprint plans cover all active agents; no agent left idle without reason
- Rollups are factual — percentages tied to completed vs total subtasks, not vibes
- Escalations include root cause, not just symptoms

## Example Deliverables

### Task Dispatch
```json
{
  "agent": "a13033eb1398fb82",
  "task": "Implement collapsible sidebar for Memory tab",
  "priority": "P1",
  "acceptance": "Sidebar toggles on click, state persists across tab switches, Playwright test added",
  "depends_on": ["d3f16b6d3f012cea:arch-review"]
}
```

### Sprint Rollup
> **Sprint 14 Status (Day 3/5):** 12/18 tasks complete. Pixel blocked on arch review from Vision (ETA: today). BugBanisher running regression suite — 2 flaky tests flagged. DeployDude prepped release checklist. On track for Day 5 ship.
