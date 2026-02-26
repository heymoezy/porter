# Claude Slow-Rollout Master Instructions (Single File)

Date: 2026-02-26  
Owner: Porter  
Mode: Incremental implementation to control API usage and reduce rollout risk

---

## 0) Read-first order (mandatory)

Before coding, read in this order:
1. `/home/lobster/documents/porter/MASTER_EXECUTION_PLAN.md`
2. `/home/lobster/documents/porter/FEATURE_TRUTH_MATRIX.md`
3. `/home/lobster/documents/porter/pep-v1-implementation-contract-v1.0.md`
4. `/home/lobster/documents/porter/v0.13.0-project-scoping-spec.md`

Do not start coding until all 4 are read.

---

## 1) Operating constraints (strict)

1. **Slow rollout only**
   - Implement exactly one tranche per run.
   - Stop after tranche completion and report.
2. **No scope creep**
   - Do not implement outside current tranche.
3. **Token/API discipline**
   - Keep code edits focused and small.
   - Avoid wide refactors unless tranche explicitly calls for them.
4. **Release governance required each run**
   - Version bump
   - In-app changelog update
   - `RELEASE_NOTES.md` update
5. **Trust-first UI**
   - If a feature is not fully reliable, hide it or label Preview.

---

## 2) Execution model (one tranche per run)

For each run:
1. Read this file and active tranche section.
2. Implement only that tranche.
3. Run minimal validation tests.
4. Commit with clear message.
5. Stop and return concise report:
   - what changed
   - tests run
   - known gaps
   - next tranche recommendation

---

## 3) Tranche roadmap (ordered)

## Tranche A1 — Trust UI enforcement (from truth matrix)

### Goal
Align UI labels/visibility with real behavior.

### Implement
- Change Agent "Test" to "Connectivity check (preview)" unless true roundtrip exists.
- Badge/hide schedule auto-run controls until reliability is verified.
- Hide scope controls that imply project isolation until layering is implemented.

### Acceptance
- No misleading labels for non-final features.

---

## Tranche A2 — Tasks/Schedules truth hardening

### Goal
Decide and enforce whether schedules are production-ready.

### Implement
- Validate schedule create/persist/trigger path end-to-end.
- If trigger/retry unreliable:
  - keep feature behind Preview state.
- Add user-visible execution state clarity.

### Acceptance
- Either reliable + visible, or preview/hidden with clear messaging.

---

## Tranche B1 — R1 refactor scaffold only

### Goal
Start monolith split safely without behavior change.

### Implement
- Create package structure:
  - `app/server.py`
  - `app/api/`
  - `app/services/`
  - `app/store/`
  - `app/web/`
- Keep `porter.py` as compatibility bootstrap.
- Move only minimal routing/bootstrap code this tranche.

### Acceptance
- App runs with parity after scaffold move.

---

## Tranche B2 — API extraction batch 1

### Goal
Extract high-risk crowded domains first.

### Implement
- Move Agents + Workspace handlers into `app/api/agents.py` and `app/api/workspace.py`.
- Keep endpoint behavior unchanged.

### Acceptance
- Agents/Configure workflows still function as before.

---

## Tranche C1 — PEP/1 contract hardening batch 1

### Goal
Add guardrails required by contract.

### Implement
- Correlation ID propagation for PEP paths.
- Stable error envelope (`code`, `message`, `retryable`, `correlation_id`).
- Basic idempotency key support for mutating operations.

### Acceptance
- PEP/1 endpoints return consistent envelopes.

---

## Tranche C2 — Loop safety + audit provenance

### Goal
Close key governance gaps.

### Implement
- Max hop count + circuit breaker for feedback loops.
- Audit provenance fields:
  - `project_id`, `session_id`, `scope_source`, `correlation_id`, `chain_ref`

### Acceptance
- Loop guard trip and provenance logging demonstrable.

---

## Tranche D1 — Project scoping foundations

### Goal
Introduce project-aware data model without full UX overhaul.

### Implement
- Project registry + active project preference.
- Memory resolver layer order support:
  - Global → Project → Session/User → Agent
- No full UI yet, backend + resolver first.

### Acceptance
- Resolver returns source layer deterministically.

---

## Tranche D2 — Configure scope visuals

### Goal
Make scope impact obvious in UI.

### Implement
- File navigator grouped into:
  - Global Shared
  - Project
  - Agent-Specific
- Source badges per file row.
- Save confirmations include write scope.

### Acceptance
- User can always tell where edits apply.

---

## Tranche E1 — True roundtrip agent test

### Goal
Replace inference test with real hello↔ack.

### Implement
- Challenge/response protocol for agent test.
- UI modal states:
  - sending
  - ack success (+latency)
  - timeout/failure reason

### Acceptance
- Agent test reflects real connectivity, not heartbeat proxy.

---

## 4) Rollback rules

For every tranche, include rollback note in report:
- Files changed
- Revert command or commit hash to roll back
- Any migrations/data changes

---

## 5) Commit format

Use:
- `vX.Y.Z <short tranche name>: <what changed>`

Example:
- `v0.12.92 tranche A1: trust labels for preview features`

---

## 6) Stop conditions

Stop immediately and report (do not continue) if:
- behavior parity breaks unexpectedly,
- schedule/task runtime behavior is unclear,
- endpoint contract uncertainty appears,
- changes exceed tranche scope.

---

## 7) Start instruction (for current run)

Start with **Tranche A1** only.
Do not start A2 in the same run.
