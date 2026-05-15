# Porter Requirements — Active

**Last updated:** 2026-05-15 (v6.0 archived — between milestones)
**Status:** Awaiting v7.0 scoping

For shipped v6.0 requirements + traceability, see `.planning/milestones/v6.0-REQUIREMENTS.md`.

---

## v7.0 — TBD

Awaiting Moe's milestone scoping. Run `/gsd:new-milestone` to define.

---

## Carry-over from v6.0 (Pending v7.0 scoping)

These items were surfaced during the v6.0 milestone audit (2026-05-14, see `milestones/v6.0-MILESTONE-AUDIT.md`) as known gaps or tech debt that did not block v6.0 closure but are candidates for the next milestone.

### Inter-Agent Delegation Activation

- [ ] **DEL-01**: `task-planner.ts` populates `assignedAgentId` with selected agent ID instead of hardcoded `null` (lines 295, 355). Phase 43's `delegateToAgent` is structurally complete but functionally cold in the decomposition pipeline — task-planner needs agent-selection logic before Phase 42→43 auto-decompose/auto-delegate loop activates.

### Porter Control Plane — Outstanding Clauses

- [ ] **PCP-02-tools**: Tool-restriction enforcement on child dispatches (PCP-02 partial — depth-limit clause shipped in v6.0, tool-restriction clause unimplemented). Child dispatches should be constrained to a subset of parent's tool allowlist.

### Multi-Silo Support

- [ ] **DRM-multi-01**: Admin silo — Porter UI/ops, distinct prompt template, distinct directive set
- [ ] **DRM-multi-02**: Data-room silo — YMC fund operations corpus, distinct prompt template
- [ ] **DRM-multi-03**: Silo enrollment workflow — make adding a new silo a single SQL+ops step, not a code change

### Dreams Page UX

- [ ] **DRX-01**: Bulk accept/reject on Dreams page (multi-select rows, batch action with confirmation)
- [ ] **DRX-02**: Edit-in-place on proposals (admin amends `proposed_content` before accept, captured in audit)
- [ ] **DRX-03**: Proposal search (full-text across `proposed_content` + `source_evidence`)
- [ ] **DRX-04**: Silos list endpoint `/api/admin/silos` so `dreams.tsx` silo filter is not hardcoded to `software` + `software-smoke-48.4`

### Bridge Consolidation Cleanup (Deeper)

v6.0.1 cleanup pass (2026-05-15, commit `c6424ed`) trimmed admin diagnostic surfaces (`prompt-pipeline.ts`, `gateway-versions.ts`). Out-of-scope items still referencing legacy gateways:

- [ ] **BCC-01**: `backend/src/config.ts` — `ollamaUrl` / `openclawUrl` / `openclawToken` defaults
- [ ] **BCC-02**: `backend/src/services/learner.ts` — Ollama calls
- [ ] **BCC-03**: `backend/src/services/contact-analyzer.ts` — Ollama calls
- [ ] **BCC-04**: `backend/src/services/context-compressor.ts` — Ollama calls
- [ ] **BCC-05**: `backend/src/services/task-decomposition/**` — Ollama calls
- [ ] **BCC-06**: `backend/src/cli/setup.ts` — multi-gateway setup flow
- [ ] **BCC-07**: `/gateways/restart` + `/speed-test` routes — multi-gateway branches
- [ ] **BCC-08**: `migrate-bridge-v7.ts` + `migrate-bridge-v15.ts` — historical migration paths (probably keep, but audit for stale references)
- [ ] **BCC-09**: `admin/backend/**` — orphaned legacy admin backend (verify dead, delete if so)

### Self-Improvement (Originally v7.0 Per v6.0 REQUIREMENTS.md)

- [ ] **SIM-01**: Agent-driven development — agents detect bugs, write patches, ship through verification loop
- [ ] **SIM-02**: Pattern mining across dispatch history — auto-tune routing weights
- [ ] **SIM-03**: Self-modifying codebase with approval gates and rollback safety

### SaaS Billing (Originally v7.0)

- [ ] **BIL-01**: Lemon Squeezy subscription integration (create, upgrade, cancel, webhook handling)
- [ ] **BIL-02**: Usage metering per workspace (API calls, tokens consumed, storage)
- [ ] **BIL-03**: Plan limit enforcement at API level

---

## Out of Scope (Unchanged from v6.0)

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first, responsive design |
| Self-hosting support | SaaS-only for now |
| Custom model training | Use existing providers via routing |
| Video/voice calling | Chat and messaging only |
| Distributed substrate (multi-machine) | v6.0 is local-first; distributed is v7+ |
| Unsupervised code mutation | Always requires verification loop |

---

*Active requirements file. For v6.0 archive (60 reqs complete), see `milestones/v6.0-REQUIREMENTS.md`.*
