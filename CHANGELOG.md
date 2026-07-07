## v6.58.0 (2026-07-07)

- Admin hygiene: typecheck 0, untrack build/, dream-run json fix (v6.57.0)


## v6.56.0 (2026-07-07)

- Porter admin: MCP management page + forge dead-code cleanup (v6.55.0)


## v6.54.0 (2026-07-07)

- Vault v2 R1e: placement accept/refile — review-queue ops (v6.53.0)


## v6.52.0 (2026-07-07)

- Vault v2 R1c: ingest API — type-checked push + proposed placements (v6.51.0)


## v6.50.0 (2026-07-07)

- Vault v2 R1a: generic schema — 6 tables (v6.49.0)


## v6.48.0 (2026-07-06) — admin revamp: remove Forge/Email/skill-feedback

- feat(admin): removed the Forge, Email, and Skill-Feedback screens from the Porter admin (their backends were already deleted — Forge v6.28.0, mail-pillar purge 2026-07-04 — so these were dead frontends). Route files + nav entries + backend/src/routes/admin/email.ts removed; deregistered. tsc 0, react-router build clean (no orphan chunks). Net −2067 lines.
- Design doc for the replacements (vault: porter-admin-revamp.md): MCP management, tools consolidation, and a CLI config view (Porter visualises ~/.claude config). Those land as follow-up releases.

## v6.47.0 (2026-07-06) — Bridge model failover

- feat(bridge): FAILOVER CHAIN (Moe: "bridge should be switching tom into other models... if claude fails or quota is reached. right now he just breaks"). Every /agent-message dispatch now runs through `dispatchWithFailover`: on gateway failure — process error, timeout, or a quota/usage-limit signature — the SAME task retries on the next gateway in the configured chain (claude_cli → codex_cli → antigravity_cli; env PORTER_BRIDGE_FALLBACK_CHAIN or gateways.priority is the config). Shared 300s budget across the chain (raceBudget). `fallback:false` opts a caller out (hard-fail, no model switch). Loopback-only `simulateFailure` proof hook. The failover chain + per-attempt outcome/reason + who answered persist to bridge_dispatch_log.failover and surface in the response envelope (failover.switched/answeredBy). Proven live: simulate claude_cli fail → codex_cli answered; fallback:false → clean hard-fail; log recorded.
- Covers all Bridge consumers (Tom workers, digests, Marshall/Sentinel, ops-chat, vault-chat, evolution loop). Tom's live WhatsApp chat runs in openclaw's own gateway (not Bridge) — its chat-surface failover lands with the openclaw upgrade.
