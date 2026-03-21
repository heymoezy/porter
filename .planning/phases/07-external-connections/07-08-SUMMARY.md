---
phase: 07-external-connections
plan: 08
subsystem: api
tags: [whatsapp, meta-cloud-api, webhooks, fastify, agent-routing, hmac]

# Dependency graph
requires:
  - phase: 07-02
    provides: "workspace_connections table with meta_json encryption, decryptCredential helper"
provides:
  - "WhatsApp Cloud API send service (graph.facebook.com/v21.0)"
  - "Inbound WhatsApp webhook at /api/v1/webhooks/whatsapp"
  - "@mention-based agent routing via agent_jobs"
  - "HMAC-SHA256 webhook signature verification"
affects:
  - 07-external-connections
  - agent-dispatch
  - inbound-message-routing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook-as-auth: no requireAuth on public webhook routes, HMAC signature is the gate"
    - "Throws on missing WHATSAPP_APP_SECRET — never silently passes with empty string fallback"
    - "Always return 200 to Meta — non-200 triggers retries and duplicate job creation"
    - "Agent identity prefix format: '{emoji} {agentName}: {message}'"
    - "@mention routing pattern: regex /@(\\w+)/, case-insensitive persona name lookup"

key-files:
  created:
    - backend/src/services/whatsapp.ts
    - backend/src/routes/v1/webhooks-whatsapp.ts
  modified:
    - backend/src/routes/v1/index.ts

key-decisions:
  - "verifyWebhookSignature throws Error('WHATSAPP_APP_SECRET env var is required') when secret missing — no empty-string fallback, ever"
  - "401 from Meta Cloud API marks connection needs_reauth + emits SSE connection:status event"
  - "routeInboundWhatsApp inserts agent_jobs with trigger_type='whatsapp_message' — no dedup window (whatsapp messages are not storms)"
  - "Porter (is_master=1) is the fallback dispatcher when no @mention matches a live agent"
  - "Webhook POST always returns 200 to Meta even on routing errors — prevents Meta retry storms"
  - "X-Hub-Signature-256 header used with timingSafeEqual to prevent timing-attack leakage"

patterns-established:
  - "Public webhook routes: no requireAuth, HMAC signature verification instead"
  - "Credential fetch pattern: query workspace_connections WHERE provider='X' AND status='connected', decrypt meta_json"

requirements-completed: [CONN-04]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 07 Plan 08: WhatsApp Bridge Summary

**WhatsApp Cloud API bridge: Meta graph.facebook.com/v21.0 send service, @mention agent routing, and HMAC-verified Fastify webhook receiver**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T16:53:29Z
- **Completed:** 2026-03-21T17:00:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- WhatsApp service module with sendWhatsAppMessage (agent identity prefix), routeInboundWhatsApp (@mention dispatch + Porter fallback), and verifyWebhookSignature (throws on missing secret)
- Fastify webhook receiver at /api/v1/webhooks/whatsapp: GET verification challenge + POST inbound message handler
- Secure-by-default: missing WHATSAPP_APP_SECRET returns 500 (not silent pass), invalid signature returns 403, always 200 to Meta on success

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WhatsApp service module** - `989dbd0` (feat)
2. **Task 2: Create WhatsApp webhook receiver route** - `2087065` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/src/services/whatsapp.ts` - sendWhatsAppMessage, routeInboundWhatsApp, verifyWebhookSignature
- `backend/src/routes/v1/webhooks-whatsapp.ts` - GET webhook verification + POST inbound handler, no requireAuth
- `backend/src/routes/v1/index.ts` - Registered webhookWhatsAppRoutes at /webhooks/whatsapp prefix

## Decisions Made
- verifyWebhookSignature throws on missing WHATSAPP_APP_SECRET — no empty-string fallback allowed (plan requirement)
- 401 from Meta API auto-marks connection needs_reauth + fires SSE notification
- Webhook POST always returns 200 to Meta — prevents Meta retry storms on routing errors
- timingSafeEqual used for HMAC comparison to prevent timing-attack leakage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in untracked files `oauth-github.ts` and `oauth-google.ts` (missing `githubOAuth2` decorator, missing `upsertConnection` function, missing `email.ts` service). These pre-date this plan and are out of scope. Logged as deferred items.

## User Setup Required

**External services require manual configuration before WhatsApp works:**

Required environment variables:
- `WHATSAPP_PHONE_NUMBER_ID` — Meta Business Dashboard -> WhatsApp -> API Setup -> Phone number ID
- `WHATSAPP_ACCESS_TOKEN` — Meta Business Dashboard -> WhatsApp -> API Setup -> Temporary or System User token
- `WHATSAPP_VERIFY_TOKEN` — Any random string; used during Meta webhook subscription
- `WHATSAPP_APP_SECRET` — Meta App Dashboard -> Settings -> Basic -> App Secret

Dashboard steps:
1. Create Meta Business app at developers.facebook.com -> My Apps -> Create App
2. Add WhatsApp product -> App Dashboard -> Add Products -> WhatsApp
3. Configure webhook URL to `{PORTER_PUBLIC_URL}/api/v1/webhooks/whatsapp`
4. Subscribe to 'messages' webhook field

## Next Phase Readiness
- WhatsApp send/receive foundation complete; agent scheduler can now dispatch jobs with trigger_type='whatsapp_message'
- Plans 07-05 through 07-10 can build on the connections/webhook pattern established here

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*
