---
phase: 11-unified-chat-and-crm-schema
plan: 05
subsystem: api
tags: [sqlite, imap, email, whatsapp, unified-messages, crm, conversations]

# Dependency graph
requires:
  - phase: 11-unified-chat-and-crm-schema
    provides: "unified conversations/messages schema (Plans 01-04), WhatsApp inbound archival pattern, CRM contacts/contact_emails tables"
provides:
  - "Email IMAP inbound archival into unified messages table before agent routing"
  - "findOrCreateEmailContact helper: auto-creates CRM contacts from unknown email senders"
  - "findOrCreateEmailConversation helper: keyed by email address as external_id, channel_type='email'"
  - "archiveOutboundMessage helper in external-dispatcher: records agent replies before dispatch"
  - "Outbound email archived with sender_type='agent' before sendEmail"
  - "Outbound WhatsApp archived with sender_type='agent' before sendWhatsAppMessage"
  - "Full bidirectional history in single conversation thread: inbound external + outbound agent"
affects:
  - "GET /api/v1/conversations/:id/messages — email and WhatsApp threads now fully populated"
  - "Phase 12+ — any consumer of conversation/message history for email or WhatsApp"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Archive-before-dispatch: outbound messages written to DB before network call, so history is consistent even on send failure"
    - "findOrCreate pattern with race-safe INSERT OR IGNORE + post-check SELECT — mirrors Plan 04 WhatsApp helpers"
    - "External ID as conversation key: email address normalised to lowercase as external_id in conversations table"

key-files:
  created: []
  modified:
    - backend/src/services/email.ts
    - backend/src/services/external-dispatcher.ts

key-decisions:
  - "Archive-before-dispatch: write to unified table BEFORE sending — ensures history is consistent even if send fails"
  - "Outbound-first conversations use scope_type='global' with NULL scope_id when no prior inbound contact exists"

patterns-established:
  - "findOrCreateEmail* helpers mirror WhatsApp helpers: normalize → lookup → transaction-create → return id"
  - "archiveOutboundMessage is private to external-dispatcher (not exported) — only the dispatcher needs it"

requirements-completed: [CHAT-04]

# Metrics
duration: 6min
completed: 2026-03-22
---

# Phase 11 Plan 05: Email Inbound + Outbound Archival Summary

**Email IMAP inbound auto-creates CRM contacts/conversations and archives messages; all outbound email and WhatsApp dispatched via external-dispatcher is written to unified table with sender_type='agent' before network dispatch**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T12:22:57Z
- **Completed:** 2026-03-22T12:29:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Inbound emails arriving via IMAP now auto-create a CRM contact + email conversation, then archive the message before any agent routing
- findOrCreateEmailContact and findOrCreateEmailConversation helpers follow identical pattern to Plan 04 WhatsApp helpers, normalizing email addresses and using INSERT OR IGNORE for race safety
- archiveOutboundMessage helper in external-dispatcher writes agent replies (email + WhatsApp) to unified table before dispatching, completing the "All outbound through unified table" locked decision from CHAT-04
- dispatchGitHub and dispatchCalendar left completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add email findOrCreate helpers and archive inbound emails in unified table** - `1af9ef2` (feat)
2. **Task 2: Archive outbound messages in unified table before dispatching via external-dispatcher.ts** - `4aaedf3` (feat)

## Files Created/Modified
- `backend/src/services/email.ts` - Added findOrCreateEmailContact, findOrCreateEmailConversation, and IMAP exists handler archival block
- `backend/src/services/external-dispatcher.ts` - Added archiveOutboundMessage helper, modified dispatchEmail and dispatchWhatsApp to call it before send

## Decisions Made
- Archive-before-dispatch chosen over archive-after: if the network send fails, the history record still exists, preventing ghost messages
- Outbound-first scenario (agent initiates contact with no prior inbound) handled by creating conversation with scope_type='global' and NULL scope_id

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc` not available in PATH; used `backend/node_modules/.bin/tsc` directly. TypeScript compilation passed cleanly with no errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CHAT-04 requirement fully satisfied: unified table now captures all inbound (WhatsApp via Plan 04, Email via this plan) and all outbound (email + WhatsApp via this plan)
- GET /api/v1/conversations/:id/messages will return complete bidirectional history for both channels
- Ready for Phase 12+ consumers of conversation history

---
*Phase: 11-unified-chat-and-crm-schema*
*Completed: 2026-03-22*
