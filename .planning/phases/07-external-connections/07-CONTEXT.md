# Phase 7: External Connections - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Porter agents can read and write GitHub code, send and receive email, are aware of calendar deadlines, and chat via WhatsApp. All external credentials are configurable via UI with zero hardcoded values in the codebase. Requirements: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05.

</domain>

<decisions>
## Implementation Decisions

### Connection Setup Flow
- OAuth popup (redirect flow) for GitHub and Google — click 'Connect', authorize in popup, token saved automatically
- Meta Business verification flow for WhatsApp
- API key paste as fallback for services without OAuth support
- Dedicated Connections page in UI — top-level nav or settings sub-page with service cards, connect/disconnect buttons, status dots, last sync time
- Project-level overrides via dropdown pointing to a different workspace connection (not per-project OAuth) — leverages existing `project_connections` table
- Admin-only connection management — only admin role can add/remove/configure workspace connections. Operators and viewers can see connected services and use them via agents but cannot change credentials

### Credential Security
- AES-256-GCM encryption for all credentials and secrets (API keys, OAuth tokens, passwords) at rest
- Encryption key derived from `PORTER_SECRET` env var — decrypted only at call time, never logged or exposed
- User mandate: "all user data should be encrypted, Porter should be hack proof"
- Credentials stored in `workspace_connections.meta_json` (encrypted blob)

### Connection Failure Handling
- Auto-retry with silent token refresh on expired tokens
- If refresh fails: mark connection as 'needs_reauth', show amber status dot, notify user via SSE toast
- Agent jobs that depend on a broken connection queue with 'blocked' status until reauth

### WhatsApp Interaction Model
- One WhatsApp Business number per workspace (Meta Cloud API)
- Users can chat with specific agents and know which agent is messaging — shared number with routing
- Agent identity in messages: name prefix + emoji (e.g., '📝 Writer: Here's your draft...')
- @mention routing: '@Writer draft an email to John' routes to Writer agent. Without @mention, Porter dispatches to best agent (like normal chat)
- Project-linked group chats: a WhatsApp group can be linked to a Porter project, all project agents participate, messages in the group trigger the relevant agent

### Email Integration
- Fully autonomous — agents can send email as part of their work (e.g., Writer sends a draft to a client), plus configurable notifications (task complete, daily digest, milestone reached)
- Inbound: IMAP IDLE polling via imapflow, connect to user's existing email (Gmail, Outlook) with OAuth2, near-instant push
- Inbound routing: rule-based + AI fallback — configurable rules (e.g., 'emails from @github.com go to DevOps'), unmatched emails go to Porter for AI-based agent selection
- Outbound identity: workspace email with agent name in display name (e.g., 'Writer via Porter <team@company.com>')
- Architecture designed for future transition to per-agent addresses when email engine lands

### GitHub Integration
- Read + PR creation scope — agents can read repo contents, list issues, create branches, and open PRs
- No direct push to main — PRs require human approval
- OAuth2 via @fastify/oauth2, octokit for all API calls

### Calendar Integration
- Bidirectional sync with Google Calendar — read events into Porter, push project milestones/deadlines to Google Calendar
- Agent awareness + urgency boost — agents see upcoming deadlines in their context, closer deadlines get prioritized, deadline-approaching triggers agent activity (Phase 4 event trigger)
- Calendar display: project dashboard timeline as primary surface (integrated alongside milestones), dedicated calendar view as secondary page for full picture
- googleapis SDK for Google Calendar API

### Claude's Discretion
- Exact Connections page layout and card design
- OAuth redirect URL configuration and callback handling
- IMAP IDLE reconnection strategy
- WhatsApp webhook URL setup (public endpoint exposure)
- Calendar sync interval and conflict resolution
- Background worker queue architecture for external calls
- Hardcoding purge strategy and order of operations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Connections Infrastructure
- `porter.py` lines 752-790 — `workspace_connections`, `project_connections`, `environment_tools` table schemas
- `porter.py` lines 49415-49416 — Workspace connections API with project_connections LEFT JOIN
- `porter.py` lines 53095-53198 — Full CRUD for workspace_connections and project_connections
- `backend/src/db/schema.ts` — Drizzle schemas (needs workspace_connections/project_connections schemas added)

### Known Hardcoding Violations (CONN-05)
- `CLAUDE.md` "Known Hardcoding Violations" section — DEFAULT_MOUNTS, CONFIG_PATH, RUNTIME_DIR, AVATAR_DIR, MEMORY_DIR, HOST, PORT all hardcoded

### Research — Library Choices
- `.planning/research/STACK.md` lines 66-86 — Pre-researched library recommendations: octokit, @fastify/oauth2, nodemailer, imapflow, googleapis

### Phase 4 — Event Triggers (deadline-approaching)
- `backend/src/services/event-triggers.ts` — Existing event trigger system for deadline-approaching, usable for calendar deadline awareness

### Phase 6 — SSE Infrastructure
- `backend/src/routes/events.ts` — SSE event broadcasting for connection status changes
- `frontend/src/hooks/useSSEBus` — Frontend SSE subscription pattern for real-time connection status

### Requirements
- `.planning/REQUIREMENTS.md` — CONN-01 through CONN-05 definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `workspace_connections` table: Already has provider, kind, status, scopes_json, tools_json, meta_json columns — ready for credential storage
- `project_connections` table: Already supports project-level overrides with access_mode and connection_id FK
- `environment_tools` table: Tool detection pattern — extend for connection health checks
- `_detect_environment_tools()`: Startup detection pattern — extend for connection validation
- `emitSSE()` in scheduler.ts: Fire-and-forget SSE emission for connection status events
- `ai-router.ts`: Smart routing with backend probing — pattern for external service health checks
- `event-triggers.ts`: deadline-approaching trigger — wire calendar deadlines into this

### Established Patterns
- AES encryption: No existing pattern — new capability needed. `PORTER_SECRET` env var for key derivation
- OAuth2: No existing flow — @fastify/oauth2 is a new dependency
- Background workers: `agent_jobs` table + scheduler tick pattern — extend for external API call queuing
- Connection CRUD: porter.py has full workspace_connections CRUD — needs Fastify v1 equivalents

### Integration Points
- `backend/src/routes/v1/` — New routes for connections API, OAuth callbacks, webhook endpoints
- `backend/src/services/` — New services for github.ts, email.ts, calendar.ts, whatsapp.ts
- `backend/src/db/migrate-07.ts` — Migration for credential encryption columns, calendar sync table
- `frontend/src/modules/` — New connections module with service cards, OAuth flow, status display
- `porter.py` connection handlers — Mark deprecated once Fastify v1 equivalents land

</code_context>

<specifics>
## Specific Ideas

- "All user data should be encrypted, Porter should be hack proof" — Moe's mandate on security
- Per-agent email addresses (writer@askporter.app) — design email integration to support this transition when the email engine lands
- WhatsApp agent attribution should feel natural: '📝 Writer: Here's your draft...' — like texting a team, not a bot
- Calendar view as secondary page — project dashboard timeline is primary, but a dedicated calendar view is useful for the full picture
- GitHub PRs require human approval — agents propose, humans merge

</specifics>

<deferred>
## Deferred Ideas

- **Full email engine** — Self-hosted mail server (Forward Email / docker-mailserver + Roundcube) with per-agent addresses (writer@askporter.app). Massive infrastructure scope — own phase/milestone. Phase 7 email integration designed to transition cleanly when this lands.
- **Dedicated calendar view** — Full month/week/day calendar page. Phase 7 builds timeline integration on project dashboard; dedicated view is a follow-up enhancement.
- **Microsoft 365 Calendar** — @microsoft/microsoft-graph-client for Outlook calendar. Defer until user demand. Google Calendar covers primary use case.
- **Full GitHub write access** — Direct push to main, merge PRs, manage labels. Deferred for safety — PR-based workflow first.

</deferred>

---

*Phase: 07-external-connections*
*Context gathered: 2026-03-21*
