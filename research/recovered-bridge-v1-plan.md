# Porter Bridge v1 — Comprehensive Implementation Plan

**Document purpose:** Implementation-ready blueprint for Claude to build `porter-bridge` quickly and safely.  
**Requested by:** Moe  
**Prepared by:** OpenClaw  
**Date:** 2026-03-02  
**Scope:** Standalone bridge service + CLI, model/provider agnostic, independent of Porter UI.

---

## 0) Executive summary

Build `porter-bridge` as a standalone orchestration + communication layer that can:
1. Discover local AI providers/models automatically,
2. Dispatch prompts/tasks to any enabled provider via one normalized interface,
3. Track full run lifecycle with correlation IDs,
4. Stream events/logs for observability,
5. Trigger safe autonomous remediations,
6. Expose APIs and CLI commands that Porter UI can consume (but not depend on).

**Non-negotiables:**
- No hardcoded machine assumptions
- 24h hot retention with rotation
- Structured event schema + traceability
- Redaction of secrets
- Approval gate for high-risk actions

---

## 1) System architecture (v1)

## 1.1 Components

### A) Bridge Core Service (`porter-bridge daemon`)
Responsibilities:
- Provider registry/discovery
- Dispatch scheduler
- Run store and state transitions
- Event bus / incident engine
- Policy enforcement (routing + remediation)
- HTTP API + SSE stream

### B) Provider Adapters
Initial adapters:
- `openclaw`
- `ollama`
- `claude-cli`
- `codex-cli`
- `gemini-cli`

Each adapter implements same interface:
- `probe()`
- `listModels()`
- `invoke(request)`
- `stream(request)` (optional in v1, required where possible)
- `cancel(runId)`

### C) CLI (`porter-bridge`)
Responsibilities:
- Operator and automation interface
- Dispatch and status retrieval
- Tail logs/events
- Manage providers/config/incidents

### D) Optional Consumer (Porter UI)
Porter reads from bridge APIs only. No reverse dependency.

---

## 1.2 Data flow

1. User/agent calls `dispatch` (CLI or API)
2. Core creates `run_id`, `trace_id`, persists run as `queued`
3. Router chooses provider/model (manual or auto)
4. Adapter executes invocation
5. Core updates state transitions and emits events
6. Result stored + retrievable via API/CLI
7. Alerts/incidents evaluated continuously
8. Remediation workflow may trigger based on policy

---

## 2) Tech constraints and choices

- Language: Python (match Porter codebase velocity)
- Persistence:
  - SQLite for run metadata + indexed queries
  - JSONL segments for raw event stream
- Transport:
  - HTTP REST for sync operations
  - SSE for stream/tail
- Process model:
  - Single daemon process with worker threads + async-safe queue
- Packaging:
  - pip-installable console script: `porter-bridge`

---

## 3) Directory / module layout

```text
porter_bridge/
  __init__.py
  main.py                 # CLI entry
  daemon.py               # service bootstrap
  config.py               # load/validate config
  auth.py                 # token auth + RBAC
  schemas.py              # pydantic/dataclass schemas
  ids.py                  # run/trace/event id helpers

  api/
    server.py             # HTTP routes
    sse.py                # event stream
    handlers_dispatch.py
    handlers_runs.py
    handlers_providers.py
    handlers_incidents.py
    handlers_health.py

  core/
    dispatcher.py         # dispatch orchestration
    router.py             # auto-route + fallback
    run_store.py          # run persistence + transitions
    event_bus.py          # emit/subscribe
    incident_engine.py    # detection + lifecycle
    remediation.py        # policy-gated auto actions
    redaction.py          # secret masking

  adapters/
    base.py
    openclaw.py
    ollama.py
    claude_cli.py
    codex_cli.py
    gemini_cli.py

  storage/
    sqlite.py
    jsonl.py
    retention.py

  tests/
    unit/
    integration/
    stress/
```

---

## 4) Configuration spec

Config file: `~/.porter-bridge/config.json`

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 18888
  },
  "auth": {
    "service_token": "<long-random-token>",
    "roles": {
      "service": ["dispatch", "read_runs", "read_events"],
      "operator": ["dispatch", "read_all", "incident_ack", "remediate_low_risk"],
      "admin": ["*"]
    }
  },
  "retention": {
    "hours": 24,
    "max_disk_mb": 1536
  },
  "routing": {
    "mode": "auto",
    "fallback_chain": ["openclaw", "claude-cli", "gemini-cli", "codex-cli", "ollama"],
    "default_model_map": {
      "ollama": "qwen2.5-coder:1.5b"
    }
  },
  "providers": {
    "auto_discover": true,
    "enabled": {
      "openclaw": true,
      "ollama": true,
      "claude-cli": true,
      "codex-cli": true,
      "gemini-cli": true
    }
  },
  "logging": {
    "payload_mode": "full",
    "redact_secrets": true,
    "min_severity": "debug"
  },
  "remediation": {
    "auto_diagnose": true,
    "auto_fix_low_risk": true,
    "require_approval_high_risk": true,
    "cooldown_seconds": 120
  }
}
```

---

## 5) Canonical schemas

## 5.1 Run record

```json
{
  "run_id": "run_01...",
  "trace_id": "tr_01...",
  "status": "queued|running|acked|streaming|completed|failed|timeout|cancelled",
  "provider": "claude-cli",
  "model": "claude-opus-4.1",
  "prompt_hash": "sha256...",
  "created_at": 1772400000000,
  "started_at": 1772400000200,
  "ended_at": 1772400005300,
  "duration_ms": 5100,
  "tokens": {"input": 123, "output": 456, "total": 579},
  "error": {"code": null, "message": null, "retryable": false},
  "result_preview": "...",
  "meta": {"initiator": "service", "route_mode": "auto"}
}
```

## 5.2 Event record

```json
{
  "event_id": "evt_01...",
  "ts": 1772400000311,
  "severity": "debug|info|warn|error|critical",
  "domain": "bridge",
  "event_type": "bridge.dispatch",
  "message": "Dispatched run to claude-cli",
  "trace_id": "tr_01...",
  "run_id": "run_01...",
  "session_id": null,
  "provider": "claude-cli",
  "model": "claude-opus-4.1",
  "duration_ms": null,
  "payload": {"route_reason": "manual override"}
}
```

## 5.3 Incident record

```json
{
  "incident_id": "inc_01...",
  "state": "open|investigating|mitigated|resolved|postmortem_pending",
  "severity": "warn|error|critical",
  "rule_id": "bridge_fail_burst",
  "summary": "Bridge failures spiking on provider=claude-cli",
  "opened_at": 1772401000000,
  "updated_at": 1772401015000,
  "trace_refs": ["tr_..."],
  "run_refs": ["run_..."],
  "auto_actions": [
    {"action": "reroute", "status": "success", "ts": 1772401010000}
  ],
  "escalation": {"required": true, "reason": "code_change_needed"}
}
```

---

## 6) API contract (v1)

Base: `/v1`

### Auth
All endpoints require `Authorization: Bearer <token>` except optional local health ping.

### Endpoints

1. `POST /v1/dispatch`
- input: `{prompt, provider?, model?, timeout?, metadata?}`
- behavior: provider optional; if absent, auto-route
- output: `{ok, run_id, trace_id, provider, status}`

2. `GET /v1/runs/{run_id}`
- output: full run record

3. `GET /v1/runs?status=&provider=&since=&limit=`
- output: paginated run list

4. `GET /v1/providers`
- output: provider health + models + capabilities

5. `POST /v1/providers/scan`
- output: refreshed registry diff

6. `GET /v1/events/stream?since=&severity=&domain=`
- SSE output of event records

7. `GET /v1/incidents?state=open`
- output: incident list

8. `POST /v1/incidents/{incident_id}/ack`
- output: updated incident

9. `POST /v1/remediate`
- input: `{incident_id, action}`
- output: action result (blocked if policy disallows)

10. `GET /v1/health`
- output: service health + queue stats + drop stats

---

## 7) CLI contract (v1)

```bash
porter-bridge daemon start|stop|status
porter-bridge providers list
porter-bridge providers scan
porter-bridge models list [--provider <id>]
porter-bridge dispatch --prompt "..." [--provider <id>] [--model <id>] [--timeout 60]
porter-bridge run get <run_id>
porter-bridge runs list [--status failed] [--provider claude-cli] [--since 15m]
porter-bridge tail [--follow] [--severity warn] [--domain bridge]
porter-bridge incidents list [--state open]
porter-bridge incidents ack <incident_id>
porter-bridge remediate --incident <id> --action reroute
porter-bridge config get <path>
porter-bridge config set <path> <value>
porter-bridge health
```

Output mode:
- default human-readable
- `--json` for machine automation

---

## 8) Provider adapter requirements

## 8.1 Adapter base interface

```python
class ProviderAdapter:
    id: str
    def probe(self) -> ProviderHealth: ...
    def list_models(self) -> list[ModelInfo]: ...
    def invoke(self, req: InvokeRequest) -> InvokeResult: ...
    def stream(self, req: InvokeRequest) -> Iterator[TokenEvent]: ...
    def cancel(self, run_id: str) -> bool: ...
```

## 8.2 Provider-specific notes

### openclaw
- Prefer gateway HTTP if configured
- Capture auth/timeout errors with explicit error codes

### ollama
- probe `/api/tags`
- model list from tags
- default model from config, fallback first available

### claude-cli/codex-cli/gemini-cli
- probe binary availability + version
- deterministic non-interactive invocation mode
- parse outputs into normalized `text/tokens/errors`

---

## 9) Routing engine logic

Priority order:
1. explicit provider/model in request
2. policy override (incident-driven disable/avoid)
3. auto-route scoring by:
   - provider health
   - recent error rate
   - expected latency
   - capability match
4. fallback chain

Emit `route.decision` event including:
- selected provider
- candidates considered
- rejection reasons
- confidence score

---

## 10) Incident engine rules (v1)

Rule IDs:
- `bridge_fail_burst`
- `timeout_burst`
- `no_output_ratio_high`
- `auth_failure_spike`
- `retry_storm`
- `latency_regression_p95`

Each rule defines:
- sliding window
- threshold
- cooldown
- severity mapping
- default remediation suggestions

Dedup strategy:
- same rule+provider open incident deduplicates into existing incident window

---

## 11) Autonomous remediation (safe)

Low-risk actions allowed automatically:
- `retry_run_once`
- `reroute_provider`
- `restart_provider_worker`
- `clear_stuck_queue`

High-risk actions (approval required):
- file/code mutation
- config security changes
- package install/uninstall
- external side effects

Policy enforcement:
- action request evaluated by policy matrix
- blocked actions emit `remediation.blocked` event

---

## 12) Logging pipeline details

## 12.1 Write path
- In-memory queue receives events
- Worker thread writes JSONL segment
- Async indexer writes SQLite rows for query keys

## 12.2 Rotation
- Segment per hour: `events-YYYYMMDD-HH.jsonl`
- On each rotation: purge older than 24h
- If disk cap exceeded: evict oldest segments and emit `system.backpressure`

## 12.3 Redaction
Apply redaction before persistence:
- token-like patterns
- auth headers
- password fields
- known secret key names

---

## 13) Security and access model

- Service token required for non-local operations
- Token scopes by role
- Audit every API write action
- Optional bind loopback-only default
- Explicit CORS deny by default for bridge service

---

## 14) Test strategy (detailed)

## 14.1 Unit
- schema validation
- router scoring and fallback
- incident trigger/debounce
- redaction correctness
- policy enforcement

## 14.2 Integration
- dispatch -> run complete flow per provider
- timeout and no-output classification
- incident open/ack/resolve lifecycle
- SSE event continuity and reconnection

## 14.3 Performance
- 100 events/sec sustained 10 min
- query p95 < 250ms on 24h dataset
- memory bounded under stress

## 14.4 Failure injection
- provider hard fail
- malformed output parse
- sqlite lock contention
- disk full simulation

---

## 15) Rollout plan (tranches)

### Tranche 1: Core skeleton
- daemon bootstrap
- config/auth skeleton
- run store + dispatch endpoint (single provider first)

### Tranche 2: Adapters + auto-discovery
- implement all 5 adapters
- provider scan/list endpoints

### Tranche 3: Events + retention
- event bus + jsonl writer + sqlite index
- SSE stream + rotation

### Tranche 4: Incidents + remediation
- rule engine + incident store
- low-risk remediation actions

### Tranche 5: CLI completeness
- all commands + JSON output modes
- docs and examples

### Tranche 6: Porter integration (read-only consumer)
- Porter points to bridge APIs for status/logs/incidents
- no tight coupling

---

## 16) Migration and compatibility

- Existing Porter log tab can coexist temporarily as legacy.
- New pane should point to bridge endpoints once available.
- Keep legacy paths behind feature flag until parity reached.

Feature flags:
- `bridge_v1_enabled`
- `bridge_incidents_enabled`
- `bridge_autoremediate_enabled`

---

## 17) Deliverables from Claude each tranche

1. Files changed
2. API changes
3. CLI command demo output
4. Test results (unit/integration)
5. Known risks
6. Next tranche plan

---

## 18) Done criteria (v1)

`porter-bridge` is considered v1-ready when:
1. It runs fully without Porter UI.
2. It auto-discovers installed providers/models reliably.
3. It dispatches and tracks runs end-to-end with run/trace IDs.
4. It emits queryable real-time events with 24h retention.
5. It opens incidents proactively and executes only policy-safe remediations.
6. Porter can consume it as a client, not as a dependency.

---

## 19) Copy-paste implementation prompt for Claude

Implement `PORTER_BRIDGE_V1_IMPLEMENTATION_PLAN.md` exactly in tranche order.

Constraints:
- No unrelated UI work.
- No hardcoded local machine assumptions.
- Structured logs + redaction required from tranche 1 onward.
- Return after each tranche with evidence (tests + sample command outputs).
- If blocked, stop and propose smallest unblock path.
