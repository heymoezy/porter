Implement the feature spec in:
`openclaw/10-claude-usage-session-tracker-feature.md`

Objective:
Add a universal Agent Usage tracker to Porter so the user can see availability windows, next reset time, and handoff guidance when any connected agent hits limits.

Scope:
- Must support multiple providers (not Claude-only).
- Start with connector adapters for Claude Code and OpenClaw.
- Keep adapter interface extensible for future agents.

Rules:
- Do not break existing Porter file workflows.
- Implement as additive module.
- Prioritize MVP scope first.
- Include parser tests for realistic status output formats across providers.
- Handle timezone conversion and countdown safely.

Deliverables:
1. API endpoints for usage snapshots/current/history
2. parser endpoint for raw status text + provider selector
3. Agent Usage UI panel
4. threshold alert logic per agent
5. tests and short ops docs
