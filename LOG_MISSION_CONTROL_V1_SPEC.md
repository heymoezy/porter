# Porter Mission Control Log System — v1 Detailed Spec

**Status:** Draft for implementation handoff to Claude  
**Owner (spec):** OpenClaw  
**Implementation owner:** Claude (code + review)  
**Date:** 2026-03-02

---

## 1) Goal

Replace the current log experience with a **from-scratch, right-pane Mission Control log system** that gives:

1. **Full real-time observability** of Porter internals.
2. **Fast debugging** via correlated traces (UI → API → bridge → model/tool → result).
3. **Proactive detection** of failures/regressions before user impact.
4. **Autonomous remediation workflow** (diagnose automatically, propose/fix safely, escalate risky fixes).

This pane is explicitly for **Moe + Claude + all AI assistants** collaborating on operations/debugging.

---

## 2) Product principles

1. **Truth over cosmetics** — no fake green states; unknown is shown as unknown.
2. **Correlate everything** — every event must be traceable via IDs.
3. **Error-first default** — useful for debugging by default, raw tail one click away.
4. **Safe autonomy** — automatic diagnosis always; automatic code/system mutation only under policy.
5. **Low overhead** — log capture must not degrade app responsiveness.

---

## 3) Scope (v1)

### In scope
- New right-pane Mission Control UI (not patching old log tab).
- Unified structured event pipeline.
- 24h hot retention on disk with rotation.
- Trace correlation model.
- Alert engine + proactive incident creation.
- Bridge handoff protocol for Claude remediation tasks.
- Audit trail for auto-actions.

### Out of scope (v1)
- Distributed tracing across multiple physical hosts.
- Full SIEM integrations.
- Long-term archive (>24h) analytics warehouse.
- Automatic high-risk code deployment.

---

## 4) UX design — Right pane from scratch

## 4.1 Layout (full right pane)

### Header row
- **Mission Control Logs**
- Live indicator (`LIVE` / `PAUSED`)
- Ingest rate (events/sec)
- Error rate (last 5m)
- Controls: `Pause`, `Clear Filters`, `Export`, `Settings`

### Top strip: Debug summary cards (clickable)
- **Critical incidents (open)**
- **Errors (5m / 1h)**
- **Timeouts (5m / 1h)**
- **Bridge failures**
- **Auto-remediations attempted / succeeded / escalated**

### Main body split
- **Left (65%)**: event timeline (virtualized list, newest first)
- **Right (35%)**: details panel for selected event/trace

### Bottom mini-bar
- Retention countdown / disk usage / dropped event count

---

## 4.2 Default view behavior

Default mode = **Debug Focus**:
- Filter: `severity >= warn`
- Group by `trace_id`
- Show only active incidents + latest related events

One-click mode toggle:
- `Debug Focus` ↔ `Live Tail (all events)`

---

## 4.3 Timeline item format

Each row shows:
- timestamp (ms)
- severity badge
- domain badge (`ui/api/bridge/model/task/auth/system`)
- short message
- correlation chips (`trace_id`, `run_id`, `session_id`)
- latency (if present)
- status icon (success/fail/retry)

Expandable inline details:
- structured payload JSON (redacted)
- stack trace (if error)
- related event links

---

## 4.4 Filter/query model

Quick filters:
- Severity: debug/info/warn/error/critical
- Domain
- Backend (claude/gemini/codex/openclaw/ollama)
- Route decision (`auto/manual`)
- Result state (`ok/fail/timeout/no_output`)

Advanced query examples:
- `trace_id:abc123`
- `run_id:9f8e*`
- `domain:bridge severity:error`
- `backend:claude event:dispatch.fail`

Saved filter presets:
- `Bridge Failures`
- `Model Timeouts`
- `Auth / Session Issues`
- `Route Misfires`

---

## 5) Event taxonomy (v1 required)

Every event must include:
- `event_id` (uuid)
- `ts` (unix ms)
- `severity`
- `domain`
- `event_type`
- `message`
- `trace_id`
- optional: `run_id`, `session_id`, `chat_id`, `request_id`, `agent_id`, `backend`, `model`
- optional metrics: `duration_ms`, `tokens_in/out/total`, `retry_count`
- `payload` (structured object)

### Required domains + event types

1. **ui**
- `ui.action`
- `ui.route.change`
- `ui.error`

2. **api**
- `api.request.start`
- `api.request.end`
- `api.request.fail`

3. **bridge**
- `bridge.dispatch`
- `bridge.ack`
- `bridge.token`
- `bridge.complete`
- `bridge.fail`
- `bridge.timeout`

4. **routing**
- `route.decision`
- `route.override`
- `route.fallback`
- `route.misfire`

5. **model**
- `model.invoke.start`
- `model.invoke.end`
- `model.invoke.fail`
- `model.no_output`

6. **task**
- `task.created`
- `task.updated`
- `task.failed`
- `task.remediation.triggered`

7. **auth/security**
- `auth.login.ok`
- `auth.login.fail`
- `auth.unauthorized`
- `secret.redaction.applied`

8. **system**
- `system.health.degraded`
- `system.recovered`
- `system.backpressure`

---

## 6) Correlation model

- Generate `trace_id` at entrypoint (UI send / API request / scheduler tick).
- Propagate trace through all internal calls.
- Bridge/model runs add `run_id` and bind to same `trace_id`.
- Every emitted event must include at least one stable correlation key.

Correlation graph in details pane:
- parent event
- preceding events
- downstream effects
- final outcome

---

## 7) Storage, retention, performance

## 7.1 Storage layout
- `runtime/logs/events-YYYYMMDD-HH.jsonl` (append-only)
- `runtime/logs/index-rolling.sqlite` (query index for UI filters)
- `runtime/logs/incidents.json` (open/closed incident snapshots)

## 7.2 Retention policy
- Keep **24h** hot logs by default.
- Hourly rotation.
- Purge files older than 24h on rotation tick.
- Configurable max disk cap (default 1.5 GB hard cap). If cap reached, oldest segments evicted first.

## 7.3 Performance constraints
- Async event queue (non-blocking).
- Backpressure policy:
  - never drop `error/critical`
  - sampled drop allowed for `debug` with `dropped_count` metric event emitted
- UI virtualized list for high-volume streams.

---

## 8) Redaction and sensitive data policy

Default = robust logging **with secret redaction**.

Always redact:
- auth tokens
- bearer headers
- passwords
- API keys
- cookie/session secrets

Prompt/response payloads:
- Store full text for debugging **unless marked sensitive channel/context**.
- Add config switch for `payload_mode: full | masked | metadata-only`.
- Default for this deployment: `full` + secret redaction.

---

## 9) Alert engine + proactive behavior

## 9.1 Detection rules (v1)

Critical:
- 3+ bridge dispatch failures for same backend in 2m
- auth 401 spike > threshold
- model no-output rate > 25% over 5m
- repeated timeout burst (>=5 in 5m)

Warning:
- route fallback frequency anomaly
- retry storm
- rising p95 latency over baseline

Info:
- recovery detected after incident

## 9.2 Incident lifecycle

Incident states:
- `open`
- `investigating`
- `mitigated`
- `resolved`
- `postmortem_pending`

Incident record includes:
- trigger rule
- affected traces/runs
- confidence
- suggested remediation class

## 9.3 Autonomous remediation policy matrix

Auto-diagnose: **always enabled**.

Auto-remediate allowed (low-risk only):
- restart/retry transient bridge workers
- reroute from failed backend to configured fallback
- clear stuck in-memory queue
- reopen timed-out stream once

Escalate (requires approval gate):
- code changes
- config mutations with security impact
- dependency installs/upgrades
- destructive data operations

---

## 10) Claude handoff protocol (bridge-native)

When critical incident opens:
1. Create remediation task packet with:
   - incident id
   - summary
   - top related traces
   - likely root-cause candidates
   - constrained action policy
2. Dispatch to Claude via bridge.
3. Log Claude ACK/result events tied to same incident.
4. If proposed fix is risky, emit `approval_required` event + UI gate.

Task packet schema (minimal):
```json
{
  "incident_id": "inc_...",
  "severity": "critical",
  "summary": "Bridge failures spiking on backend=claude",
  "trace_refs": ["tr_1", "tr_2"],
  "constraints": {
    "allow_auto_fix": false,
    "allow_low_risk_ops": true
  }
}
```

---

## 11) APIs (v1)

### Ingest
- internal emitter API only (no public write endpoint in v1)

### Read/query
- `GET /api/logs/stream?since=<ts>&filters=...` (SSE)
- `GET /api/logs/query?from=&to=&q=&limit=`
- `GET /api/logs/trace?id=<trace_id>`
- `GET /api/logs/incidents?state=open`
- `GET /api/logs/metrics` (rates/latency/drop stats)

### Actions
- `POST /api/logs/incidents/<id>/ack`
- `POST /api/logs/incidents/<id>/assign` (e.g., claude)
- `POST /api/logs/remediate` (policy-gated)

---

## 12) Right-pane UX acceptance criteria (must pass)

1. Pane loads in <1.5s with 10k recent indexed events.
2. Live stream updates without blocking typing/navigation.
3. Clicking an error reveals full correlated trace path.
4. Filter preset switches in <300ms.
5. Critical incident triggers visible card + timeline marker + remediation packet generation.
6. Export produces reproducible debug bundle (events + trace + incident JSON).

---

## 13) Implementation phases (for Claude)

### Phase 1 — Event foundation
- add structured emitter + queue + jsonl writer + sqlite index
- add correlation ID propagation hooks
- instrument core domains (api/bridge/model/routing)

### Phase 2 — Right-pane UI
- build new Mission Control pane (timeline + details + filters + summary cards)
- remove dependency on legacy log tab rendering paths

### Phase 3 — Alerts/incidents
- implement rule engine + incident records + state transitions
- add proactive cards + remediation CTA controls

### Phase 4 — Autonomous handoff
- implement Claude incident packet workflow
- enforce safety matrix and approval gates

### Phase 5 — Hardening
- load/perf tests
- retention cap tests
- redaction verification
- failover behavior checks

---

## 14) Test plan (minimum)

1. **Unit tests**
- redaction functions
- rule triggers
- incident state transitions
- routing event classification

2. **Integration tests**
- UI action -> API -> bridge -> model -> response trace continuity
- timeout + retry incident generation
- unauthorized request logging semantics

3. **Stress tests**
- 100 events/sec sustained for 10 min
- verify no critical loss, acceptable debug sampling drop, UI remains responsive

4. **Recovery tests**
- restart during active stream
- ensure index resumes and no malformed segments break query

---

## 15) Risks and mitigations

Risk: log volume explosion  
Mitigation: severity-prioritized backpressure + cap + sampling only on debug.

Risk: sensitive leakage  
Mitigation: mandatory redaction pass before persistence.

Risk: noisy false alerts  
Mitigation: warm-up thresholds + debounce windows + incident dedup.

Risk: autonomous loop instability  
Mitigation: bounded retries + remediation cooldown + approval gates.

---

## 16) Handoff instruction for Claude (copy/paste)

Implement `LOG_MISSION_CONTROL_V1_SPEC.md` in strict tranche order (Phase 1 -> 5).  
No unrelated UI modifications.  
Return after each phase with:
- files changed
- API changes
- screenshots/gifs of pane behavior
- perf numbers
- open risks

---

## 17) Definition of done (v1)

Done means Moe can open one pane and, within seconds:
1. See what is breaking now,
2. Trace why it broke end-to-end,
3. Trigger/observe safe autonomous remediation,
4. Export a complete debug packet for rapid iteration.
