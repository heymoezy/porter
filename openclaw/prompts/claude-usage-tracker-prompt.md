Implement the feature spec in:
`openclaw/10-claude-usage-session-tracker-feature.md`

Objective:
Add an Agent Usage tracker to Porter so the user can see Claude availability windows, next reset time, and handoff guidance when limits are hit.

Rules:
- Do not break existing Porter file workflows.
- Implement as additive module.
- Prioritize MVP scope first.
- Include parser tests for realistic Claude status output formats.
- Handle timezone conversion and countdown safely.

Deliverables:
1. API endpoints for usage snapshots/current/history
2. parser endpoint for raw status text
3. Agent Usage UI panel
4. threshold alert logic
5. tests and short ops docs
