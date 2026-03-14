# Porter Rename Audit — 2026-03-14

## Overview
Comprehensive sweep of all "Porter" references in the codebase, prepared for eventual product rename (e.g., to "askPorter" or another name).

**Grand total: ~1,500+ references across the codebase**

---

## porter.py (836 references)

| Case | Count |
|------|-------|
| `Porter` (title) | 398 |
| `porter` (lower) | 385 |
| `PORTER` (upper) | 53 |

### By category

| Category | Count | Difficulty | Notes |
|----------|-------|------------|-------|
| Version strings (7 locations) | 7 | Easy | Docstring, badge, startup, API, SSE, health, admin |
| Environment variables (`PORTER_*`) | 9 | Medium | Need backward compat aliases |
| Cookie name (`porter_session`) | 5 | Easy | Breaks existing sessions |
| Internal constants | 20+ | Easy | `PORTER_PERSONA_ID`, skill arrays, etc. |
| UI text (user-facing) | 35+ | Easy | Sidebar logo, login, chat labels, modals |
| XML tags (`<porter-action>`) | 2 | Medium | Regex patterns in chat action parsing |
| Logging prefix | 2 | Easy | `log = logging.getLogger("porter")` |
| Comments & docstrings | 50+ | Low priority | Historical references |
| Changelog entries | 100+ | Low priority | Historical, can keep as-is |

---

## Other Files

| File | Refs | Notes |
|------|------|-------|
| `porter_config.json` | 4 | Config file name itself is a breaking change |
| `porter.db` | — | Database filename |
| `porter-agent.py` | 5 | Worker bridge script |
| `~/.config/systemd/user/porter.service` | 4 | Service name, ExecStart path |
| `projects.md` | 50+ | Product registry + changelog |
| `RELEASE_NOTES.md` | 128 | Historical version entries |
| `ROADMAP.md` | 23 | Roadmap references |
| `CLAUDE.md` | 13 | Dev rules |
| `/personas/porter-core/` (4 files) | 19 | Master orchestrator persona |
| Research docs (20 files) | 250+ | Design docs |
| Memory files | 25 | Claude Code memory |
| Test files | 20+ | Playwright tests |

---

## Breaking Changes (require migration)

1. **Cookie name** `porter_session=` → all active sessions invalidated on rename
2. **Persona ID** `porter-core` in DB → SQL UPDATE on personas table
3. **Config file** `porter_config.json` → auto-detect old name on startup, copy to new
4. **Database file** `porter.db` → auto-detect and rename
5. **systemd service** `porter.service` → user must create new unit file
6. **Default password** `porter` → cosmetic, not security-critical

## Rename Strategy

When ready to rename:
1. Choose new name (e.g., `askporter`, `askPorter`)
2. Write a single Python patch script that:
   - Renames all 836 references in porter.py (with correct casing per context)
   - Renames config/db files with backward compat detection
   - Updates persona ID in DB
   - Generates new systemd unit file
3. Update all documentation files
4. Run full Playwright regression (27 tests)
5. Invalidate all sessions (users must re-login)

## Environment Variable Backward Compat

On rename, add aliases so old env vars still work:
```python
# Accept both old and new names
port = int(os.environ.get("NEWNAME_PORT", os.environ.get("PORTER_PORT", "8877")))
```

---

## Status
- [x] Audit complete (2026-03-14)
- [ ] Name decision pending (Moe)
- [ ] Rename patch (when name decided)
