# Porter PEP/1 Phased Implementation Plan

Date: 2026-02-26  
Owner: Porter Core  
Execution Model: Claude-led implementation in phases, with strict scope gates

---

## 0) Objective

Ship a reliable multi-device Porter architecture using:

- **Tailscale** as transport/security plane
- **Porter Endpoint Protocol (PEP/1)** as application/control plane
- **Hub + Agent** model for remote filesystem operations

We are explicitly **not** building a proprietary transport tunnel in this roadmap.

---

## 1) Architecture Decision (Locked)

1. Keep Tailscale as networking substrate (identity + encrypted connectivity).
2. Build Porter protocol on top (HTTP JSON APIs).
3. Treat SSH as temporary bootstrap/fallback only, not core product path.
4. Treat iPhone as client-first (UI/control), not server-first endpoint.

---

## 2) Phase Roadmap

## Phase 0 — Stabilize Current UX + Connection Semantics (2–3 days)

### Goal
Eliminate confusing/broken connection behavior and enforce truthful state reporting.

### Scope
- Connection UI switches from protocol-first to capability-first messaging.
- iPhone connection copy updated to client-first behavior (no SSH-first assumption).
- Standard error envelope used in connect flows:
  - `error.code`
  - `error.message`
  - `error.retryable`
- Node state badges visible and consistent: `online`, `offline`, `relay`.
- Frontend timeout policy enforced (no hanging spinner states).

### Acceptance Criteria
- No dead-end connect actions.
- Every failed connect shows actionable cause.
- iPhone flow no longer implies unsupported server behavior.

### Deliverables
- `porter.py` UI/API adjustments for status/error consistency.
- Changelog entry for Phase 0 stabilization release.

---

## Phase 1 — PEP/1 Minimal Vertical Slice (7–10 days)

### Goal
Enable first non-SSH remote filesystem operations via Hub + Agent.

### Scope Lock (strict)
Implement only:
- `agent.register`
- `agent.heartbeat`
- `fs.list`
- `fs.read`
- `fs.write`
- `fs.mkdir`
- `fs.delete`

Do **not** add:
- fs.watch
- exec/shell
- Windows-specific polish
- generalized plugin architecture

### Hub Work (porter.py)
- Add `POST /pep/v1/agent/register`
- Add `POST /pep/v1/agent/heartbeat`
- Add `GET/POST /pep/v1/fs/{node_id}/...` proxy endpoints
- Policy check before forwarding/exec
- Audit records for mutating ops (write/mkdir/delete)

### Agent Work (new file)
Create `porter-agent.py` (single file, stdlib-first):
- Registration using one-time token
- Heartbeat loop
- Local safe path resolution
- Filesystem handlers for v1 scope
- Capability declaration during registration

### UI Work
- Settings → Add Remote Node → generate one-time token
- Display copyable agent install/register command
- Show node online/offline and last seen
- Bind remote mount paths

### Acceptance Criteria
- From iPhone Safari UI: list/read files on remote Mac node via Hub+Agent.
- Write/delete succeed and are audited.
- Agent offline state appears within heartbeat timeout window.

### Deliverables
- `porter-agent.py`
- PEP/1 Hub endpoints in `porter.py`
- Basic registration UI + node status integration
- Phase 1 changelog/release notes

---

## Phase 2 — Hardening + Scale (post-v1)

### Scope
- Token lifecycle UX (rotate/revoke agent tokens)
- SSE events (`agent.status`, `fs.change`)
- Extended policy controls (per-node/per-path write rules)
- Windows agent support
- Optional controlled command capability (allowlist only)

### Acceptance Criteria
- Stable reconnect/recovery behavior
- Clear audit trail for all mutating operations
- Production-grade node lifecycle controls

---

## 3) Security + Reliability Guardrails

- No custom transport protocol in this execution plan.
- No shell-exec in v1 filesystem path.
- All mutating operations must be audited synchronously.
- Safe path resolution enforced on both Hub and Agent.
- Timeouts:
  - connect/probe: 5s baseline
  - read/write operation: 30s baseline
- Retries only on retryable classes (`NODE_OFFLINE`, `NODE_TIMEOUT`, transient network errors).

---

## 4) Execution Order Checklist (for Claude)

1. Create/lock PEP/1 endpoint contracts and error envelope.
2. Implement Phase 0 stabilization in `porter.py`.
3. Add Hub registration + heartbeat endpoints.
4. Implement `porter-agent.py` with minimal handlers.
5. Add Hub FS proxy endpoints for v1 methods.
6. Add registration token UI and node health surfaces.
7. Validate end-to-end: iPhone UI → Hub → Mac Agent.
8. Write release notes + changelog for each phase.

---

## 5) Definition of Done per Phase

A phase is complete only when all are true:
1. Acceptance criteria pass.
2. Changelog/release notes updated.
3. No regressions in existing local-node workflows.
4. Manual smoke test checklist attached to PR/commit notes.

---

## 6) Out of Scope (for now)

- Proprietary L3/L4 tunnel implementation
- Replacing Tailscale networking
- Full mobile background sync architecture
- Realtime watch streaming (defer to Phase 2)

---

## 7) File + Ownership

This file is the implementation contract for phased delivery.

Path:
`/home/lobster/documents/porter/pep-v1-phased-implementation-plan.md`
