# Personas — CLAUDE.md

## Agent File Structure
Each persona directory contains:
- `IDENTITY.md` — Name, role, capabilities, backend preference
- `SOUL.md` — Personality, values, tone, communication style (DO NOT modify lightly)
- `USER.md` — How this agent interacts with Moe (the operator)
- `MEMORY.md` — Learned behaviors, operational state (auto-updated)
- `ROLE_CARD.md` — Structured metadata (group, backend, status)
- `DELIVERABLES.md` — Concrete output formats and quality criteria
- `heartbeat.md` — Health probe config

## Rules
- SOUL.md is law — never change personality without Moe's explicit approval
- MEMORY.md is the only file that should be auto-updated by agents
- DELIVERABLES.md defines what the agent produces — dispatches should match these specs
- Never create files outside this structure without approval
- Agent IDs are hex strings — do not rename directories

## Agent Groups
| Group | Color | Agents |
|-------|-------|--------|
| Orchestrator | red | Lobster |
| Strategy | indigo | Sage |
| Creative | pink | Pretty, Quill |
| Technical | cyan | Vision, Pixel, LogicLord |
| Operations | amber | BugBanisher, DeployDude |

## Global Rules
`RULES.md` in this directory applies to ALL agents. Agent-specific rules go in the agent's own files.

## Backend Assignment
- `claude` — Vision, Pixel, LogicLord (implementation agents)
- `gemini` — Sage, Pretty, Quill (research/creative agents)
- `openclaw` — Lobster, BugBanisher, DeployDude (orchestration/ops agents)
