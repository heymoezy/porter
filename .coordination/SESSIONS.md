# Porter — Active Sessions

## Porter Dev (Opus 4.7) — 2026-05-10T07:30:00+08:00
- Workstream: Bridge revival — fix dispatch-log pollution, restore tabs, live motion
- Files in scope:
  - backend/src/db/migrate-bridge-v8.ts (new)
  - backend/src/index.ts
  - backend/src/routes/admin/health.ts
  - backend/src/services/bridge/adapters/claude-cli.ts
  - backend/src/services/bridge/model-catalog.ts
  - admin/frontend/app/routes/bridge.tsx
  - admin/frontend/app/components/bridge/*.tsx
  - .claude/hooks/porter-activity-log.js
- Status: active

---

## Whatsapp (Opus 4.7, cross-project) — 2026-05-10T08:10+08:00
- Workstream: WhatsApp Phase 1 — wire up existing Porter Bridge WA infrastructure to a real Meta WABA + extend for media/audio + tenant fan-out to YMC
- Authorisation: Moe (this session is `Whatsapp`, also leading YMC ledger at `/home/lobster/projects/ymc.capital/.coordination/SESSIONS.md`)
- Files claimed (planned, in order):
  - **Phase 1.0 (now):** `backend/.env` (add WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_DISPLAY_NAME) — config only, no code change
  - **Phase 1.1 (next):** `backend/src/routes/v1/webhooks-whatsapp.ts` — extend for image/document/audio types
  - **Phase 1.1:** `backend/src/services/whatsapp.ts` — media downloader + Whisper transcription wrapper
  - **Phase 1.2:** new Tom agent persona under `personas/` + routing rule
  - **Phase 1.3+:** YMC fan-out (separate ledger)
- Files I am NOT touching (Porter Dev's scope — no overlap):
  - `backend/src/index.ts`, `backend/src/routes/admin/health.ts`, `backend/src/services/bridge/adapters/claude-cli.ts`, `backend/src/services/bridge/model-catalog.ts`, `admin/frontend/app/routes/bridge.tsx`, `admin/frontend/app/components/bridge/*.tsx`
- Status: **Phase 1.0 done** (Porter side). Pending Moe completing Meta App Dashboard steps + pasting 3 secrets back. Then Phase 1.1 (media + audio + Whisper).
- Phase 1.0 verification: `https://askporter.app/api/v1/webhooks/whatsapp` handshake returns 200 with challenge echo on correct token, 403 on wrong token. Verified via Caddy public URL — what Meta will hit.
