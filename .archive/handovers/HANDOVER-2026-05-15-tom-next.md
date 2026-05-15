# Porter / YMC handover — 2026-05-15

Drop this into a fresh Claude session. Picks up after the **contact-vs-investor vocabulary fix** (YMC commit `5e657b3c`) and the **set-photo / namecard vision / relationship / archive / purge / HEIC / voice-transcribe** wave.

## Current state — what's running

Five user-services on this box. All `systemctl --user is-active` green at handover time:

| Service | Port | What it does |
|---|---|---|
| `porter-fastify` | 3001 | Porter Brain (Bridge / Memory V3 / Intelligence). Version `v6.17.0`. |
| `ymc-backend` | 5182 | YMC Capital backend (Fastify, TS). Tom's tool surface lives here. |
| `openclaw-gateway` | 18789 (WS) | WhatsApp / agent runtime. Routes Tom's chat. |
| `whisper-server` | 8088 | whisper.cpp HTTP server (`base.en` model). Internal — proxy fronts it. |
| `whisper-proxy` | 8089 | Node stdlib shim. Accepts multipart, ffmpegs `.ogg`→`.wav`, forwards to 8088. openclaw points here as `provider: openai, baseUrl: http://127.0.0.1:8089`. |

Static ffmpeg at `/home/lobster/bin/ffmpeg` (no HEIF demuxer — that's why HEIC photos go through `heic-convert` npm pkg instead).

**One non-portable patch outside any repo** in `/home/lobster/.npm-global/lib/node_modules/openclaw/dist/media-understanding-bGVGc1zV.js`: `transcribeOpenAiCompatibleAudio` was patched to pass `allowPrivateNetwork: true` to `resolveProviderHttpRequestConfig` so the SSRF guard doesn't block 127.0.0.1:8089. Search the file for `PATCH (Moe, 2026-05-13)` — **reapply after any `npm i -g openclaw@*`**.

## Tom — current capability inventory

Tool surface in `/home/lobster/projects/ymc.capital/services/ymc-tom-mcp/server.mjs`:

Read-only:
- `ymc_contact_by_phone`, `ymc_contact_search` (now returns `kind: contact|investor` + `subscriptionStatus`), `ymc_contact_detail`
- `ymc_relationships`, `ymc_shared_relationships`
- `ymc_search_notes`, `ymc_list_contact_notes`
- `ymc_search_document_text`, `ymc_document_search`
- `ymc_stats_summary` — now returns `subscribed_investors` + `unsubscribed_contacts` (real "investor" count), in addition to `contacts_total`, `pending_kyc_action`, `pending_kyc_action_by_entity_type`, etc.
- `ymc_review_pending`
- `ymc_extract_business_card` — Claude vision via one-shot `claude -p` spawn from `/tmp/ymc-card-<uuid>/`. Returns `{is_card, confidence, name, title, company, phone, email, website, address, raw_text}`. ~10s/call.

Mutating (all with two-turn confirmation):
- `ymc_create_contact` — confirms with **contact** word, never "investor". Email defaults to NULL.
- `ymc_add_contact_note`, `ymc_create_relationship`, `ymc_delete_relationship`
- `ymc_set_contact_photo` — sets default + KYC mirrors, HEIC auto-transcoded via `heic-convert`.
- `ymc_ingest_document` — accepts paths in `~/.openclaw/media/inbound/` AND `~/.openclaw/workspace-tom/`.
- `ymc_archive_contact` — soft delete via `users.status='archived'`. No unarchive tool (admin-only restore).
- `ymc_purge_contact` — hard cascade delete with audit-trail guard. Two-phase: inventory → confirm:true.
- `ymc_send_document`, `ymc_send_photo`.

SOUL.md at `/home/lobster/.openclaw/workspace-tom/SOUL.md`. **Updated today** with:
- "Vocabulary — Contact vs Investor" section (just above the hard guardrails)
- "Deletion vs Archive vs Purge" three-way protocol
- "Inbound attachments — ALWAYS file + auto-route" fan-out (every attachment ingests; images chain into set-photo OR extract-business-card)

## What Moe last asked for / what's live

| Ask | Status | Commit |
|---|---|---|
| Voice notes get transcribed | ✅ Working via whisper-proxy. ~6s end-to-end. | `prior wave` |
| Photo uploads accept HEIC | ✅ Both Admin route + Tom tool. | `952ef956` |
| Frank Phuan's photo set | ✅ From the May 13 group chat attachment | this session |
| Tom can set profile photos from chat | ✅ `ymc_set_contact_photo` | `952ef956` |
| Tom can hard-delete (purge) | ✅ `ymc_purge_contact` (2-phase) | `952ef956` |
| Every attachment → review queue | ✅ SOUL.md fan-out rule | `ee5199cb` |
| Namecard photo auto-creates contact | ✅ `ymc_extract_business_card` + SOUL chain | `ee5199cb` |
| Tom can create relationships from chat | ✅ `ymc_create_relationship` + delete companion | `c227240b` |
| David → Arc Orient Pacific employee | ✅ Done as smoke (`27942479-3d4b-…`) | this session |
| "Investor" vocabulary fix | ✅ Tom never says "investor" unless `subscription_status='subscribed'` | `5e657b3c` |

## Porter side — where Moe was

`v6.17.0` is current (he touched `index.ts` + `health.ts` versions today; CHANGELOG entry incomplete). **Phase 48.3 Software Dream Worker** is the next milestone — 5 plans + RESEARCH + VALIDATION already committed (`4bbcf34`), **code not started**:

- `dream_runs` + `memory_proposals` tables — schema not created
- `dream-worker.ts` — not written
- `software.md` prompt — referenced in `silos.prompt_path`, file doesn't exist
- 717 software-silo transcript turns live in `session_transcript_turns` ready to consume

Plans live at `.planning/phases/48.3-software-dream-worker/48.3-{01..05}-PLAN.md`. Suggested entry point: `gsd:execute-phase 48.3`.

After 48.3 ships, a **Phase 48.5 YMC Silo** would extend the same machinery — corpus source becomes the YMC DB (contact_notes, documents.extracted_text, audit_events) instead of Claude CLI transcripts. Prompts at `ymc.md`. Surfaces back to Tom via Bridge with `silo: "ymc"` hint (instead of `raw: true`) so Tom carries digested wisdom into every reply. Not started.

## Things worth knowing before doing anything

- **Multi-session coordination**: this box runs parallel Claude sessions. Read `/home/lobster/projects/Porter/.coordination/SESSIONS.md` at session start; declare your intent before editing.
- **Porter restart blip**: yesterday 14:20 SGT, a porter-fastify restart mid-request caused Tom's chat dispatch to 502 → openclaw retried 8× into cold cache → all failed. Transient. If it happens again, the shim's fetch retry on 5xx is a known nice-to-have (not built).
- **Tom group chat addressing**: catch-all (`mentionPatterns: ["."]` in `~/.openclaw/openclaw.json`). Tom replies to every non-empty group message. Yai + Clement are unconstrained.
- **Hard guardrails in SOUL** still hold: no code/system disclosure, no model/key reveal, two-turn confirms on deletes.

## Likely next asks (Moe's pattern)

- Phase 48.3 execution (Porter Dream Worker) — the planned-but-unbuilt big rock.
- More Tom tools: probably mark-contact-as-investor (set subscription_status='subscribed' when an admin says "X just invested in deal Y"), deal-creation, capital-call surface.
- Tom proactive surfaces — daily digest, KYC chase reminders, etc. (Needs scheduled-jobs design; doesn't exist for Tom yet.)
- YMC dream silo as discussed.

## File pointers for the next session

- **Tom routes**: `/home/lobster/projects/ymc.capital/backend/src/routes/whatsapp-tom.ts` (~1200 LOC)
- **Tom MCP tools**: `/home/lobster/projects/ymc.capital/services/ymc-tom-mcp/server.mjs`
- **Tom persona**: `/home/lobster/.openclaw/workspace-tom/{IDENTITY,SOUL}.md`
- **openclaw config**: `/home/lobster/.openclaw/openclaw.json`
- **whisper services**: `/home/lobster/.config/systemd/user/whisper-{server,proxy}.service`, `/home/lobster/bin/whisper-proxy.mjs`
- **Porter 48.3 plans**: `/home/lobster/projects/Porter/.planning/phases/48.3-software-dream-worker/`
- **YMC CHECKPOINT**: `/home/lobster/projects/ymc.capital/CHECKPOINT.md`
- **Porter CHECKPOINT**: `/home/lobster/projects/Porter/CHECKPOINT.md` (may be stale relative to today's YMC work — Tom changes don't write there)

## Quick smoke commands

```bash
# Health
systemctl --user is-active porter-fastify ymc-backend openclaw-gateway whisper-server whisper-proxy

# Tom end-to-end
openclaw agent --agent tom --message "how many investors do we have" --json | jq -r '.result.payloads[0].text'
# Expected today: 0 subscribed investors, 136 contacts

# Stats raw
curl -sS http://127.0.0.1:5182/api/admin/whatsapp/tom/stats/summary \
  -H "Authorization: Bearer $(grep '^OPENCLAW_TOM_TOKEN=' /home/lobster/projects/ymc.capital/backend/.env | cut -d= -f2-)" | jq

# Porter health
curl -sS http://127.0.0.1:3001/health | jq
```
