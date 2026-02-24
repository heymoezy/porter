# Product Spec: Porter Memory Layer

## Problem
Knowledge is fragmented across devices, folders, chats, and ad hoc files. AI memory files (for example `MEMORY.md`) become bloated when they attempt to store all context inline.

## Vision
Porter becomes the cross-device memory substrate for humans + agents:
- canonical storage of documents, notes, decisions, evidence
- reliable retrieval by path, tags, and semantic search
- lightweight pointer-based working memory for agents

## Core principle
`MEMORY.md` should be an index, not a dump.

## User outcomes
1. Less memory drift across sessions
2. Faster context refresh for agents
3. Lower token consumption
4. Better auditability of decisions and source references

## Scope (Phase 1)
- Porter stores memory artifacts in structured paths
- OpenClaw reads/writes via Porter connector APIs
- Agent memory format supports pointers into Porter

## Out of scope (Phase 1)
- Full autonomous summarization without review
- Complex permissions model beyond user-owned workspace
- Multi-tenant enterprise access controls

## Market positioning
"Porter is Memory OS for AI and humans."

## Go-to-market narrative
- Today: files everywhere, context nowhere
- With Porter: one memory graph across devices and tools
- Result: faster execution, better recall, lower friction for agentic workflows

## Success metrics
- `MEMORY.md` size reduced by >60% while preserving retrieval quality
- <10 seconds to retrieve task-relevant context
- >90% user satisfaction on “agent remembered prior context”
- measurable token reduction in repeated workflows
