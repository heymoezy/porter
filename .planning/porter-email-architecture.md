# Porter Email System Upgrade

## Goal

Upgrade Porter from a Gmail-tied demo email surface into a real multi-agent mail platform with:

- self-hosted mail for `@askporter.app`
- one mailbox per agent
- inbound and outbound delivery under Porter control
- agent/newsletter ingestion for long-term learning
- an internal API/UI for mailbox, thread, sender identity, routing, and automation

## Current State

### What exists now

- Outbound transactional mail uses Nodemailer with generic SMTP settings stored in `workspace_settings`.
- A separate email service uses Gmail OAuth2 and Gmail IMAP only.
- Google OAuth stores a single shared `provider='email'` connection in `workspace_connections`.
- IMAP IDLE auto-starts on server boot if one connected email account exists.
- Admin email UI shows a mailbox-like interface over `email_messages`.
- Admin compose UI has hardcoded senders like `porter@askporter.app`, `growth@askporter.app`, etc.

### What is missing

- No real `@askporter.app` mail hosting.
- No per-agent mailbox/account model.
- No mailbox provisioning lifecycle.
- No real inbound sync for multiple accounts.
- No outbound queue, retries, bounce handling, or webhook-driven delivery state.
- No thread model tied to real RFC message IDs.
- No newsletter subscription system.
- No mailbox permissions/sharing model.
- No tests around the email stack.

### Codebase findings

- `backend/src/services/email.ts`
  - Gmail-specific outbound via OAuth2.
  - Gmail IMAP-only inbound using `ImapFlow`.
  - Single shared connected email account.
- `backend/src/services/transactional-email.ts`
  - Generic SMTP transport for auth/invite emails.
  - Falls back to log-only dev mode if SMTP is not configured.
- `backend/src/routes/v1/oauth-google.ts`
  - Stores Google tokens for `provider='email'` and `provider='google_calendar'`.
- `backend/src/routes/v1/admin/email.ts`
  - CRUD over `email_messages`.
  - Does not actually send through SMTP when composing from admin.
- `admin/frontend/app/routes/email.tsx`
  - Hardcoded sender identities.
  - UI behaves like a mock mailbox over `email_messages`.
- `backend/src/db/schema.ts`
  - `email_messages` is too flat for real mailbox sync and delivery tracking.
  - `workspace_connections` can store external mailbox connectors, but is not enough for native hosted mail accounts.

## Recommendation

Use **Stalwart Mail** as the self-hosted mail server and make Porter the control plane around it.

### Why Stalwart

- All-in-one mail server with SMTP, IMAP, JMAP, OAuth, web admin, queue management, aliases, lists, quotas, and multi-tenancy.
- Has a Management API for domain/account automation.
- Has webhooks and JMAP/HTTP endpoints that are easier to integrate than stitching multiple legacy daemons together.
- Better fit for per-agent mailbox provisioning than file-driven stacks.

### Why not make Gmail MCP the core

- Gmail MCP servers are mostly third-party wrappers around Gmail APIs and are not the right core for first-party `@askporter.app` mail.
- Gmail should be treated as an optional external connector or migration/import source.
- Porter should own the primary mail domain, mailboxes, and routing logic.

## Alternatives Considered

### mailcow

Good full suite with mature UI and strong operations story, but heavier and more appliance-like. Better if you want operators living in the mail stack UI itself.

### Docker Mailserver

Solid classic stack, but account management is more file/config oriented. Less attractive if Porter needs to provision hundreds of agent accounts programmatically.

### maddy

Elegant and lean, but its IMAP storage posture is weaker for this use case. Better for lightweight setups than Porter’s long-term multi-agent platform.

## Important Operational Constraint

Self-hosted email is possible, but outbound deliverability is not free magic.

You still need:

- a host with outbound SMTP allowed
- correct reverse DNS/PTR
- SPF
- DKIM
- DMARC
- TLS certificates
- reputation monitoring
- bounce/complaint handling

If the VPS provider blocks SMTP ports, the plan stalls until hosting is fixed.

## Target Architecture

### Layer 1: Mail Infrastructure

Run Stalwart for:

- SMTP submission and relay
- inbound SMTP reception
- IMAP/JMAP mailbox access
- DKIM signing
- mailbox/account/domain management
- queue management
- mailing lists and aliases where useful

### Layer 2: Porter Mail Control Plane

Porter should manage:

- agent mailbox provisioning
- identity metadata
- mailbox-to-agent mapping
- newsletter subscriptions
- mailbox ingestion and classification
- thread sync into Porter conversations/memory
- outbound composition, approval, and send policies
- learning pipelines for agents and skills

### Layer 3: Porter Intelligence Layer

Porter agents consume mail through internal abstractions:

- inbox events
- newsletter digests
- thread summaries
- learnable artifacts extracted from trusted senders
- subscription health and unsubscribe controls

## Domain and Address Strategy

Primary domain:

- `askporter.app`

Mailbox naming:

- canonical mailbox per agent: `<agent_slug>@askporter.app`

Examples:

- `porter@askporter.app`
- `growth@askporter.app`
- `retention@askporter.app`
- `security@askporter.app`

Guidelines:

- use stable slugs, not mutable display names
- keep display name separate from email address
- support alias addresses per agent
- reserve system mailboxes:
  - `postmaster@askporter.app`
  - `abuse@askporter.app`
  - `support@askporter.app`
  - `noreply@askporter.app`
  - `deliverability@askporter.app`

## Data Model Additions

Add new tables instead of overloading `email_messages`.

### `mail_domains`

- `id`
- `domain`
- `provider` (`stalwart`)
- `status`
- `is_primary`
- `dkim_selector`
- `dkim_public_key`
- `return_path_domain`
- `created_at`
- `updated_at`

### `mailboxes`

- `id`
- `domain_id`
- `address`
- `local_part`
- `display_name`
- `type` (`agent`, `system`, `human`, `group`, `list`, `alias_only`)
- `status`
- `provider_mailbox_id`
- `password_hash_or_null`
- `quota_bytes`
- `last_sync_at`
- `created_at`
- `updated_at`

### `agent_mailboxes`

- `agent_id`
- `mailbox_id`
- `role` (`primary`, `shared`, `send_as`)

### `mail_aliases`

- `id`
- `mailbox_id`
- `alias_address`
- `send_as_enabled`
- `receive_enabled`

### `mail_threads`

- `id`
- `mailbox_id`
- `subject_canonical`
- `provider_thread_id`
- `message_count`
- `last_message_at`
- `conversation_id`

### `mail_messages`

- `id`
- `mailbox_id`
- `thread_id`
- `provider_message_id`
- `internet_message_id`
- `in_reply_to`
- `references_header`
- `direction` (`inbound`, `outbound`)
- `folder` (`inbox`, `sent`, `drafts`, `trash`, `archive`, `junk`)
- `from_address`
- `to_addresses_json`
- `cc_addresses_json`
- `bcc_addresses_json`
- `reply_to_addresses_json`
- `subject`
- `text_body`
- `html_body`
- `headers_json`
- `attachments_json`
- `status` (`queued`, `sent`, `delivered`, `deferred`, `bounced`, `failed`, `received`)
- `received_at`
- `sent_at`
- `read_at`
- `provider_raw_ref`

### `mail_deliveries`

- `id`
- `message_id`
- `attempt`
- `status`
- `smtp_response`
- `remote_mx`
- `queued_at`
- `completed_at`

### `newsletter_sources`

- `id`
- `mailbox_id`
- `source_type` (`email`, `rss`, `web`)
- `source_key`
- `sender_pattern`
- `trust_level`
- `topic_tags_json`
- `active`
- `created_at`

### `newsletter_subscriptions`

- `id`
- `agent_id`
- `mailbox_id`
- `source_id`
- `status`
- `delivery_mode` (`direct`, `digest`, `learning_only`)
- `last_received_at`
- `last_processed_at`

### `mail_learning_events`

- `id`
- `message_id`
- `agent_id`
- `skill_id`
- `event_type` (`summarized`, `embedded`, `promoted_to_memory`, `ignored`, `unsubscribed`)
- `payload_json`
- `created_at`

## API Plan

### Provisioning APIs

- `POST /api/v1/mail/domains`
- `POST /api/v1/mail/mailboxes`
- `POST /api/v1/mail/mailboxes/:id/aliases`
- `POST /api/v1/mail/agents/:agentId/mailbox`
- `POST /api/v1/mail/mailboxes/:id/password`

### Mailbox APIs

- `GET /api/v1/mail/mailboxes`
- `GET /api/v1/mail/mailboxes/:id/threads`
- `GET /api/v1/mail/threads/:id/messages`
- `POST /api/v1/mail/messages/send`
- `POST /api/v1/mail/messages/:id/draft`
- `POST /api/v1/mail/messages/:id/reply`
- `POST /api/v1/mail/messages/:id/archive`
- `POST /api/v1/mail/messages/:id/trash`

### Ingestion APIs

- `POST /api/v1/mail/webhooks/stalwart`
- `POST /api/v1/mail/sync/:mailboxId`
- `POST /api/v1/mail/import/gmail`

### Newsletter APIs

- `POST /api/v1/mail/newsletters/sources`
- `POST /api/v1/mail/newsletters/subscribe`
- `POST /api/v1/mail/newsletters/unsubscribe`
- `GET /api/v1/mail/newsletters/agents/:agentId`

## Integration Strategy

### Native hosted mail

Use Stalwart as the authoritative provider for:

- account creation
- password/app-password creation
- alias creation
- mailbox state
- SMTP delivery
- inbound receipt

Porter stores mirrored metadata plus app-specific workflow state.

### External Gmail connector

Keep Gmail support as an optional connector for:

- importing a legacy mailbox
- subscribing an agent to an external Gmail inbox
- bridging one-off research inboxes

Use Gmail API directly, not third-party Gmail MCP, for production connectors.

## Newsletter and Learning Design

### Principle

Not every newsletter email should mutate agent memory directly.

Use a staged flow:

1. Receive message.
2. Classify sender and trust level.
3. Extract newsletter/article candidates.
4. Summarize.
5. Score novelty and quality.
6. Route to:
   - agent digest
   - long-term memory candidate
   - skill improvement candidate
   - ignore/unsubscribe

### Learning policy

Only allow auto-learning from:

- approved senders
- approved domains
- approved topics

Require moderation or thresholds before:

- updating skill prompts
- changing agent operating policies
- adding high-confidence memory facts

### Recommended first implementation

- newsletter messages become digest artifacts, not direct skill rewrites
- agents can quote digests in future work
- separate later phase for controlled skill evolution

## UI Plan

Replace the current mock-style email UI with:

- mailbox switcher
- agent identity switcher
- real folders and counts
- thread list
- message detail with headers/attachments
- compose/reply/forward
- sender reputation and newsletter badges
- subscription controls
- learning actions:
  - save to memory
  - add to digest
  - follow sender
  - unsubscribe

Admin-only surfaces:

- mail domain health
- DNS checklist
- queue status
- bounce/deferred events
- mailbox provisioning dashboard

## Rollout Phases

### Phase 1: Infrastructure foundation

- deploy Stalwart for `askporter.app`
- configure DNS, DKIM, SPF, DMARC, TLS
- create system mailboxes
- validate inbound/outbound

### Phase 2: Porter provisioning layer

- add `mail_domains`, `mailboxes`, `agent_mailboxes`, `mail_aliases`
- build Stalwart admin client in backend
- provision mailboxes for existing agents

### Phase 3: Real mailbox sync

- add `mail_threads`, `mail_messages`, `mail_deliveries`
- sync real mailboxes into Porter
- replace hardcoded senders and fake mailbox list

### Phase 4: Agent workflow integration

- route inbound mail to agents
- allow agent send/reply from owned mailbox
- connect threads to conversations and memory

### Phase 5: Newsletter intelligence

- sender/source registry
- subscription workflows
- digest generation
- safe learning pipeline

### Phase 6: External connectors

- Gmail import bridge via Gmail API
- optional IMAP generic connector
- optional MCP adapter for external mail tools

## Non-Goals for first release

- full consumer-grade webmail parity
- automatic skill prompt rewrites from newsletters
- multi-provider mail hosting abstraction
- Outlook/Exchange parity on day one

## Recommended Immediate Build Order

1. Replace Gmail-as-core assumption with provider abstraction.
2. Add native hosted mailbox schema.
3. Implement `StalwartAdminClient`.
4. Provision one test mailbox and send/receive externally.
5. Replace hardcoded compose identities with live agent mailbox identities.
6. Build mailbox sync and thread model.
7. Add newsletter subscription and digest pipeline.

## Risks

### Deliverability risk

New IPs and weak DNS setup will cause spam-folder placement or outright rejection.

### Provider/network risk

Some VPS providers block SMTP ports or have poor IP reputation.

### Product risk

Directly feeding newsletters into agent memory without trust controls will degrade output quality.

### Complexity risk

Trying to ship groupware, full webmail, newsletter intelligence, and auto-learning in one pass will slow everything down.

## Strong Recommendation

Build this in two products inside Porter:

- **Porter Mail Core**
  - hosted mailboxes
  - send/receive
  - threads
  - routing
- **Porter Mail Intelligence**
  - subscriptions
  - digests
  - memory extraction
  - controlled learning

Do not mix them in the first migration.

## Claude Handoff Brief

Implement a full replacement of Porter’s current Gmail-tied/mock email stack so Porter becomes the control plane for a self-hosted `@askporter.app` mail system with one mailbox per agent.

What this is for:

- Every agent must have its own real email address like `<agent_slug>@askporter.app`.
- Porter must own inbound and outbound email instead of depending on a third-party mailbox provider for the primary system.
- Porter must support newsletter/blog ingestion for agents as a structured learning source.
- Gmail should remain optional as an external connector/import bridge, not the core mail platform.

What to build:

1. Introduce a provider abstraction for email backends.
   - Current code assumes Gmail in `backend/src/services/email.ts` and `backend/src/routes/v1/oauth-google.ts`.
   - Create a provider interface with a first implementation for Stalwart-hosted mail.

2. Add native hosted-mail schema.
   - Create migrations and schema entries for:
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

3. Add a Stalwart admin client in backend.
   - Responsibility:
     - create domain records
     - create mailbox accounts
     - create aliases
     - rotate mailbox passwords/app passwords
     - query mailbox/domain state
   - Keep provider credentials in Porter config/env, not in frontend.

4. Replace hardcoded sender identities in `admin/frontend/app/routes/email.tsx`.
   - Load available sender identities from backend based on real `agent_mailboxes`.
   - Remove the fake `senders` array.

5. Replace the fake admin mailbox CRUD model.
   - `email_messages` is not enough for real mailbox behavior.
   - Build mailbox/thread/message APIs on top of the new schema.
   - Keep `email_messages` only if needed for backward compatibility, otherwise migrate away cleanly.

6. Build send flow for hosted mailboxes.
   - Send as the selected real mailbox identity.
   - Track queue/delivery state in `mail_deliveries`.
   - Preserve RFC headers like `Message-ID`, `In-Reply-To`, and `References`.

7. Build inbound sync/webhook flow.
   - Consume Stalwart webhook or sync events.
   - Persist inbound mail into `mail_messages` and `mail_threads`.
   - Link inbound conversations to Porter conversations where appropriate.

8. Keep Gmail only as an optional connector.
   - Refactor existing Gmail OAuth logic into an external connector/import path.
   - Do not use Gmail as the primary send/receive path for `@askporter.app`.
   - If external Gmail ingestion is kept, prefer direct Gmail API integration over third-party MCP servers.

9. Add newsletter/source management.
   - Agents can subscribe to approved senders/domains/topics.
   - New newsletter mail should go through a digest and scoring pipeline before any memory or skill impact.

10. Add tests.
   - provisioning tests
   - sender identity tests
   - thread reconstruction tests
   - inbound routing tests
   - newsletter digest tests

Acceptance criteria:

- Porter can provision a real mailbox for an agent under `@askporter.app`.
- Admin UI lists real agent mailbox identities instead of hardcoded senders.
- Porter can send mail from an agent mailbox and track delivery state.
- Porter can ingest inbound mail into thread/message tables.
- Gmail is no longer the core dependency for Porter mail.
- Newsletter subscriptions exist as first-class entities and feed digest workflows.

Implementation notes:

- Recommended mail server: Stalwart.
- Do not try to ship everything at once. Land infrastructure, provisioning, mailbox sync, and UI identity replacement first.
- Treat learning from newsletters as a second-layer pipeline with trust controls, not direct skill mutation.
