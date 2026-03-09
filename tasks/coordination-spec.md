# Model Coordination Mechanism — Spec
**Date:** 2026-03-09 | **Author:** Claude Opus 4.6
**Problem:** Models (Claude, GPT-5.4, Gemini, OpenClaw) work in isolation. No shared state, no task deconfliction, no handoff protocol. This causes version collisions, duplicate work, and stalled progress when one model doesn't know what another is doing.

## Core Design: Coordination Ledger

A shared append-only ledger inside Porter that all models read/write through a single API. Every model checks the ledger before starting work, claims tasks, and reports completion.

### Ledger Entry Schema
```json
{
  "id": "uuid",
  "ts": 1741539600,
  "model": "claude|codex|gemini|openclaw",
  "type": "claim|progress|complete|handoff|block|release",
  "scope": "file:porter.py|feature:models-tab|version:v0.30.10",
  "message": "Working on Cortex scope filters",
  "version_at": "v0.30.10",
  "ttl_minutes": 30,
  "expires_at": 1741541400
}
```

### Entry Types
- **claim** — "I'm working on X, don't touch it"
- **progress** — "Still working, here's what I've done"
- **complete** — "Done, shipped as vX.Y.Z"
- **handoff** — "Passing X to model Y with context Z"
- **block** — "I'm stuck on X, need help from Y"
- **release** — "Abandoning claim on X"

### Rules
1. Before starting work: check ledger for active claims on same scope
2. If claimed by another model: skip or coordinate
3. Claims expire after TTL (default 30 min) — prevents dead locks
4. Version collisions detected: if two models ship on same version number, ledger flags it
5. Handoffs include context: what was done, what's left, key decisions

### API Endpoints
- `GET /api/coordination/ledger` — read all active entries
- `POST /api/coordination/claim` — claim a scope
- `POST /api/coordination/update` — progress/complete/handoff
- `GET /api/coordination/conflicts` — version or scope conflicts
- `POST /api/coordination/handoff` — explicit handoff with context

### Integration Points
- **Dispatch pipeline:** Before persona dispatch, check ledger for active claims
- **Ship process:** On version bump, register completion in ledger
- **Monitoring loop:** Claude's 15-min loop checks ledger for stale claims and blocks
- **Codex CLI:** GPT-5.4 can read/write ledger via Porter API (already has auth via bridge)

### UI (Minimal)
- System tab or Orchestration tab: live ledger view
- Color-coded by model (cyan=Claude, green=Codex, amber=Gemini, red=OpenClaw)
- Active claims, recent completions, any conflicts flagged
