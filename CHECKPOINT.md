# Porter Checkpoint
# CANONICAL — all gateways read this file. Do not create per-gateway checkpoints.
# Location: /home/lobster/projects/porter/CHECKPOINT.md

project: porter
version: v6.1.0
updated: 2026-04-04
updated_by: claude-opus-4.6

## Architecture

Single monorepo (heymoezy/porter). One Fastify process on :3001. API metering business model.
3 pillars: Bridge (hub), Forge (factory), Recall (shared brain).
5 gateways: Claude CLI, OpenClaw, Ollama, Codex CLI, Gemini CLI.
**Port 5175 is DEAD. Everything on :3001.**

## Milestone v6.0 — The Orchestration Platform — COMPLETE

All 8 phases shipped, verified:
- Phase 40: Gateway Capability Registry (per-gateway strengths, cost tiers, tool support)
- Phase 41: Session Intelligence (frozen memory snapshots, cross-session FTS, routing confidence)
- Phase 42: Task Decomposition Engine (DAG classifier, planner, executor, joiner, inspection API)
- Phase 43: Inter-Agent Messaging (delegation service, peer-to-peer guard, DAG executor wiring)
- Phase 44: Autonomous Job Queue (skill/capability matching, self-scheduling, admin panel)
- Phase 45: Porter Control Plane (delegation doctrine, depth enforcement, approval gates)
- Phase 46: Project Monitoring (watchers, findings, activity feed, notifications, admin ops)
- Phase 47: Project Substrate (provisioning, file ingress, Atlas structural health agent)

## Queued Work

1. **Project Monitoring System** — from /home/lobster/projects/Fatburger Lawsuit/correspondence/PORTER-MONITORING-FEATURE-PROMPT.md
   - Automated watchers per project (web search, email, RSS, custom)
   - Activity feed integration, notifications, admin overview
   - Real use case: Fatburger lawsuit monitoring
   - NOTE: Phase 46 built the infrastructure; real-world watcher configuration still needed

2. **Project Substrate V1** — from ~/.openclaw/workspace/PROJECT-SUBSTRATE-HANDOFF-TO-CLAUDE.md
   - NOTE: Phase 47 built the core substrate; advanced features (full workspace shell) still pending

3. **Version bump to v6.0.0** — all package.json files, health endpoint, changelog entry

## Recent Session Notes (2026-04-03)
- Fixed upload bug: order-independent multipart parsing in files.ts
- Completed Phase 43-02: DAG executor delegation wiring
- Planned + executed Phases 44-47 autonomously
- v6.0 milestone fully complete (8 phases, all verified)
- Built and deployed to production
- **Mail Tranche 6 complete:** Outbound send pipeline with delivery tracking
  - delivery-service.ts: per-recipient tracking (create, update, query, admin listing)
  - provider-factory.ts: shared StalwartMailProvider singleton
  - send-service.ts: sendMail, createDraft, replyToMessage orchestration
  - stalwart-provider.ts: sendMessage implemented (log-only fallback, ready for SMTP)
  - Routes: POST /messages/send, POST /drafts, POST /messages/:id/reply
  - Admin: GET /admin/mail/deliveries for diagnostics
  - All verified: send, draft, reply, thread grouping, RFC headers, delivery records
- **Mail Tranche 7 complete:** Inbound sync and hosted mail routing
  - inbound-processor.ts: mailbox resolution (incl. aliases), dedup, message creation, SSE broadcast, agent job routing
  - stalwart-webhooks.ts: message.new/received ingestion, message.bounced/failed delivery updates
  - sync-service.ts: manual mailbox sync with last_sync_at tracking
  - Routes: POST /mail/inbound, POST /mail/webhooks/stalwart (secret-gated), POST /admin/mail/sync/:mailboxId
  - Config: MAIL_WEBHOOK_SECRET env var for webhook auth
  - All verified: inbound creates message+thread+agent_job, dedup returns existing, webhook ingestion, bounce handling, sync updates timestamp
- **Mail Tranche 9 complete:** Newsletter Sources and Subscription System
  - newsletter-service.ts: detection heuristics (List-Unsubscribe, Precedence, from patterns, X-Campaign), source CRUD, subscriptions, digest generation, 6h digest cycle
  - mail-learning-service.ts: audit trail for learning decisions (summarized, embedded, promoted_to_memory, ignored, unsubscribed)
  - Inbound processor hook: auto-detects newsletter senders on inbound, creates sources with trust_level='review'
  - Scheduler hook: runDigestCycle() every 6h for all active digest subscriptions
  - Routes: GET/POST/PATCH/DELETE /newsletters/sources, POST /newsletters/subscribe, POST /newsletters/unsubscribe, GET /agents/:agentId/subscriptions, GET /newsletters/learning-events
  - All verified: source CRUD, subscribe/unsubscribe (soft-delete), auto-detection from inbound with List-Unsubscribe header, learning events query
- **Mail Tranche 10 complete:** Safe Memory and Skill-Learning Integration
  - learning-policy.ts: trust gate (trusted-only), promoteToMemory (medium-trust concepts), suggestSkillImprovement (pending proposals via skill_evolution_proposals), topic-tag-to-skill matching, full processDigestForLearning pipeline
  - newsletter-service.ts: generateDigest() now feeds learning pipeline after summarization (non-blocking try/catch)
  - mail-admin.ts: GET /admin/mail/learning-events for admin audit trail
  - All verified: trusted source → summarized + promoted_to_memory events + concept created; review source → ignored with reason 'untrusted_source'; admin endpoint returns full audit trail with filters
- **Mail Tranche 13 complete:** Deliverability and Ops Visibility
  - 5 new admin endpoints: GET /stats (aggregate counts), GET /queue (queued/deferred), GET /bounces (bounced/failed), GET /domains/:id/health (DNS issue detection), GET /mailboxes/:id/health (sync + message stats)
  - Mail Ops admin page (mail-admin.tsx): 6 tabs — Overview (stat cards, delivery breakdown, queue summary), Queue (auto-refresh 15s), Bounces (SMTP response, remote MX), Domains (DNS health check with issue detection), Mailboxes (sync status, per-mailbox health), Newsletters (source trust levels, subscription counts, learning events)
  - Nav: "Mail Ops" in Ops section with MailCheck icon
  - All endpoints verified with real data (12 active mailboxes, 3 messages, 2 queued deliveries)
