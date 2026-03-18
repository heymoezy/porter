# Porter — CLAUDE.md

Project-specific rules for Porter development. These supplement the global `~/CLAUDE.md`.

---

## Project Facts

- **Entry point:** `porter.py` (single file, stdlib only, ~802KB)
- **Port:** `8877`, bound to `127.0.0.1` only (never `0.0.0.0`)
- **Service:** `systemctl --user start|stop|restart|status porter`
- **Service file:** `~/.config/systemd/user/porter.service`
- **Config:** `porter_config.json` (via `PORTER_DATA_DIR` env var in systemd unit)
- **Access:** SSH tunnel — `ssh -fN -L 8877:127.0.0.1:8877 lobster@100.85.184.74`
- **Tests:** `cd /home/lobster/documents/porter/tests && npx playwright test` (28 tests)

### Serve Roots
`SERVE_DIRS` dict at top of `porter.py` maps label → `Path`:
- `documents` → `/home/lobster/documents/`
- `uploads` → `/home/lobster/uploads/`
- `websites` → `/home/websites/`

### Security
- `safe_resolve()` prevents path traversal
- `is_writable()` checks `st_uid`

---

## Architecture — Non-Negotiable Rules

**Treat this environment as incidental — one example deployment, not the product.**

1. **Fresh-start assumption.** First-time user has nothing configured. Must work from zero.
2. **No hardcoding.** No paths, hosts, ports, usernames, tokens, binary locations. Everything from config, env vars, or runtime detection.
3. **Capability detection first.** Detect available tools, services, credentials on startup.
4. **Graceful degradation.** Missing dependency → feature hidden or badged "unavailable" with install guidance.
5. **Explicit environment model.** Know where tools run (local, VPS, container, remote) and route accordingly.
6. **Guided bootstrap.** First-run wizard provisions dependencies step by step.
7. **Trust UX.** Show real capability state only. Never label unconfigured features as active.

### Known Hardcoding Violations (Sprint P0)
- `DEFAULT_MOUNTS` → hardcodes paths — must be empty on first run
- `CONFIG_PATH`, `RUNTIME_DIR`, `AVATAR_DIR`, `MEMORY_DIR` → hardcode `/home/lobster/` — must derive from `PORTER_DATA_DIR` or XDG
- `AGENT_WORKSPACE_DIR`, `OPENCLAW_STATE_DIR` → assume `~/.openclaw` — must be optional/detected
- `HOST = "76.13.190.52"` → hardcoded IP — must be auto-detected or configured
- `PORT = 8877` → should respect `PORTER_PORT` env var

---

## Dependencies (Porter-Managed)

### openclaw + Qwen Local Bridge
- **Gateway:** `http://127.0.0.1:18789`, auth token `lobster-2026`
- **Config:** `~/.openclaw/openclaw.json`
- **Primary model:** `openai-codex/gpt-5.4`
- **Local Ollama:** `http://127.0.0.1:11434`, model `qwen2.5-coder:7b-instruct-q4_K_M`
- **RAM constraint:** Qwen 7B = 4.7GB; don't run alongside memory-heavy processes

### Cascade (Planning Phase)
- See `/home/lobster/documents/cascade/whitepaper.md`
- Not yet implemented — whitepaper only

---

## Release Governance

All agents (Claude, Gemini, Codex, OpenClaw) must follow:

1. **No route handler changes without design review.** Adding/removing/renaming HTTP endpoints requires Moe's approval.
2. **No UI overrides.** Replacing root HTML, nav structure, or frameworks requires approval. Incremental patches only.
3. **35-test regression pass required.** All tests must pass before any commit.
4. **Version endpoint must match all strings.** Docstring (line 2), HTML badge, landing page, SSE welcome, startup banner — all must match.
5. **Ship process is mandatory.** Version bump → git add + commit → git push → systemctl restart → verify `/api/admin/health` → update projects.md. Never skip steps.
6. **No blank scaffolds.** Never commit UI that replaces working features with placeholders or boilerplate.

---

## Common Commands

```bash
systemctl --user status porter
systemctl --user restart porter
python3 /home/lobster/documents/porter/porter.py        # run directly
cd /home/lobster/documents/porter/tests && npx playwright test  # regression
curl http://127.0.0.1:11434/api/tags                     # list Ollama models
```
