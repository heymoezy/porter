# Security follow-up: PORTER_SERVICE_TOKEN hardening (HIGH — flagged 2026-07-08)

Background security review flagged the hardcoded fallback `'porter-local-service-2026'`
in backend/src/release-kit/register.ts. VALID but CODEBASE-WIDE — not unique to that file.

## Scope (fix ALL together — a one-file change breaks consistency without security gain)
Call sites defaulting to the literal token:
- backend/src/release-kit/register.ts, announce-adapter.ts
- backend/src/services/release-reconciler.ts (via announce-adapter)
- backend/scripts/gen-admin-release-info.ts (no — that's build-time, no token)
- ymc.capital: backend/src/lib/porter-bridge.ts, recall-summarize-client.ts, announce scripts
- VALIDATOR: ymc backend/src/routes/announce.ts serviceTokenOk() (accepts YMC_SERVICE_TOKEN||PORTER_SERVICE_TOKEN, currently the literal via ymc .env) + Porter's requireAuth service-token path.

## Coordinated fix (needs Moe — rotates a shared secret across 2 live services)
1. Generate a strong token: `openssl rand -hex 32`.
2. Set PORTER_SERVICE_TOKEN=<that> in BOTH Porter/backend/.env AND ymc.capital/backend/.env (+ any script env / systemd unit that runs the announce scripts).
3. Flip every call site + validator to FAIL-CLOSED (throw/reject if env unset; NO hardcoded fallback). Reject the literal 'porter-local-service-2026' explicitly.
4. Bind X-Service-Token / X-Porter-Service-Token acceptance to loopback at the socket level (not just isLoopback() ip check — already loopback-checked in announce.ts serviceTokenOk, but Porter's requireAuth path should match).
5. Restart both services; verify every inter-service call still authenticates (bridge dispatch, announce, reconcile, recall).

## Risk / urgency
Loopback-only (127.0.0.1) → needs local host access to exploit → LIMITED immediate exposure, but real (local process / SSRF pivot). Do as ONE deliberate pass, not piecemeal. Deferred from the 2026-07-08 session (would break inter-service auth if done hastily mid-work).
