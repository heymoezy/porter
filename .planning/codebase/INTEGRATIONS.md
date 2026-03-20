# External Integrations

**Analysis Date:** 2026-03-20

## APIs & External Services

**AI Model Providers:**
- OpenAI (via external gateway)
  - SDK/Client: HTTP requests to cloud
  - Auth: API keys stored in config

- Anthropic Claude (via external gateway)
  - SDK/Client: HTTP requests to cloud
  - Auth: API keys stored in config

- Google Gemini
  - SDK/Client: `gemini` binary CLI available in PATH
  - Auth: API key configuration
  - Config reference: `porter_config.json` stores agent credentials

- OpenClaw (Local AI Orchestration)
  - Gateway: `http://127.0.0.1:18789`
  - Auth: Bearer token `lobster-2026`
  - Primary model: `openai-codex/gpt-5.4`
  - Binary: `~/.npm-global/bin/openclaw` or `/usr/local/bin/openclaw`
  - State: `~/.openclaw/openclaw.json`
  - Functions: `_load_openclaw_skills()`, `_refresh_openclaw_usage()`

- Ollama (Local Model Inference)
  - Gateway: `http://127.0.0.1:11434`
  - Default model: `qwen2.5-coder:1.5b` (1.0GB)
  - Endpoint: `/api/tags` (list available models)
  - Detection: `_detect_local_models()` probes Ollama on startup

**Search & Web Integration:**
- Brave Search API
  - Auth: `BRAVE_API_KEY` environment variable
  - Use: Web search integration

- SerpAPI
  - Auth: `SERPAPI_KEY` environment variable
  - Use: Search engine result scraping

- Firecrawl
  - Auth: `FIRECRAWL_API_KEY` environment variable
  - Use: Web scraping and site crawling

**Communication & Notifications:**
- SendGrid
  - Auth: `SENDGRID_API_KEY` environment variable
  - Use: Email delivery

- ElevenLabs (Text-to-Speech)
  - Auth: `ELEVENLABS_API_KEY` environment variable
  - Use: Voice generation

**Google Workspace CLI (gws)**
- Binary: `gws` command
- Auth: Token at `~/.config/gws/token.json`
- Use: Google Workspace automation (Docs, Sheets, Drive, Gmail)
- Status: Detected via `_cap_check_gws()`

**Slack Automation**
- CLI-driven integration
- Auth: Slack app credentials
- Use: Message sending, automation

## Data Storage

**Databases:**
- SQLite (local)
  - Connection: `sqlite3` Python stdlib module
  - Main database: `<PORTER_DATA_DIR>/porter.db`
  - ORM: Drizzle ORM on backend
  - Tables: users, sessions, tasks, chats, chat_messages, chat_attachments, personas, projects, etc.
  - Log index: `<PORTER_DATA_DIR>/logs/log_index.db`

**File Storage:**
- Local filesystem only
  - Documents: `/home/lobster/documents/`
  - Websites: `/home/websites/`
  - Uploads: `/home/lobster/uploads/`
  - Configured via `SERVE_DIRS` in `porter.py`

**Caching:**
- In-memory session cache: `_sessions` dict (Python)
- Capability cache: `_capabilities_cache` dict (refreshed on startup)
- OpenClaw skills cache: `_skills_cache` (60s TTL)
- Log index: SQLite database with full-text search capability

## Authentication & Identity

**Auth Provider:**
- Custom session-based auth (internal)
  - Implementation: Token-based sessions in SQLite
  - Session table: `sessions` with token, username, expires, ip_address, user_agent, last_seen_at
  - Login endpoint: `/login` (POST) with credentials
  - Logout endpoint: `/logout`
  - Session cookie: `porter_session`
  - Session expiry: Configurable via `PORTER_SESSION_TIMEOUT`

**Multi-Agent Identity:**
- Agent registration in `porter_config.json`
- Agent types: `claude-code`, `openclaw`, `gemini`, `codex`, `ollama`
- Agent auth: API key hashing for verification
- Agent roles: `platform_admin`, `admin`, `operator`, `viewer` (role-based access control)

**Role-Based Access Control:**
- Platform admin: Full system access
- Admin: Administrative actions (not platform-wide)
- Operator: Standard operations
- Viewer: Read-only access

## Monitoring & Observability

**Error Tracking:**
- None (external service) - errors logged locally

**Logs:**
- Local file-based logging
  - Log directory: `<PORTER_DATA_DIR>/logs/`
  - Log index database: `<PORTER_DATA_DIR>/logs/log_index.db`
  - Log format: JSON entries with timestamps, level, source, context
  - Retention: Configurable via `hygiene_log_retention_days` (default: 7)
  - Python logging: stdlib `logging` module with configurable format

## CI/CD & Deployment

**Hosting:**
- Linux VPS with systemd
- Service file: `~/.config/systemd/user/porter.service`
- Service control: `systemctl --user start|stop|restart|status porter`

**CI Pipeline:**
- Test framework: Playwright (35 tests)
- Test command: `cd /home/lobster/documents/porter/tests && npx playwright test`
- Pre-commit hook: `.git/hooks/pre-commit` runs `scripts/nav-syntax-gate.sh`
- Release process:
  1. Version bump (8 locations must match: docstring, badge, startup, API, SSE, health, changelog, admin page)
  2. Git add + commit
  3. Git push to remote
  4. Service restart: `systemctl --user restart porter`
  5. Verify: `/api/admin/health` endpoint
  6. Update projects registry

## Environment Configuration

**Required env vars:**
- `PORTER_DATA_DIR` - Data directory (default: `~/.porter/`)
- `PORTER_PORT` - Server port (default: `8877`)
- `PORTER_HOST` - Bind hostname
- `PORTER_PUBLIC_IP` - Public IP display (fallback: external IP lookup via ipify/ifconfig.me/AWS)
- `PORTER_CONFIG` - Config file path
- `PORTER_AGENT_WORKSPACE` - Agent workspace
- `PORTER_OPENCLAW_STATE` - OpenClaw state

**Optional integration env vars:**
- `BRAVE_API_KEY` - Brave Search
- `FIRECRAWL_API_KEY` - Firecrawl web scraping
- `SENDGRID_API_KEY` - Email service
- `ELEVENLABS_API_KEY` - Text-to-speech
- `SERPAPI_KEY` - SerpAPI search

**Secrets location:**
- Config file: `<PORTER_DATA_DIR>/porter_config.json` (contains agent credentials, password hashes, salts)
- Never committed to git (in `.gitignore`)
- Password storage: PBKDF2 SHA256 hashing with per-user salt

## Webhooks & Callbacks

**Incoming:**
- `/login` - User authentication
- `/logout` - Session termination
- `/api/chat` - Chat message submission
- `/api/chat/stream` - Server-sent events (SSE) for streaming responses
- `/api/upload` - File upload endpoint
- `/api/admin/*` - Administrative endpoints (platform_admin only)

**Outgoing:**
- None detected - Porter calls external services (OpenClaw, Ollama, Brave, etc.) but does not export webhooks

## Model & AI Backend Routing

**Model Registry:**
- Function: `_parse_model_registry()` - parses available models
- Source: Configuration + runtime detection
- Supported backends:
  - OpenAI (via gateway)
  - Anthropic Claude
  - Google Gemini
  - OpenClaw (Codex)
  - Ollama (local)

**Dispatch Strategy:**
- Smart routing: `_dispatch_openclaw()`, `_dispatch_gemini()` with configurable policy
- Policy modes: `best_fit`, `balanced`, `cost_optimized`
- Model fallback: If primary unavailable, routes to secondary
- Session-based model switching: Users can request model change inline ("use claude", "switch to gemini")

**Capability Detection:**
- Startup: `_cap_check_*()` functions probe each backend
- Services probed:
  - Ollama: HTTP `/api/tags` check
  - OpenClaw: Binary check + version probe
  - Gemini: Binary check + auth token verification
  - Brave Search: API key presence
  - Firecrawl, SendGrid, ElevenLabs: API key presence
  - GWS: Binary + token.json existence

---

*Integration audit: 2026-03-20*
