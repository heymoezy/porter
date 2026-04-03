# Porter Email Execution Plan

## Intent

This document is the execution-grade plan for upgrading Porter into a real email platform.

It is written so Claude can execute with minimal product ambiguity.

It covers:

- current code inventory
- chosen technical direction
- required infrastructure
- schema and API design
- backend and frontend implementation order
- tests
- rollout and verification
- Claude execution prompts

## Executive Summary

Porter currently has three partial email systems:

1. A Gmail-specific inbound/outbound service in [backend/src/services/email.ts](/home/lobster/projects/porter/backend/src/services/email.ts)
2. A generic SMTP-based transactional sender in [backend/src/services/transactional-email.ts](/home/lobster/projects/porter/backend/src/services/transactional-email.ts)
3. A mailbox-like admin UI over a flat `email_messages` table in [admin/frontend/app/routes/email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx)

This is not yet a real hosted mail platform.

The correct direction is:

- self-host `@askporter.app`
- give every agent its own mailbox
- make Porter the control plane
- use **Stalwart Mail** as the infrastructure layer
- treat Gmail as an optional external connector or import path only

The implementation should be done in controlled waves, not as a single rewrite.

## Current Code Inventory

### Current outbound mail

[backend/src/services/transactional-email.ts](/home/lobster/projects/porter/backend/src/services/transactional-email.ts)

What it does:

- loads `smtp_*` settings from `workspace_settings` or env
- initializes a Nodemailer transport
- sends verification, reset, invite, and drip emails

What it does not do:

- per-agent sender identity
- threaded replies
- delivery state tracking
- mailbox ownership
- bounce/deferred visibility

### Current Gmail-specific mail service

[backend/src/services/email.ts](/home/lobster/projects/porter/backend/src/services/email.ts)

What it does:

- reads one connected `provider='email'` connection from `workspace_connections`
- sends via Gmail OAuth2 + Nodemailer
- listens to one Gmail inbox via IMAP IDLE
- archives inbound mail into conversations/messages
- creates `agent_jobs` from inbound messages

Problems:

- hard-coded Gmail dependency
- single shared mailbox assumption
- one IMAP client for one account
- no first-class mailbox model
- no delivery state model
- no true thread model

### Current Google OAuth flow

[backend/src/routes/v1/oauth-google.ts](/home/lobster/projects/porter/backend/src/routes/v1/oauth-google.ts)

What it does:

- requests Gmail + Calendar scopes
- stores OAuth tokens in `workspace_connections`
- creates shared `provider='email'` and `provider='google_calendar'` records
- auto-starts IMAP IDLE

Problems:

- conflates external connector with core email platform
- assumes Gmail is the canonical inbox

### Current admin email API

[backend/src/routes/v1/admin/email.ts](/home/lobster/projects/porter/backend/src/routes/v1/admin/email.ts)

What it does:

- stores SMTP config
- CRUD for `email_messages`
- draft/sent/trash mailbox-like behavior

Problems:

- `POST /messages` records a message row but does not integrate with the hosted mailbox architecture
- mailbox folders are app-side abstractions, not synced mailbox state
- no per-mailbox permission or thread ownership model

### Current admin email UI

[admin/frontend/app/routes/email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx)

What it does:

- shows folder counts from `email_messages`
- has a compose view
- uses hardcoded sender identities like `growth@askporter.app`

Problems:

- fake sender identities
- no mailbox switcher
- no real threads
- no real sync state
- no delivery diagnostics

### Current schema limits

[backend/src/db/schema.ts](/home/lobster/projects/porter/backend/src/db/schema.ts#L609)

`email_messages` is too flat for:

- mailbox ownership
- folder sync
- external provider message IDs
- inbound vs outbound state
- attachments
- per-recipient delivery attempts
- real threading
- newsletter subscriptions

## External Research Findings

### Recommended infrastructure stack: Stalwart

Why:

- official Docker install includes SMTP, IMAP, JMAP, and admin endpoints
- management API supports principal creation and updates
- API can generate DNS records for domains
- supports autoconfig/autodiscover and quotas

Relevant Stalwart sources:

- Docker install docs: https://stalw.art/docs/install/platform/docker/
- Management API endpoints: https://stalw.art/docs/api/management/endpoints/
- API keys for management API: https://stalw.art/docs/auth/principals/api-key/
- Internal directory/account management: https://stalw.art/docs/install/directory
- Autoconfig/autodiscover: https://stalw.art/docs/server/autoconfig/

Specific evidence:

- Stalwart documents `POST /principal` and `PATCH /principal/{principal_id}` for principal creation and updates.
- Stalwart documents `GET /dns/records/{domain}` to retrieve required DNS records.
- Stalwart supports internal account directories and quotas.

### Alternatives

mailcow:

- mature and feature-rich
- good operational UI
- heavier and less API-first for Porter’s provisioning use case
- docs: https://docs.mailcow.email/

Docker Mailserver:

- battle-tested
- account management is more config/script oriented than API-first
- docs: https://docker-mailserver.github.io/docker-mailserver/latest/

maddy:

- elegant and lightweight
- less attractive for this product shape than Stalwart’s integrated management model
- docs: https://maddy.email/

### Gmail should be external only

Official Gmail docs show:

- send uses `messages.send` or `drafts.send`
- threading requires matching `Subject`, `References`, and `In-Reply-To`
- push notifications require Cloud Pub/Sub and renewal at least every 7 days

Relevant sources:

- send guide: https://developers.google.com/workspace/gmail/api/guides/sending
- push guide: https://developers.google.com/workspace/gmail/api/guides/push
- watch method: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- alias management: https://developers.google.com/workspace/gmail/api/guides/alias_and_signature_settings

Conclusion:

- Gmail can work as a connector
- Gmail MCP is not the right primary architecture for Porter-owned mail
- direct Gmail API is the right integration if Gmail import/bridge remains

### Hosting constraint

Self-hosted mail is only viable if the hosting network allows outbound SMTP.

Important evidence:

- DigitalOcean blocks SMTP ports `25`, `465`, and `587` on Droplets by default as of March 18, 2026.
- AWS EC2 restricts port 25 by default.

Relevant sources:

- DigitalOcean: https://docs.digitalocean.com/support/why-is-smtp-blocked/
- AWS SES SMTP connectivity notes: https://docs.aws.amazon.com/ses/latest/dg/smtp-connect.html

Conclusion:

- before coding, verify hosting viability for real outbound SMTP
- if the current VPS provider blocks mail, infrastructure must move or be reconfigured first

## Scope Definition

### In scope for this initiative

- first-party hosted mail on `askporter.app`
- one mailbox per agent
- real send and receive flows
- admin UI backed by real mailbox data
- newsletter subscription and digest pipeline
- safe learning interface for agents and skills
- external Gmail import/connector path

### Out of scope for initial ship

- consumer-grade universal webmail features
- Outlook/Exchange parity
- full mailing list product
- uncontrolled auto-mutation of skill prompts from newsletters

## Target System Model

### Layer 1: Hosted mail infrastructure

Runs outside Porter app code:

- Stalwart container
- persistent storage
- TLS certs
- DNS records
- DKIM signing
- queueing and SMTP delivery
- IMAP/JMAP endpoints

### Layer 2: Porter mail control plane

Runs in Porter backend:

- domain lifecycle tracking
- mailbox lifecycle tracking
- alias lifecycle tracking
- mailbox-to-agent mapping
- sync and webhooks
- message persistence
- delivery status mirror
- subscription system
- outbound policies

### Layer 3: Porter intelligence layer

Runs in Porter scheduler/agents:

- inbound routing to agents
- newsletter classification
- digests
- memory candidate extraction
- skill learning candidates

## Proposed Schema

Do not extend only `email_messages`. Add a proper mail subsystem.

### 1. `mail_domains`

Purpose:

- one record per owned mail domain
- operational status and DNS metadata

Columns:

- `id text primary key`
- `domain text unique not null`
- `provider text not null default 'stalwart'`
- `status text not null default 'pending_dns'`
- `is_primary integer not null default 0`
- `dkim_selector text`
- `dkim_public_key text`
- `return_path_domain text`
- `dns_last_checked_at double precision`
- `dns_status_json jsonb default '{}'`
- `created_at double precision`
- `updated_at double precision`

### 2. `mailboxes`

Purpose:

- one record per mailbox identity

Columns:

- `id text primary key`
- `domain_id text not null`
- `provider_mailbox_id text`
- `address text unique not null`
- `local_part text not null`
- `display_name text not null default ''`
- `mailbox_type text not null default 'agent'`
- `status text not null default 'active'`
- `auth_type text not null default 'managed_password'`
- `secret_ref text`
- `quota_bytes bigint default 0`
- `last_sync_at double precision`
- `last_error text`
- `created_at double precision`
- `updated_at double precision`

Notes:

- `secret_ref` should point to encrypted credentials or generated passwords, not plaintext

### 3. `agent_mailboxes`

Purpose:

- connect agents to mailbox identities

Columns:

- `agent_id text not null`
- `mailbox_id text not null`
- `role text not null default 'primary'`
- `created_at double precision`

Composite unique:

- `(agent_id, mailbox_id)`

### 4. `mail_aliases`

Purpose:

- alternate receive/send-as addresses

Columns:

- `id text primary key`
- `mailbox_id text not null`
- `alias_address text unique not null`
- `receive_enabled integer not null default 1`
- `send_as_enabled integer not null default 1`
- `created_at double precision`
- `updated_at double precision`

### 5. `mail_threads`

Purpose:

- app-level normalized threads per mailbox

Columns:

- `id text primary key`
- `mailbox_id text not null`
- `provider_thread_id text`
- `conversation_id text`
- `subject_canonical text not null default ''`
- `last_message_at double precision`
- `message_count integer not null default 0`
- `participants_json jsonb default '[]'`
- `created_at double precision`
- `updated_at double precision`

### 6. `mail_messages`

Purpose:

- canonical inbound/outbound message store

Columns:

- `id text primary key`
- `mailbox_id text not null`
- `thread_id text`
- `provider_message_id text`
- `internet_message_id text`
- `in_reply_to text`
- `references_header text`
- `direction text not null`
- `folder text not null`
- `status text not null`
- `from_address text not null`
- `from_name text not null default ''`
- `to_addresses_json jsonb default '[]'`
- `cc_addresses_json jsonb default '[]'`
- `bcc_addresses_json jsonb default '[]'`
- `reply_to_addresses_json jsonb default '[]'`
- `subject text not null default ''`
- `snippet text not null default ''`
- `text_body text not null default ''`
- `html_body text not null default ''`
- `headers_json jsonb default '{}'`
- `attachments_json jsonb default '[]'`
- `provider_raw_ref text`
- `received_at double precision`
- `sent_at double precision`
- `read_at double precision`
- `created_at double precision`
- `updated_at double precision`

Indexes:

- `mailbox_id + folder + updated_at desc`
- `thread_id + created_at`
- `internet_message_id`
- `provider_message_id`

### 7. `mail_deliveries`

Purpose:

- delivery attempts and final status mirror

Columns:

- `id text primary key`
- `message_id text not null`
- `recipient text not null`
- `attempt integer not null default 1`
- `status text not null`
- `smtp_response text`
- `remote_mx text`
- `queued_at double precision`
- `completed_at double precision`
- `created_at double precision`

### 8. `newsletter_sources`

Purpose:

- approved newsletter sender/source registry

Columns:

- `id text primary key`
- `mailbox_id text`
- `source_type text not null`
- `source_key text not null`
- `sender_pattern text`
- `display_name text not null default ''`
- `trust_level text not null default 'review'`
- `topic_tags_json jsonb default '[]'`
- `metadata_json jsonb default '{}'`
- `active integer not null default 1`
- `created_at double precision`
- `updated_at double precision`

### 9. `newsletter_subscriptions`

Purpose:

- which agents subscribe to which sources

Columns:

- `id text primary key`
- `agent_id text not null`
- `mailbox_id text not null`
- `source_id text not null`
- `status text not null default 'active'`
- `delivery_mode text not null default 'digest'`
- `last_received_at double precision`
- `last_processed_at double precision`
- `created_at double precision`
- `updated_at double precision`

### 10. `mail_learning_events`

Purpose:

- auditable learning pipeline

Columns:

- `id text primary key`
- `message_id text not null`
- `agent_id text`
- `skill_id text`
- `event_type text not null`
- `payload_json jsonb default '{}'`
- `created_at double precision`

## Backward Compatibility Strategy

Do not rip out old email code on day one.

Use this migration posture:

### Stage A

- add new schema
- keep old `email_messages` paths intact
- add new services side-by-side

### Stage B

- switch UI reads to new APIs
- keep old admin routes only for compatibility or test fixtures

### Stage C

- stop using Gmail-as-core code path
- preserve Gmail import connector

### Stage D

- deprecate old `email_messages` mailbox semantics

## Backend Architecture Plan

Create a dedicated mail subsystem.

### New backend module layout

Recommended new files:

- `backend/src/services/mail/provider-types.ts`
- `backend/src/services/mail/provider-interface.ts`
- `backend/src/services/mail/stalwart-admin-client.ts`
- `backend/src/services/mail/stalwart-sync.ts`
- `backend/src/services/mail/stalwart-webhooks.ts`
- `backend/src/services/mail/mailbox-service.ts`
- `backend/src/services/mail/message-service.ts`
- `backend/src/services/mail/thread-service.ts`
- `backend/src/services/mail/delivery-service.ts`
- `backend/src/services/mail/newsletter-service.ts`
- `backend/src/services/mail/mail-learning-service.ts`
- `backend/src/services/mail/gmail-connector.ts`
- `backend/src/routes/v1/mail.ts`
- `backend/src/routes/v1/mail-admin.ts`
- `backend/src/db/migrate-mail-v1.ts`

### Provider interface

Define a provider abstraction:

```ts
export interface MailProvider {
  createDomain(input: CreateDomainInput): Promise<CreateDomainResult>
  getDomainDnsRecords(domain: string): Promise<DnsRecord[]>
  createMailbox(input: CreateMailboxInput): Promise<CreateMailboxResult>
  updateMailbox(input: UpdateMailboxInput): Promise<void>
  createAlias(input: CreateAliasInput): Promise<CreateAliasResult>
  deleteAlias(aliasAddress: string): Promise<void>
  generateMailboxCredential(mailboxAddress: string): Promise<MailboxCredentialResult>
  syncMailbox(input: SyncMailboxInput): Promise<SyncMailboxResult>
  sendMessage(input: ProviderSendMessageInput): Promise<ProviderSendMessageResult>
}
```

First implementation:

- `StalwartMailProvider`

Secondary optional implementation:

- `GmailConnectorProvider` for import/bridge only

### Stalwart admin client

Responsibilities:

- authenticate using a Stalwart management API key
- create domain principals
- create individual principals
- patch email aliases and secrets
- request DKIM DNS material if needed
- fetch DNS records for domain verification
- inspect queue status for admin diagnostics

Expected source grounding:

- Stalwart management API documents `POST /principal`, `PATCH /principal/{principal_id}`, and `GET /dns/records/{domain}`

### Mailbox service

Responsibilities:

- create/update/deactivate mailboxes in DB
- provision against provider
- bind mailbox to agent
- expose sender identities to frontend

### Message service

Responsibilities:

- create drafts
- send outbound
- persist inbound and outbound
- normalize recipients
- attach RFC identifiers

### Thread service

Responsibilities:

- canonicalize subject
- resolve threads using:
  - `References`
  - `In-Reply-To`
  - provider IDs
  - canonicalized subject fallback
- connect thread to Porter conversation if needed

### Delivery service

Responsibilities:

- record queued/sent/delivered/deferred/bounced states
- surface admin metrics
- store per-recipient attempt data

### Newsletter service

Responsibilities:

- detect newsletter candidates
- manage subscriptions
- build digests
- maintain source reputation and trust policies

### Gmail connector

Responsibilities:

- import mailbox contents
- sync Gmail updates via API when explicit connector is used
- support Gmail watch + history model if connector mode is enabled

Do not:

- use Gmail as system mailbox runtime

## Route Plan

### New admin routes

Under `/api/admin/mail`:

- `GET /config`
- `PUT /config`
- `GET /domains`
- `POST /domains`
- `GET /domains/:id/dns`
- `GET /mailboxes`
- `POST /mailboxes`
- `POST /mailboxes/:id/aliases`
- `POST /mailboxes/:id/rotate-credential`
- `GET /queue`
- `GET /deliveries`
- `POST /sync/:mailboxId`

### New product routes

Under `/api/v1/mail`:

- `GET /identities`
- `GET /mailboxes`
- `GET /mailboxes/:id/folders`
- `GET /mailboxes/:id/threads`
- `GET /threads/:id/messages`
- `POST /drafts`
- `POST /messages/send`
- `POST /messages/:id/reply`
- `POST /messages/:id/archive`
- `POST /messages/:id/trash`
- `POST /webhooks/stalwart`
- `GET /newsletters/sources`
- `POST /newsletters/sources`
- `POST /newsletters/subscribe`
- `POST /newsletters/unsubscribe`
- `GET /agents/:agentId/subscriptions`

### Compatibility route handling

Keep `/api/admin/email/*` operational during migration, but gradually re-point it to new services.

Migration target:

- old routes become thin adapters around the new mail subsystem

## Frontend Plan

### Replace fake sender list

Current hardcoded array in [admin/frontend/app/routes/email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx) must be removed.

Replace with:

- `GET /api/v1/mail/identities`
- identities derived from `agent_mailboxes`

Each identity should include:

- `mailbox_id`
- `address`
- `display_name`
- `agent_id`
- `agent_name`
- `role`
- `is_primary`

### New UI model

The admin email page should move to:

1. left sidebar:
   - mailbox selector
   - folder counts
   - compose button
2. center:
   - thread list
3. right:
   - thread detail
4. admin overlays:
   - DNS health
   - queue state
   - bounce/deferred diagnostics

### Message list behavior

Thread list rows should show:

- sender
- subject
- latest snippet
- unread state
- newsletter badge if applicable
- delivery state for outbound rows

### Compose behavior

Compose UI should support:

- identity selection from real mailboxes
- to/cc/bcc
- subject
- HTML/plaintext body
- reply and forward flows
- attachments later if not first wave

## Security and Credential Rules

### Never expose provider secrets to frontend

Stalwart API keys, mailbox credentials, and connector secrets stay backend-only.

### Mailbox credentials

If Porter manages mailbox passwords/app passwords:

- generate server-side
- encrypt before storage
- expose only one-time reveal if necessary
- prefer secret references over plaintext

### Newsletter learning controls

Do not let raw newsletter ingestion directly rewrite skills.

Use:

- approved sender registry
- trust levels
- digest stage
- audit trail in `mail_learning_events`

## Wave-by-Wave Execution Plan

## Wave 0: Infra viability check

Goal:

- prove the hosting environment can run a real mail server

Tasks:

1. Confirm current hosting provider and network policy.
2. Test whether outbound SMTP on required ports is permitted.
3. Confirm PTR/rDNS control.
4. Confirm DNS control for `askporter.app`.
5. Decide final hostnames:
   - `mail.askporter.app`
   - optional `autoconfig.askporter.app`
   - optional `autodiscover.askporter.app`

Deliverables:

- infra readiness decision
- hostname and DNS plan

Blocker conditions:

- provider blocks outbound SMTP and cannot unblock
- no PTR/rDNS control

## Wave 1: Mail provider abstraction and schema foundation

Goal:

- create new mail subsystem without breaking current flows

Tasks:

1. Add new migration and schema definitions.
2. Add provider interfaces.
3. Add config settings for Stalwart endpoint and API key.
4. Add `mail-admin` routes for provider config and domain/mailbox listing.

Files likely touched:

- [backend/src/db/schema.ts](/home/lobster/projects/porter/backend/src/db/schema.ts)
- `backend/src/db/migrate-mail-v1.ts`
- [backend/src/routes/v1/index.ts](/home/lobster/projects/porter/backend/src/routes/v1/index.ts)
- `backend/src/routes/v1/mail.ts`
- `backend/src/routes/v1/mail-admin.ts`
- `backend/src/config.ts`

Acceptance:

- migrations run cleanly
- new tables exist
- admin routes return empty but valid payloads

## Wave 2: Stalwart integration and domain provisioning

Goal:

- Porter can create and track domains and mailboxes against Stalwart

Tasks:

1. Implement `StalwartAdminClient`.
2. Add domain provisioning workflow.
3. Add DNS-record retrieval and status mirror.
4. Add mailbox provisioning workflow.
5. Add alias creation workflow.

Files likely added:

- `backend/src/services/mail/stalwart-admin-client.ts`
- `backend/src/services/mail/mailbox-service.ts`

Acceptance:

- Porter can create `askporter.app` domain record
- Porter can fetch Stalwart DNS record recommendations
- Porter can provision a test mailbox

## Wave 3: Identity model and UI sender replacement

Goal:

- remove fake sender identities from UI

Tasks:

1. Add identity query endpoint.
2. Bind existing agents to mailboxes.
3. Replace hardcoded `senders` array in [email.tsx](/home/lobster/projects/porter/admin/frontend/app/routes/email.tsx)
4. Show live mailbox identities in compose UI.

Acceptance:

- compose sender picker is fully dynamic
- no hardcoded agent email identities remain

## Wave 4: Real message/thread storage

Goal:

- move from flat `email_messages` to real mailbox/thread/message model

Tasks:

1. Implement thread resolution service.
2. Implement message persistence service.
3. Add `GET /mailboxes/:id/threads` and `GET /threads/:id/messages`.
4. Rewire admin UI list/detail screens to new APIs.

Acceptance:

- thread list loads from `mail_threads`
- message detail loads from `mail_messages`
- thread grouping works for replies

## Wave 5: Real outbound sending

Goal:

- Porter sends as real hosted mailbox identities

Tasks:

1. Implement outbound draft/send flow.
2. Generate RFC-compliant headers:
   - `Message-ID`
   - `In-Reply-To`
   - `References`
3. Persist send attempts and delivery state.
4. Connect compose UI send button to the new send route.

Acceptance:

- sending from selected agent mailbox works
- outbound row appears in thread
- delivery state is recorded

## Wave 6: Inbound sync and routing

Goal:

- Porter ingests real inbound mail and routes it correctly

Tasks:

1. Implement Stalwart webhook/sync adapter.
2. Persist inbound messages into `mail_messages`.
3. Link to `mail_threads`.
4. Continue conversation archival into Porter’s `conversations/messages` if desired.
5. Trigger agent jobs based on mailbox ownership, rules, or system routing.

Acceptance:

- inbound mail appears in mailbox/thread UI
- agent routing fires
- duplicate ingestion is prevented

## Wave 7: Newsletter subscriptions and digest pipeline

Goal:

- first safe learning layer

Tasks:

1. Build `newsletter_sources` CRUD.
2. Build subscription CRUD.
3. Add newsletter detection heuristics.
4. Add digest generator job.
5. Add learning-event audit trail.

Acceptance:

- agent can subscribe to approved newsletter sender/source
- incoming newsletter mail is labeled and routed into a digest workflow
- no direct skill rewriting yet

## Wave 8: Gmail connector/import

Goal:

- preserve optional Gmail interoperability without making it core

Tasks:

1. Refactor current Google OAuth email logic into connector mode.
2. Add Gmail import path using Gmail API.
3. Add connector-specific watch/history sync if needed.

Acceptance:

- Gmail connector exists separately from hosted mail
- core system works without Gmail

## Wave 9: Deprecation cleanup

Goal:

- remove obsolete assumptions

Tasks:

1. Audit all references to `provider='email'` meaning Gmail.
2. Reduce or remove old IMAP IDLE core boot behavior.
3. Move old `/api/admin/email` endpoints behind compatibility shims or deprecate them.

Acceptance:

- no core flows rely on Gmail
- legacy paths are documented or removed

## Exact Claude Execution Guidance

Claude should not attempt all waves in one shot.

Recommended execution order:

1. Wave 1
2. Wave 2
3. Wave 3
4. Wave 4
5. Wave 5
6. Wave 6
7. Wave 7
8. Wave 8
9. Wave 9

Each wave should end with:

- code changes
- tests
- verification note
- explicit list of untouched future concerns

## Testing Plan

There are currently no meaningful email subsystem tests. Add them as the subsystem is built.

### Unit tests

Add tests for:

- sender identity resolution
- thread matching logic
- subject canonicalization
- newsletter detection
- trust policy decisions
- Gmail connector state transitions

Suggested files:

- `backend/src/__tests__/mail-threading.test.ts`
- `backend/src/__tests__/mail-identities.test.ts`
- `backend/src/__tests__/mail-provider-stalwart.test.ts`
- `backend/src/__tests__/newsletter-routing.test.ts`
- `backend/src/__tests__/gmail-connector.test.ts`

### Integration tests

Add tests for:

- mailbox provisioning route
- dynamic sender identity API
- send message route
- inbound sync route
- newsletter subscription routes

### UI tests

Update UI regression coverage to include:

- dynamic sender picker
- mailbox/thread loading
- compose and send flow

### Manual smoke checklist

1. Create domain record.
2. Provision `porter@askporter.app`.
3. Provision one agent mailbox.
4. Send outbound to an external mailbox.
5. Receive reply.
6. Confirm thread stitching.
7. Subscribe agent mailbox to one newsletter.
8. Confirm digest generation.

## Operational Rollout Plan

### Pre-production

- deploy Stalwart to staging
- provision staging domain if possible
- run deliverability checks

### Production launch gate

Do not launch until:

- SPF, DKIM, DMARC are valid
- PTR/rDNS is valid
- inbound and outbound succeed
- sender identity UI is dynamic
- bounce/deferred diagnostics are visible

### Post-launch monitoring

Watch:

- queue size
- deferred deliveries
- bounce rate
- spam placement feedback
- newsletter ingestion volume
- sync latency

## Decisions Claude Should Not Re-litigate

These are fixed unless the user explicitly changes them:

1. Core hosted-mail provider should be **Stalwart**.
2. Gmail is an **optional external connector**, not the core system.
3. Each agent gets its own mailbox at `@askporter.app`.
4. Newsletter ingestion must be **controlled and auditable**.
5. Do not directly mutate skills from newsletters in the first implementation.
6. The current hardcoded sender list must be removed.

## Master Claude Prompt

Use this prompt when handing the work to Claude:

Implement the Porter email platform upgrade described in:

- [porter-email-architecture.md](/home/lobster/projects/porter/.planning/porter-email-architecture.md)
- [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md)

What this is for:

Porter must become the control plane for a real self-hosted `@askporter.app` email system. Every agent needs its own real mailbox like `<agent_slug>@askporter.app`. Gmail must stop being the primary dependency and instead become an optional connector/import path. Porter must provision mailboxes, send and receive mail for them, sync threads into Porter, and support newsletter subscriptions as a safe learning source.

Non-negotiable decisions:

1. Use Stalwart as the primary hosted-mail provider.
2. Keep Gmail only as an optional connector/import path.
3. Replace the fake admin email identities with real mailbox-backed agent identities.
4. Build the new schema and mail subsystem instead of stretching `email_messages`.
5. Newsletter learning must be digest-first and auditable, not direct skill mutation.

Execution instructions:

1. Start with Wave 1 from the execution plan.
2. Do not skip tests.
3. Do not attempt later waves before earlier ones are functionally complete.
4. Keep backward compatibility where practical during migration.
5. At the end of each wave, provide:
   - changed files
   - tests run
   - open risks
   - next recommended wave

## Wave-Specific Claude Prompts

### Prompt for Wave 1

Implement Wave 1 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): add the new mail schema, provider abstraction, base mail routes, and config plumbing without changing existing UI behavior yet.

### Prompt for Wave 2

Implement Wave 2 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): integrate Stalwart provisioning, domain management, mailbox creation, alias creation, and DNS retrieval.

### Prompt for Wave 3

Implement Wave 3 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): replace the fake sender identities in the admin email UI with live agent mailbox identities from the backend.

### Prompt for Wave 4

Implement Wave 4 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): build real mailbox/thread/message APIs backed by the new mail schema and switch the admin UI to use them.

### Prompt for Wave 5

Implement Wave 5 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): add real outbound sending from hosted mailbox identities with thread-safe RFC headers and delivery tracking.

### Prompt for Wave 6

Implement Wave 6 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): add inbound sync/webhooks, message persistence, thread linking, and agent routing for hosted mailboxes.

### Prompt for Wave 7

Implement Wave 7 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): add newsletter source management, subscriptions, digest generation, and audited learning events.

### Prompt for Wave 8

Implement Wave 8 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): refactor Gmail into an optional external connector/import path using Gmail API rather than as Porter’s core email backend.

### Prompt for Wave 9

Implement Wave 9 from [porter-email-execution-plan.md](/home/lobster/projects/porter/.planning/porter-email-execution-plan.md): remove obsolete Gmail-core assumptions and deprecate or shim legacy email paths cleanly.

## Open Questions For You

These are the only product questions worth resolving before execution:

1. What hosting provider and VPS are you planning to run the mail server on?
2. Do you want agent mailboxes to be login-capable by humans, or app-managed only?
3. Do you want newsletters to affect only agent memory at first, or generate skill-improvement suggestions too?

If those answers are not ready yet, Claude can still safely execute Waves 1 through 4.
