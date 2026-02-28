# Porter PEP/1 Implementation Contract v1.0

Date: 2026-02-26  
Status: Locked for execution  
Owner: Porter Core  
Review basis: Internal architecture review + Grok critical review

---

## 1) Decision Summary

**Go** for implementation, with preconditions.

Target architecture remains:
- OpenClaw above Porter (orchestration layer)
- Porter as control plane with internal logical split:
  - **Control Core** (policy, audit, lifecycle, memory resolution)
  - **Transfer Path** (PEP/1 file/data operations)
- Tailscale as transport substrate
- Closed-loop feedback with safeguards
- Layered memory resolution:
  - Global → Project → Session/User → Agent override

---

## 2) Mandatory Preconditions (before/at start of Phase 1)

1. **Namespace isolation model**
   - project/session namespace enforcement in memory + execution context.
2. **Internal API contract draft**
   - formal request/response schema between Control Core and Transfer Path.
3. **Observability baseline**
   - OpenTelemetry traces (correlation IDs as trace attributes).
   - Prometheus metrics export.
4. **Standard error model**
   - explicit retryable vs fatal classes with stable codes.
5. **Rollback strategy**
   - documented rollback steps for each phase.

---

## 3) Scope Boundaries

### In scope
- PEP/1 foundational endpoints and flow
- Token-based onboarding for remote agents
- Heartbeat/liveness model
- Basic filesystem operation path
- Memory resolver layering (global/project/session-agent hierarchy)
- Audit provenance fields
- Loop safeguards

### Out of scope
- Command center expansion
- Custom transport protocol/L3-L4 tunnel
- Full RBAC redesign beyond required scope checks
- Unrelated UI redesigns

---

## 4) Architecture Contract

## 4.1 Layering

1. **OpenClaw layer**
   - user intent orchestration + high-level routing
2. **Porter Control Core**
   - policy evaluation
   - lifecycle management
   - audit/provenance
   - memory resolution
3. **Porter Transfer Path**
   - PEP/1 file/data operations
   - mediated execution path to remote agents
4. **Data + Memory layer**
   - filesystem/artifacts
   - memory store with scope hierarchy

## 4.2 Feedback loop safeguards (required)
- `correlation_id` per flow
- idempotency keys for repeat-safe operations
- max hop count
- circuit breaker policy on loop instability

---

## 5) Security + Governance Requirements

1. Scope-aware enforcement on every operation:
   - `project_id`, `session_id`, `agent_id` context
2. Audit provenance fields required:
   - `correlation_id`
   - `project_id`
   - `session_id`
   - `scope_source` (global/project/session/agent)
   - `actor`
   - `chain_ref` (or equivalent provenance linkage)
3. Memory and config writes must be namespace constrained.
4. No direct bypass path from agent to protected storage without Control Core policy check.

---

## 6) Metrics and Split Triggers (locked)

Porter must emit and monitor at minimum:
- transfer path p95 latency
- transfer queue depth
- control-loop lag
- operation error rate
- Porter CPU utilization
- Porter memory utilization

### Trigger thresholds for physical Transfer Path split
- transfer p95 latency > **200ms** for 5-minute windows
- queue depth > **50** average over 1-minute windows
- control-loop lag > **500ms** over 5-minute windows
- error rate > **5%** over 10-minute windows
- CPU > **70%** for 5 minutes
- memory > **80%** for 5 minutes

If thresholds sustain per policy window, split planning is escalated from optional to required.

---

## 7) Phase Plan

## Phase 1 — Foundational PEP/1 + Guarded Control Loop

### Deliverables
- Agent register + heartbeat path
- Basic remote FS operation path
- Token-based onboarding UX
- Layered memory resolver (with source metadata)
- Loop safeguards (correlation/idempotency/hop/circuit)
- Baseline metrics + trace instrumentation
- Scope-aware audit provenance

### Acceptance tests (minimum)
1. Loop guard trip test
   - inject over-hop loop; breaker trips; provenance logged.
2. Resolver order test
   - conflicting values resolve in correct hierarchy.
3. Locations gating test
   - simulated mesh outage blocks execution path.

### Rollback
- Disable new loop guard enforcement via feature flag
- fall back to prior endpoint handlers
- preserve audit log continuity

---

## Phase 2 — Internal API hardening + Interface normalization

### Deliverables
- Explicit internal API boundaries between Control Core and Transfer Path
- Agent interface normalization across Claude/Gemini/Codex classes
- Threshold-based alarms and dashboards

### Acceptance tests (minimum)
1. Control Core invokes Transfer Path only via contract
2. standardized response envelope across agent types
3. synthetic latency alarm validates threshold pipeline

### Rollback
- route to monolithic legacy path via switch
- disable alarm-driven enforcement if noisy

---

## Phase 3 — Conditional physical split + advanced governance

### Trigger
- one or more threshold classes sustain beyond policy windows.

### Deliverables
- Transfer Path extracted as separate deployable/service
- conflict detection for memory overrides
- TTL enforcement by scope layer
- topology-aware scoping hooks

### Acceptance tests (minimum)
1. split failover with <1% error delta
2. conflict detection + TTL behavior
3. topology-aware gating under mesh fault injection

### Rollback
- traffic shift back to integrated path
- replay-safe queue drain policy
- no audit gap

---

## 8) Error Model Contract (minimum)

All exposed operations must return stable envelopes:
- `code`
- `message`
- `retryable` (boolean)
- `correlation_id`

Class families:
- auth/policy failures (non-retryable)
- topology/unavailable/timeouts (retryable)
- validation/schema failures (non-retryable)
- transient transport failures (retryable)

---

## 9) Execution Rules for Implementers

1. Do not expand scope beyond this contract without approval.
2. Keep local-node workflows backward compatible.
3. Every behavior change must include changelog + release notes update.
4. Commit in logical increments with test evidence.

---

## 10) Definition of Done

Phase is complete only if:
1. deliverables are implemented,
2. acceptance tests pass,
3. rollback path documented and tested,
4. metrics + traces visible,
5. version/changelog/release notes updated.
