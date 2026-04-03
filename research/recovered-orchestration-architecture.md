# Cascade v0.2 — Porter as Orchestration Layer
## Reframing the architecture for SaaS + multi-agent operation

## Executive answer
You are not thinking about this the wrong way.

The stronger model is:
- **Porter = orchestration control plane**
- **OpenClaw / Claude Code / others = execution agents**

Instead of asking "which agent should orchestrate?", make orchestration a shared platform capability in Porter.

---

## 1) Updated thesis
Old framing:
- One agent orchestrates all other models/tools.

New framing:
- Porter owns policies, routing, memory pointers, checkpoints, and handoff.
- Agents connect to Porter and execute tasks under Porter policy.

Result:
- consistency across agents
- lower token waste
- fewer lock-in risks
- better operational auditability

---

## 2) Why Porter should orchestrate
1. **Neutral control layer**
   - No single agent becomes the bottleneck or single point of failure.
2. **Policy consistency**
   - Same cost/quality/compliance policy applies whether task runs via OpenClaw or Claude.
3. **Multi-device continuity**
   - VPS and Mac mini agents share one runtime state and memory pointers.
4. **Interruption resilience**
   - Checkpoint/recover handled by Porter, not tied to one agent runtime.
5. **Commercial leverage**
   - This is product-level differentiation for Porter SaaS.

---

## 3) New architecture (control plane + workers)
## Control plane (Porter)
- Task registry
- Policy engine
- Router
- Checkpoint runtime
- Memory pointer index
- Entitlement and permissions
- Audit and usage monitoring

## Worker plane (Agents)
- OpenClaw worker
- Claude Code worker
- Local model worker
- Future provider workers

Workers receive task packets, execute, and write progress back to Porter.

---

## 4) Policy engine model
Porter policy decides routing using user profile + task attributes.

### User strategy profiles
- Cost-sensitive
- Balanced
- Speed-first
- Quality-first
- Local-first (near-zero marginal token cost)

### Task constraints
- Compliance sensitivity
- Deadline urgency
- Required tool access
- Required context size
- Allowed providers

Routing output:
- selected worker
- fallback order
- checkpoint frequency
- max spend/usage boundary

---

## 5) Learning feedback loop (your key point)
Yes, this can work in SaaS safely.

## Feedback data to capture
- task type
- selected worker
- latency
- quality outcome (pass/fail/user rating)
- cost/token footprint
- retries/fallbacks

## Learning loop
1. Porter logs outcomes.
2. Porter updates routing confidence and defaults.
3. Future similar tasks route better.

Important in SaaS:
- learning should be tenant-scoped by default
- optional global anonymized learning only with explicit opt-in

---

## 6) SaaS-safe design
### Tenant isolation
- each tenant has separate task, memory, policy, and audit namespaces

### Data boundaries
- never mix customer memory vectors/pointers across tenants
- redact sensitive payloads from telemetry by default

### Configurable intelligence
- each tenant can choose static policy mode or adaptive routing mode

### Explainability
For each routed task show:
- why this worker was selected
- which policy rule applied
- fallback path if blocked

---

## 7) Practical operating model
## Minimum viable orchestrator in Porter
1. Universal task object
2. Worker adapters (OpenClaw + Claude first)
3. Policy-based assignment
4. Checkpoint + lease + resume
5. Handoff packet generation

## Then add
6. Usage-aware scheduling
7. Dynamic concurrency limits
8. Adaptive routing from observed outcomes

---

## 8) Key product distinction
Mission control dashboards mostly observe.

Porter should both:
- **observe** (status, usage, alerts)
- **decide and steer** (route, pause, resume, handoff, prioritize)

That makes Porter an orchestration product, not just a monitoring panel.

---

## 9) Risks and mitigations
### Risk: over-automation early
Mitigation:
- start with policy-assisted routing, not full autonomy

### Risk: user trust loss from opaque decisions
Mitigation:
- explain every routing decision with rule trace

### Risk: cross-agent inconsistency
Mitigation:
- mandatory checkpoint contract + shared task schema

### Risk: compliance exposure
Mitigation:
- conservative mode for regulated workflows
- strict audit trail for overrides and escalations

---

## 10) Updated Cascade direction
Cascade should evolve from "multi-model stack" into:

**Cascade = Porter Orchestration Engine**
- routing policies
- execution adapters
- checkpoint resilience
- memory-efficient context retrieval
- cost/quality/compliance optimization

In short: Cascade becomes the orchestration brain inside Porter.

---

## 11) Immediate next decisions
1. Should adaptive routing be on by default or opt-in?
2. Should compliance-mode hard override all other strategy profiles?
3. Should user be able to pin specific tasks to a worker manually?
4. What telemetry is allowed for learning in SaaS by default?
