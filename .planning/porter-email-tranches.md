# Porter Email Autonomous Tranche Plan

## Purpose

This document breaks the Porter email upgrade into autonomous execution tranches so Claude can work start-to-finish with minimal replanning.

Each tranche includes:

- goal
- why it exists
- prerequisites
- exact code areas to touch
- expected outputs
- test and verification requirements
- stop conditions
- rollback notes
- next tranche

Claude should execute tranches in order unless blocked by infrastructure.

## Global Rules

These rules apply to every tranche.

1. Do not re-argue the architecture.
   - Primary hosted mail provider is **Stalwart**.
   - Gmail is **connector/import only**.
   - Every agent gets a real mailbox under `@askporter.app`.
   - Newsletter learning is digest-first and audited.

2. Preserve backward compatibility until Tranche 9.

3. Do not delete old Gmail-based code until replacement paths are verified.

4. Every tranche must end with:
   - code complete
   - tests added or updated
   - tests run
   - a short verification summary
   - an explicit note of any blockers for the next tranche

5. If a tranche is blocked by infrastructure, stop and report it rather than guessing.

## Tranche 0: Infrastructure Readiness

### Goal

Confirm Porter can actually host and deliver email from `askporter.app`.

### Why

Without SMTP-capable hosting, the rest of the implementation cannot reach production.

### Prerequisites

- access to infra details
- DNS control for `askporter.app`

### Tasks

1. Confirm hosting provider and outbound SMTP policy.
2. Confirm whether ports `25`, `465`, and `587` are available.
3. Confirm PTR/rDNS can be set for the mail host IP.
4. Choose mail hostnames:
   - `mail.askporter.app`
   - `autoconfig.askporter.app`
   - `autodiscover.askporter.app` if needed
5. Define required DNS records:
   - `A` or `AAAA`
   - `MX`
   - `SPF`
   - `DKIM`
   - `DMARC`
   - optional `MTA-STS`
   - optional `_imap`, `_imaps`, `_submission`, `_jmap` SRV records

### Code Touch Targets

None required unless infra config is stored in repo docs.

### Outputs

- readiness decision
- chosen mail hostname
- DNS checklist
- blocker note if provider cannot support hosted email

### Verification

- provider allows outbound SMTP or you have an approved path
- DNS ownership confirmed
- PTR/rDNS control confirmed

### Stop Conditions

- provider blocks SMTP and cannot unblock
- no DNS control
- no rDNS control

### Rollback

None

### Next

Tranche 1

## Tranche 1: Mail Subsystem Foundation

### Goal

Add the new mail domain model, provider abstraction, and base routes without changing existing UI behavior.

### Why

Everything else depends on a real internal mail subsystem rather than ad hoc Gmail and `email_messages` logic.

### Prerequisites

- Tranche 0 complete or explicitly waived for local-only development

### Tasks

1. Add new schema entries to [schema.ts](/home/lobster/projects/porter/backend/src/db/schema.ts):
   - `mail_domains`
   - `mailboxes`
   - `agent_mailboxes`
   - `mail_aliases`
   - `mail_threads`
   - `mail_messages`
   - `mail_deliveries`
   - `newsletter_sources`
   - `newsletter_subscriptions`
   - `mail_learning_events`
2. Add migration file:
   - `backend/src/db/migrate-mail-v1.ts`
3. Register the migration in [index.ts](/home/lobster/projects/porter/backend/src/index.ts)
4. Add provider abstraction files:
   - `backend/src/services/mail/provider-types.ts`
   - `backend/src/services/mail/provider-interface.ts`
5. Add config entries for mail provider:
   - Stalwart base URL
   - Stalwart API key
   - mail domain defaults
6. Add skeletal routes:
   - `backend/src/routes/v1/mail.ts`
   - `backend/src/routes/v1/mail-admin.ts`
7. Register routes in [routes/v1/index.ts](/home/lobster/projects/porter/backend/src/routes/v1/index.ts)

### Code Touch Targets

- [backend/src/db/schema.ts](/home/lobster/projects/porter/backend/src/db/schema.ts)
- [backend/src/index.ts](/home/lobster/projects/porter/backend/src/index.ts)
- [backend/src/routes/v1/index.ts](/home/lobster/projects/porter/backend/src/routes/v1/index.ts)
- `backend/src/config.ts`
- new mail service files

### Outputs

- migrations compile and run
- empty mail routes exist
- config supports self-hosted mail provider

### Tests

Add:

- `backend/src/__tests__/mail-schema-smoke.test.ts`
- `backend/src/__tests__/mail-routes-empty.test.ts`

Test requirements:

- migration creates new tables
- base routes return valid envelopes

### Verification

- app boots cleanly
- migrations apply
- no existing email or auth flows regress

### Stop Conditions

- migration fails
- route registration conflicts
- schema naming collision

### Rollback

- remove route registration
- revert migration file before production application

### Next

Tranche 2

## Tranche 2: Stalwart Provider Client and Domain Management

### Goal

Integrate Stalwart as the hosted mail provider and let Porter create and inspect domain state.

### Why

Porter needs a real provider backend before mailbox identities can be provisioned.

### Prerequisites

- Tranche 1 complete
- Stalwart management API credentials available for development/staging

### Tasks

1. Implement `backend/src/services/mail/stalwart-admin-client.ts`
2. Implement provider wrapper:
   - `backend/src/services/mail/stalwart-provider.ts`
3. Add domain service:
   - `backend/src/services/mail/domain-service.ts`
4. Add admin routes:
   - `GET /api/admin/mail/config`
   - `PUT /api/admin/mail/config`
   - `GET /api/admin/mail/domains`
   - `POST /api/admin/mail/domains`
   - `GET /api/admin/mail/domains/:id/dns`
5. Persist provider results in `mail_domains`
6. Mirror DNS status in `dns_status_json`

### Code Touch Targets

- new provider files
- new admin mail routes
- config

### Outputs

- Porter can create a domain record
- Porter can fetch Stalwart DNS recommendations
- admin can inspect domain state

### Tests

Add:

- `backend/src/__tests__/stalwart-admin-client.test.ts`
- `backend/src/__tests__/mail-domains-routes.test.ts`

Test requirements:

- mock Stalwart responses
- verify domain record persistence
- verify DNS record payload shape

### Verification

- domain CRUD routes work against mocked provider
- config remains backend-only

### Stop Conditions

- Stalwart auth/API assumptions do not match real docs or staging server

### Rollback

- disable provider-backed route handlers and preserve schema

### Next

Tranche 3

## Tranche 3: Mailbox Provisioning and Agent Identity Binding

### Goal

Provision real mailboxes and bind them to Porter agents.

### Why

The fake sender list cannot be replaced until mailboxes exist as first-class entities.

### Prerequisites

- Tranche 2 complete

### Tasks

1. Implement mailbox service:
   - `backend/src/services/mail/mailbox-service.ts`
2. Implement alias service:
   - `backend/src/services/mail/alias-service.ts`
3. Add mailbox routes:
   - `GET /api/admin/mail/mailboxes`
   - `POST /api/admin/mail/mailboxes`
   - `POST /api/admin/mail/mailboxes/:id/aliases`
   - `POST /api/admin/mail/mailboxes/:id/rotate-credential`
4. Add agent identity route:
   - `GET /api/v1/mail/identities`
5. Add helper to bind existing agent/persona records to mailbox records
6. Define mailbox address generation rules from stable agent slugs

### Code Touch Targets

- new mailbox and alias services
- admin mail routes
- `backend/src/routes/v1/mail.ts`
- likely agent/persona lookup code

### Outputs

- real mailbox records
- real alias records
- mailbox-to-agent bindings
- identity API consumable by frontend

### Tests

Add:

- `backend/src/__tests__/mailbox-service.test.ts`
- `backend/src/__tests__/mail-identities.test.ts`

Test requirements:

- stable mailbox address generation
- duplicate prevention
- agent identity query correctness

### Verification

- at least one test mailbox can be created in provider and mirrored in DB
- identity API returns real data

### Stop Conditions

- agent slug stability is unclear and collisions cannot be resolved safely

### Rollback

- keep mailboxes table records; disable provisioning calls

### Next

Tranche 4

## Tranche 4: Replace Fake Sender Identities in UI

### Goal

Remove the hardcoded sender identity array and replace it with backend-provided real identities.

### Why

This is the first visible user-facing correction and validates the provisioning model.

### Prerequisites

- Tranche 3 complete

### Tasks

1. Remove hardcoded `senders` array in [email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx)
2. Fetch identities from `GET /api/v1/mail/identities`
3. Update compose sender picker
4. Show empty state if no mailboxes are provisioned
5. Preserve SMTP config panel temporarily if still needed for old flows

### Code Touch Targets

- [admin/frontend/app/routes/email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx)
- related frontend hooks if needed

### Outputs

- dynamic sender picker
- no fake addresses in UI code

### Tests

Add/update:

- UI tests for dynamic identity loading
- regression test that compose sender comes from API

### Verification

- compose UI works with real identities
- no hardcoded sender identities remain

### Stop Conditions

- identity API incomplete
- UI assumptions depend on the old sender model

### Rollback

- temporary adapter transforming identity API to old UI shape

### Next

Tranche 5

## Tranche 5: Thread and Message Storage Layer

### Goal

Implement canonical message and thread storage using the new schema.

### Why

The current `email_messages` table is not a real mailbox system.

### Prerequisites

- Tranche 4 complete

### Tasks

1. Implement:
   - `backend/src/services/mail/message-service.ts`
   - `backend/src/services/mail/thread-service.ts`
2. Add thread resolution helpers:
   - match by `References`
   - match by `In-Reply-To`
   - fallback to provider IDs
   - final fallback to canonical subject per mailbox
3. Add read routes:
   - `GET /api/v1/mail/mailboxes/:id/threads`
   - `GET /api/v1/mail/threads/:id/messages`
4. Add folder counts endpoint if needed
5. Build a migration or adapter path from `email_messages` if needed for continuity

### Code Touch Targets

- new message and thread services
- new read routes
- admin frontend read path updates

### Outputs

- real thread list
- real message detail
- folder views derived from the new schema

### Tests

Add:

- `backend/src/__tests__/mail-threading.test.ts`
- `backend/src/__tests__/mail-message-storage.test.ts`

Test requirements:

- RFC threading behavior
- per-mailbox thread isolation
- folder query correctness

### Verification

- thread list renders from `mail_threads`
- message detail renders from `mail_messages`

### Stop Conditions

- threading logic creates unacceptable collisions

### Rollback

- keep old list/detail reads while refining new API

### Next

Tranche 6

## Tranche 6: Outbound Send Pipeline

### Goal

Send real mail from hosted agent mailboxes with proper delivery and threading metadata.

### Why

Provisioned identities are not useful until Porter can send through them.

### Prerequisites

- Tranche 5 complete
- staging provider reachable

### Tasks

1. Implement outbound send in provider layer
2. Implement send orchestration:
   - `backend/src/services/mail/delivery-service.ts`
3. Add routes:
   - `POST /api/v1/mail/drafts`
   - `POST /api/v1/mail/messages/send`
   - `POST /api/v1/mail/messages/:id/reply`
4. Generate:
   - `Message-ID`
   - `In-Reply-To`
   - `References`
5. Record one `mail_messages` row for the outbound logical message
6. Record per-recipient `mail_deliveries`
7. Update admin UI compose flow to use the new send route

### Code Touch Targets

- provider send path
- delivery service
- frontend compose flow
- new API routes

### Outputs

- send from a selected mailbox identity
- delivery status tracking
- reply-safe outbound threading

### Tests

Add:

- `backend/src/__tests__/mail-send.test.ts`
- `backend/src/__tests__/mail-reply-headers.test.ts`

Test requirements:

- header generation
- delivery row creation
- send failure path handling

### Verification

- outbound send succeeds in staging
- admin UI records sent state
- reply builds into correct thread

### Stop Conditions

- provider send API assumptions wrong
- SMTP deliverability broken in infra

### Rollback

- route send requests through legacy transactional path temporarily for non-agent system emails only

### Next

Tranche 7

## Tranche 7: Inbound Sync and Hosted Mail Routing

### Goal

Ingest inbound hosted mail into Porter and route it to the correct mailbox, thread, and agent workflow.

### Why

This turns the hosted mailbox layer into an operational communications system.

### Prerequisites

- Tranche 6 complete

### Tasks

1. Implement:
   - `backend/src/services/mail/stalwart-sync.ts`
   - `backend/src/services/mail/stalwart-webhooks.ts`
2. Add webhook route:
   - `POST /api/v1/mail/webhooks/stalwart`
3. Add manual sync route:
   - `POST /api/admin/mail/sync/:mailboxId`
4. Persist inbound messages into `mail_messages`
5. Resolve mailbox from recipient
6. Resolve thread
7. Optionally mirror into Porter `conversations/messages`
8. Route to `agent_jobs` based on mailbox ownership or routing rules
9. Add dedupe using provider message id and internet message id

### Code Touch Targets

- hosted mail sync services
- webhook routes
- routing integration

### Outputs

- inbound messages appear in UI
- agent receives work from mailbox events
- duplicate webhook/sync events do not duplicate messages

### Tests

Add:

- `backend/src/__tests__/mail-inbound-sync.test.ts`
- `backend/src/__tests__/mail-deduplication.test.ts`
- `backend/src/__tests__/mail-agent-routing.test.ts`

### Verification

- inbound external email appears in mailbox
- reply thread links correctly
- agent job is created where expected

### Stop Conditions

- webhook payload format differs materially from assumptions

### Rollback

- use manual sync path while fixing webhook path

### Next

Tranche 8

## Tranche 8: Admin Mail UI Migration to Real Data

### Goal

Fully migrate the admin email page to the new mailbox/thread/message model.

### Why

At this point the backend is real. The UI should stop behaving like a local mock inbox.

### Prerequisites

- Tranche 7 complete

### Tasks

1. Replace folder list reads from old `email_messages` endpoints
2. Add mailbox switcher UI
3. Add thread list UI
4. Add message detail UI
5. Show delivery state badges for outbound items
6. Show newsletter/source badges for classified messages
7. Keep trash/archive behaviors backed by new routes

### Code Touch Targets

- [admin/frontend/app/routes/email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx)
- any related hooks/components

### Outputs

- real mailbox UI
- real thread list
- outbound and inbound status visibility

### Tests

Add/update:

- UI regression coverage for mailbox switching
- thread opening
- send/reply flow
- archive/trash flow

### Verification

- no main screen paths depend on old `email_messages` list/detail endpoints

### Stop Conditions

- frontend assumptions baked around old flat folder data

### Rollback

- adapter responses from backend mapping new data to old UI shape temporarily

### Next

Tranche 9

## Tranche 9: Newsletter Sources and Subscription System

### Goal

Introduce first-class newsletter subscriptions and digestion workflows for agent learning.

### Why

This is one of the main product goals and depends on stable hosted mail and message ingestion.

### Prerequisites

- Tranche 8 complete

### Tasks

1. Implement:
   - `backend/src/services/mail/newsletter-service.ts`
   - `backend/src/services/mail/mail-learning-service.ts`
2. Add source CRUD:
   - `GET /api/v1/mail/newsletters/sources`
   - `POST /api/v1/mail/newsletters/sources`
3. Add subscription CRUD:
   - `POST /api/v1/mail/newsletters/subscribe`
   - `POST /api/v1/mail/newsletters/unsubscribe`
   - `GET /api/v1/mail/agents/:agentId/subscriptions`
4. Add heuristics to identify newsletter-like messages
5. Add digest-generation job
6. Add `mail_learning_events` entries for every digest or learning decision

### Code Touch Targets

- newsletter and learning services
- scheduler integration if needed
- new routes

### Outputs

- newsletter sources registry
- per-agent subscriptions
- digest workflow
- audit trail

### Tests

Add:

- `backend/src/__tests__/newsletter-sources.test.ts`
- `backend/src/__tests__/newsletter-subscriptions.test.ts`
- `backend/src/__tests__/newsletter-digest.test.ts`

### Verification

- subscribed agent receives digest outputs from newsletter mail
- learning events are auditable

### Stop Conditions

- source trust model is underdefined

### Rollback

- disable digest generation while keeping source and subscription storage

### Next

Tranche 10

## Tranche 10: Safe Memory and Skill-Learning Integration

### Goal

Allow newsletters and trusted mail to influence agent knowledge in a controlled, auditable way.

### Why

This delivers the “agents learn and evolve over time” requirement without corrupting skills.

### Prerequisites

- Tranche 9 complete

### Tasks

1. Define trust policy:
   - approved sender/domain
   - topic match
   - novelty threshold
   - confidence threshold
2. Build memory candidate path:
   - newsletter digest -> summary -> memory candidate
3. Build skill-improvement suggestion path:
   - no direct skill mutation
   - produce suggestion artifacts or review queue items
4. Add admin review surfaces or storage records for suggested updates
5. Record every action in `mail_learning_events`

### Code Touch Targets

- learning services
- memory integration points
- skill suggestion storage or queue

### Outputs

- controlled learning
- reviewable skill-improvement suggestions
- auditable memory promotions

### Tests

Add:

- `backend/src/__tests__/mail-learning-policy.test.ts`
- `backend/src/__tests__/mail-memory-promotion.test.ts`

### Verification

- trusted content can produce memory candidates
- low-trust content is blocked or flagged
- no automatic direct skill rewrite occurs

### Stop Conditions

- memory interface or skill update workflow is unstable elsewhere in the app

### Rollback

- freeze outputs at digest-only

### Next

Tranche 11

## Tranche 11: Gmail Connector Refactor

### Goal

Keep Gmail support, but only as an external connector/import system.

### Why

This preserves interoperability without letting Gmail define the product architecture.

### Prerequisites

- Tranche 10 complete or at least Tranche 7 complete if this is pulled earlier

### Tasks

1. Refactor [oauth-google.ts](/home/lobster/projects/porter/backend/src/routes/v1/oauth-google.ts) into connector semantics
2. Extract Gmail-specific logic from [email.ts](/home/lobster/projects/porter/backend/src/services/email.ts)
3. Create:
   - `backend/src/services/mail/gmail-connector.ts`
4. Add connector state and mapping into `workspace_connections` or a dedicated connector mapping
5. Support mailbox import from Gmail API
6. Optionally support Gmail history/watch sync for connector mode

### Code Touch Targets

- Gmail OAuth route
- Gmail service extraction
- connector integration

### Outputs

- Gmail no longer powers core system mail
- Gmail can import or bridge external inboxes

### Tests

Add:

- `backend/src/__tests__/gmail-connector.test.ts`
- `backend/src/__tests__/gmail-import-mapping.test.ts`

### Verification

- hosted mail works without Gmail
- Gmail connector can be enabled independently

### Stop Conditions

- connector mapping design conflicts with old workspace connection assumptions

### Rollback

- keep Gmail connector disabled while preserving hosted mail core

### Next

Tranche 12

## Tranche 12: Legacy Endpoint Migration and Cleanup

### Goal

Move old email endpoints onto the new subsystem or retire them cleanly.

### Why

The old flat `email_messages` admin model should no longer be a primary runtime path.

### Prerequisites

- Tranche 11 complete

### Tasks

1. Audit all references to:
   - `email_messages`
   - `provider='email'` meaning Gmail
   - old admin email routes
2. Repoint legacy endpoints to compatibility adapters where necessary
3. Mark old routes deprecated in code comments and docs
4. Remove dead code that is provably unused

### Code Touch Targets

- [backend/src/routes/v1/admin/email.ts](/home/lobster/projects/porter/backend/src/routes/v1/admin/email.ts)
- [admin/backend/src/routes/email.ts](/home/lobster/projects/porter/admin/backend/src/routes/email.ts)
- old email service glue

### Outputs

- clear compatibility story
- reduced duplication

### Tests

Add/update compatibility tests

### Verification

- no critical UI or auth flows still depend on dead email code

### Stop Conditions

- a hidden production dependency appears

### Rollback

- leave compatibility adapter in place longer

### Next

Tranche 13

## Tranche 13: Deliverability and Ops Visibility

### Goal

Make the system operationally supportable in production.

### Why

Hosted email without diagnostics becomes a black box.

### Prerequisites

- Tranche 12 complete

### Tasks

1. Add admin surfaces for:
   - queue depth
   - deferred mail
   - bounce stats
   - DNS health
   - mailbox sync health
2. Add queue and delivery metrics endpoints
3. Add log correlation and request/event tracing where practical
4. Add operator runbook docs if repo stores them

### Code Touch Targets

- admin routes
- admin UI
- possibly scheduler/SSE/event hooks

### Outputs

- mail ops dashboard
- enough visibility to run in production

### Tests

Add lightweight route coverage and UI rendering tests

### Verification

- admin can identify failed/deferred deliveries and mailbox health issues quickly

### Stop Conditions

- provider telemetry assumptions mismatch actual deployment

### Rollback

- fall back to route-only diagnostics without UI polish

### Next

Tranche 14

## Tranche 14: Final Hardening and Production Cutover

### Goal

Cut Porter over to the hosted mail system as the default runtime.

### Why

This completes the migration from the legacy mixed email model.

### Prerequisites

- all prior tranches complete
- staging verification passed

### Tasks

1. Switch default compose/send/read flows to new mail subsystem everywhere relevant
2. Disable Gmail-as-core boot behavior
3. Validate production DNS and deliverability
4. Run final manual checklist:
   - create mailbox
   - send outbound
   - receive inbound
   - reply
   - route to agent
   - digest newsletter
   - inspect delivery telemetry
5. Document post-cutover issues and watchpoints

### Code Touch Targets

- final config flags
- boot logic in [index.ts](/home/lobster/projects/porter/backend/src/index.ts)
- old Gmail-centric service code

### Outputs

- hosted mail is the default system
- Gmail is optional and secondary

### Tests

Run full relevant backend and UI suites plus smoke checks

### Verification

- end-to-end production-like workflow succeeds

### Stop Conditions

- deliverability or inbound stability problems remain unresolved

### Rollback

- keep old non-agent transactional SMTP path available for auth emails only
- delay full cutover until deliverability stabilizes

## Autonomous Execution Prompt For Claude

Use this exact instruction:

Execute the Porter email upgrade autonomously using these planning documents:

- [porter-email-architecture.md](/home/lobster/projects/porter/.planning/porter-email-architecture.md)
- [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md)
- [porter-email-tranches.md](/home/lobster/projects/porter/.planning/porter-email-tranches.md)

Primary objective:

Transform Porter into a self-hosted first-party email platform for `@askporter.app`, with one real mailbox per agent, hosted mail as the primary system, Gmail as connector/import only, and newsletter digestion as a controlled learning pipeline.

Execution rules:

1. Work through tranches in order.
2. Stop only for true blockers, especially infrastructure blockers from Tranche 0.
3. At the end of every tranche provide:
   - changed files
   - tests added
   - tests run
   - verification result
   - next tranche
4. Do not re-plan the architecture unless implementation proves a documented assumption false.
5. Do not remove legacy paths until replacement paths are verified.

Non-negotiable decisions:

1. Stalwart is the hosted mail provider.
2. Gmail is not the primary runtime backend.
3. Real agent mailboxes replace fake sender identities.
4. Newsletter learning is digest-first and audited.

Start with Tranche 0 if infra details are available. Otherwise start with Tranche 1 and explicitly mark Tranche 0 as pending production readiness.

## Suggested Claude Stop/Report Format

At the end of each tranche, Claude should report in this format:

### Completed

- tranche number and name
- short result summary

### Changed Files

- absolute or repo-relative file list

### Verification

- tests added
- tests run
- manual verification performed

### Risks

- unresolved issues

### Next

- next tranche name

## Final Note

If Claude must choose where to stop for a session, the best stable checkpoints are:

- after Tranche 1
- after Tranche 3
- after Tranche 5
- after Tranche 7
- after Tranche 9
- after Tranche 14
