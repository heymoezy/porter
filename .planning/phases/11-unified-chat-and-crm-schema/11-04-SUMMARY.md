---
phase: 11-unified-chat-and-crm-schema
plan: "04"
subsystem: api
tags: [whatsapp, webhooks, crm, conversations, messages, sqlite]

# Dependency graph
requires:
  - phase: 11-unified-chat-and-crm-schema
    provides: contacts, contact_phones, conversations, messages, contact_conversations tables from Phase 11 schema migration
  - phase: 11-01
    provides: unified schema migration (conversations, messages, contacts, contact_phones, contact_conversations tables)
  - phase: 11-02
    provides: GET /api/v1/conversations/:id/messages endpoint for reading unified messages
provides:
  - WhatsApp inbound messages archived in unified messages table before agent routing
  - CRM contacts auto-created from unknown phone numbers with normalized E.164 format
  - Conversations auto-created keyed by phone number as external_id
  - findOrCreateWhatsAppContact and findOrCreateWhatsAppConversation exported from whatsapp service
affects: [11-05, email-inbound-archival, outbound-message-archival]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "findOrCreate with INSERT OR IGNORE + post-insert SELECT for race-safe conversation creation"
    - "Phone normalization: strip leading zeros, ensure + prefix"
    - "Archive BEFORE routing: unified table write happens before agent_jobs insert"
    - "contact_conversations link maintained on both create and find paths"

key-files:
  created: []
  modified:
    - backend/src/services/whatsapp.ts
    - backend/src/routes/v1/webhooks-whatsapp.ts

key-decisions:
  - "Archive message BEFORE calling routeInboundWhatsApp so DB write cannot be skipped by routing errors"
  - "Use INSERT OR IGNORE + post-insert SELECT (not upsert) to handle concurrent messages from same sender without duplicate conversations"
  - "externalId for WhatsApp conversations = phone number (from field), not Meta message ID, so all messages from a contact share one conversation"
  - "sender_type='external' for inbound WhatsApp messages (not 'user' or 'agent')"
  - "Removed unused crypto import from webhooks-whatsapp.ts — only needed in whatsapp.ts service"

patterns-established:
  - "External channel archival pattern: findOrCreateContact → findOrCreateConversation → INSERT message → UPDATE conversation.updated_at → route to agent"
  - "Phone normalization: strip leading zeros, prepend + if missing"

requirements-completed: [CHAT-04]

# Metrics
duration: 2min
completed: "2026-03-22"
---

# Phase 11 Plan 04: WhatsApp Unified Table Archival Summary

**WhatsApp inbound webhook archives messages into unified conversations/messages table with auto-created CRM contacts before routing to agent**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T12:22:49Z
- **Completed:** 2026-03-22T12:25:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `findOrCreateWhatsAppContact` to whatsapp service: normalizes phone to E.164, looks up contact_phones, creates contact + phone row if unknown
- Added `findOrCreateWhatsAppConversation` to whatsapp service: race-safe create via INSERT OR IGNORE + post-insert SELECT, links contact_conversations on both paths
- Updated WhatsApp webhook POST handler to archive inbound messages into unified `messages` table (sender_type='external', channel_type='whatsapp', channel_metadata=raw Meta payload JSON) before calling `routeInboundWhatsApp`

## Task Commits

1. **Task 1: Add findOrCreate helpers to whatsapp.ts service** - `e5331e9` (feat)
2. **Task 2: Wire WhatsApp webhook to archive messages in unified table** - `6f8b784` (feat)

**Plan metadata:** (included in this docs commit)

## Files Created/Modified

- `backend/src/services/whatsapp.ts` - Added `findOrCreateWhatsAppContact` and `findOrCreateWhatsAppConversation` exported functions; existing `routeInboundWhatsApp` and `verifyWebhookSignature` unchanged
- `backend/src/routes/v1/webhooks-whatsapp.ts` - Added sqlite import + findOrCreate imports; updated POST handler to archive message in unified table before routing

## Decisions Made

- Archive BEFORE routing: unified table write happens synchronously before agent_jobs insert, so a routing failure cannot result in unarchived messages
- Conversation external_id = phone number (not Meta message ID): all messages from one phone number share a single conversation
- Race condition handling: INSERT OR IGNORE + post-insert SELECT avoids duplicates when two concurrent messages arrive from the same sender
- Removed unused `crypto` import from webhooks-whatsapp.ts after the plan specified it but it wasn't needed in that file directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed unused crypto import from webhooks-whatsapp.ts**
- **Found during:** Task 2 verification
- **Issue:** Plan specified `import crypto from 'crypto'` in the webhook file but crypto is not used directly there (only in the service)
- **Fix:** Removed the unused import to keep the file clean; TypeScript compilation confirmed clean without it
- **Files modified:** backend/src/routes/v1/webhooks-whatsapp.ts
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** 6f8b784 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 code cleanliness)
**Impact on plan:** Minor cleanup, no behavior change. All acceptance criteria met.

## Issues Encountered

None - both tasks executed cleanly. TypeScript compilation passed with zero errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WhatsApp inbound archival complete; GET /api/v1/conversations/:id/messages already returns messages by channel_type
- Ready for Plan 11-05: email inbound archival and outbound message archival for both channels
- Second inbound message from same phone number will reuse existing contact and conversation (verified via INSERT OR IGNORE logic)

---
*Phase: 11-unified-chat-and-crm-schema*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: backend/src/services/whatsapp.ts
- FOUND: backend/src/routes/v1/webhooks-whatsapp.ts
- FOUND: .planning/phases/11-unified-chat-and-crm-schema/11-04-SUMMARY.md
- FOUND commit: e5331e9 (Task 1: findOrCreate helpers)
- FOUND commit: 6f8b784 (Task 2: webhook archival wiring)
- FOUND commit: a672905 (docs: plan summary)
