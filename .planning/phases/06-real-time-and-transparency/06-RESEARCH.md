# Phase 06: Real-Time and Transparency - Research

**Researched:** 2026-03-21
**Domain:** SSE push infrastructure, real-time frontend patterns, system health monitoring, decision logging
**Confidence:** HIGH

## Summary

Porter already has a working SSE hub in porter.py (`_emit_event` + `/api/events`) and a frontend SSE bus (`_sseBus`). Phase 5 introduced the first TypeScript SSE consumer (`useProjectActivity.ts`) that opens its own `EventSource` per component — a pattern this phase must centralize. The primary implementation challenge is threefold: (1) consolidating the frontend to a single shared `EventSource` connection instead of per-component instances, (2) adding six new fine-grained event types to the existing porter.py emission pipeline, and (3) exposing a porter.py `/api/events/emit` POST endpoint that scheduler.ts already calls but which does not yet exist in porter.py.

There are six confirmed `setInterval` pollers in porter.py JavaScript that must be killed and replaced with SSE subscriptions. The Fastify-side `events.ts` currently uses WebSocket (`@fastify/websocket`), not SSE — this is a conflict with the CONTEXT.md decision to extend the porter.py SSE hub and add a Fastify SSE route alongside it. The Fastify events route must be rewritten from WebSocket to proper SSE.

For the new features: the agent activity feed extends Phase 5's `ActivityFeed.tsx` with a three-section layout (Active/Completed/Queued). The system health panel queries AI backends, SQLite, and external APIs on a 30s heartbeat pushed via SSE. The decision log requires a new SQLite table (`decision_log`) and a Fastify v1 route to persist and serve routing decisions in plain-English format.

**Primary recommendation:** Implement a singleton SSE provider in the React app that all hooks subscribe to, add `/api/events/emit` to porter.py, kill all six pollers with targeted SSE handler replacements, and build the three new UI features (activity feed sections, health panel, decision log) as extensions of existing components.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Agent Activity Feed (TRNS-01)
- Inline real-time stream embedded in project dashboard (extend Phase 5's ActivityFeed component)
- Each entry shows: action summary + expandable detail on click
- Grouped by agent with time-ordered entries within each agent
- Three sections: Active (now), Completed (today), Queued (next) — clear state machine
- Agent status strip (Phase 5) already shows per-agent state — feed adds the detail layer beneath

#### System Health Panel (TRNS-02)
- Dedicated panel accessible from settings/admin area — not cluttering main workspace
- Monitor all AI backends (Claude, Gemini, OpenClaw, Ollama) + SQLite DB + any external API connections
- Token usage: per-model running totals with daily/weekly rollups — actionable for cost management
- Updates via SSE push for status changes, 30s heartbeat for latency metrics
- Service cards with colored status dots (green/yellow/red) — consistent with existing backend health patterns

#### Decision Log (TRNS-03)
- Visible to all users in non-technical language (success criterion 4)
- Dual presentation: contextual tooltips on agent/model badges + dedicated filterable log view
- Log three decision types: model selection ("Used Claude because…"), agent routing ("Assigned to Writer because…"), task skipping ("Skipped task because…")
- Keep all decisions, paginated oldest-first — debugging needs full history
- Each entry: timestamp, decision type, chosen option, reasoning (1 sentence), alternatives considered

#### SSE Migration (PERF-03)
- Replace all `setInterval` polling with SSE event listeners — keep 60s fallback for missed events (proven pattern from v0.30.x)
- Extend existing porter.py SSE hub (`/api/events` at line 49599) — don't create a second hub
- Also add Fastify SSE route for v1 API consumers (gradual migration)
- Fine-grained typed events: `agent:status`, `agent:activity`, `system:health`, `decision:made`, `project:update`, `memory:change`
- Frontend: single `EventSource` connection, client-side event type filtering (already using this pattern via `_sseBus`)
- Target: 80% reduction in idle HTTP requests (success criterion 5)

### Claude's Discretion
- Exact health panel layout and card arrangement
- Decision log tooltip positioning and interaction
- SSE reconnection backoff strategy
- Activity feed animation/transition details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRNS-01 | Agent activity feed — real-time: what agents are doing now, did today, what's queued | `agent_activity` table exists in schema; `ActivityFeed.tsx` is the extension base; three-section layout maps to `status IN ('running','complete','pending')` on `agent_jobs` |
| TRNS-02 | System health panel — which services are up, token usage, response times | Fastify ai-router.ts already probes backends; new `system:health` SSE events push status; new `/api/v1/health` endpoint aggregates and serves |
| TRNS-03 | Decision log — why Porter chose X model, routed to Y agent, skipped Z task | Requires new `decision_log` SQLite table + migration; `_emit_event('decision:made', ...)` hooks into porter.py dispatch bridge; new `/api/v1/decisions` Fastify route |
| PERF-03 | SSE real-time hub replacing polling with server-sent events for live updates | 6 confirmed pollers at lines 20976, 23579, 25856, 25942, 26148, 29951; `/api/events/emit` POST missing from porter.py; Fastify events.ts uses WebSocket — must rewrite to SSE |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `EventSource` (Web API) | Browser native | Single shared SSE connection in React | Already used in useProjectActivity.ts and porter.py's `_sseBus` |
| `framer-motion` | Already installed (Phase 5) | Activity feed entry animations | Already imported in AgentStatusStrip.tsx |
| React Query (`@tanstack/react-query`) | Already installed | Query invalidation on SSE events; health panel polling fallback | Already used in ProjectDashboard.tsx |
| Zustand | Already installed | Shared SSE subscription state across components | Already used in app.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AbortController` (Web API) | Browser native | SSE reconnection timeout in hook cleanup | Use in useSSEHub for teardown on unmount |
| SQLite `INTEGER DEFAULT 0` | n/a | Token usage counters per model | Aggregate in decision_log or new token_usage table |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single shared `EventSource` context | Per-component `EventSource` | Per-component is Phase 5's pattern — works but creates N connections per page; singleton reduces to 1 |
| Porter.py SSE hub extension | Second Fastify SSE hub | CONTEXT.md forbids second hub; porter.py hub is the source of truth |
| Plain `EventSource` global | WebSocket upgrade | WebSocket is bidirectional; SSE is simpler and already the established porter pattern |

**Installation:** No new packages needed. All dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── providers/
│   └── SSEProvider.tsx          # Singleton EventSource context (new)
├── hooks/
│   ├── useSSEHub.ts             # Subscribe to named event types (new)
│   ├── useProjectActivity.ts    # REFACTOR: consume useSSEHub instead of own EventSource
│   ├── useSystemHealth.ts       # new
│   └── useDecisionLog.ts        # new
├── modules/
│   ├── projects/
│   │   ├── ActivityFeed.tsx     # EXTEND: three-section layout
│   │   └── AgentStatusStrip.tsx # EXTEND: live status update via SSE
│   └── health/
│       └── SystemHealthPanel.tsx # new
└── components/
    └── DecisionTooltip.tsx      # new — contextual decision badge

backend/src/
├── routes/v1/
│   ├── health.ts               # GET /api/v1/health — service status aggregate
│   └── decisions.ts            # GET /api/v1/decisions — paginated decision log
├── db/
│   └── migrate-06.ts           # decision_log table + token_usage_daily table
└── routes/
    └── events.ts               # REWRITE: WebSocket → SSE (text/event-stream)

porter.py patches (via /tmp/patch_06_*.py):
- Add /api/events/emit POST endpoint (line ~49637 area)
- Add decision:made emission to _bridge_dispatch() (line ~44633)
- Kill 6 setInterval pollers (lines 20976, 23579, 25856, 25942, 26148, 29951)
- Add system:health periodic emission
```

### Pattern 1: Singleton SSE Provider

**What:** A React context that owns exactly one `EventSource` connection for the entire app lifetime. Components never create their own `EventSource` — they subscribe via a hook.

**When to use:** Any component that needs real-time data from the server.

**Example:**
```typescript
// frontend/src/providers/SSEProvider.tsx
// Source: established pattern from porter.py _sseBus (line 38469)
import { createContext, useContext, useEffect, useRef } from 'react';

type Handler = (data: unknown) => void;

interface SSEBus {
  subscribe: (eventType: string, handler: Handler) => () => void;
}

const SSEContext = createContext<SSEBus | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        const type: string = payload.type;
        listenersRef.current.get(type)?.forEach(fn => fn(payload));
        // Also fire wildcard listeners
        listenersRef.current.get('*')?.forEach(fn => fn(payload));
      } catch { /* ignore parse errors */ }
    };

    // Named event types (for EventSource named events)
    const TYPED_EVENTS = [
      'agent:status', 'agent:activity', 'system:health',
      'decision:made', 'project:update', 'memory:change'
    ];
    TYPED_EVENTS.forEach(type => {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          listenersRef.current.get(type)?.forEach(fn => fn(payload));
        } catch { /* ignore */ }
      });
    });

    return () => { es.close(); esRef.current = null; };
  }, []);

  const bus: SSEBus = {
    subscribe: (eventType, handler) => {
      if (!listenersRef.current.has(eventType)) {
        listenersRef.current.set(eventType, new Set());
      }
      listenersRef.current.get(eventType)!.add(handler);
      return () => listenersRef.current.get(eventType)?.delete(handler);
    }
  };

  return <SSEContext.Provider value={bus}>{children}</SSEContext.Provider>;
}

export const useSSEBus = () => {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error('useSSEBus must be used within SSEProvider');
  return ctx;
};
```

### Pattern 2: Killing a setInterval Poller

**What:** Replace a `setInterval` with an SSE subscription + 60s missed-event fallback.

**When to use:** Each of the 6 confirmed pollers.

**Example (porter.py JavaScript — poller at line 23579):**
```javascript
// BEFORE:
if (!_projActivityPoller) {
  _projActivityPoller = setInterval(function() {
    if (_currentModule === 'projects' && detail && ...) _projReload(window._projCurrent.id);
  }, 30000);
}

// AFTER — SSE replaces poll; 60s fallback fires only when SSE missed event
var _projActivityFallback = null;
function _resetProjActivityFallback() {
  if (_projActivityFallback) clearTimeout(_projActivityFallback);
  _projActivityFallback = setTimeout(function() {
    if (_currentModule === 'projects' && window._projCurrent) _projReload(window._projCurrent.id);
  }, 60000);
}
// Wire into existing SSE subscription (_projActivitySseId already exists)
// Each relevant SSE event resets the fallback timer
```

### Pattern 3: `/api/events/emit` POST endpoint in porter.py

**What:** An authenticated POST endpoint that accepts `{event: string, data: object}` and calls `_emit_event()`. This is what scheduler.ts's `emitSSE()` calls at `${config.porterPyUrl}/api/events/emit`.

**When to use:** Any Fastify/TypeScript service that needs to push events through the porter.py SSE hub.

**Example:**
```python
# porter.py — add after line 49636 (end of /api/events block)
elif parsed.path == "/api/events/emit" and self.command == "POST":
    if not self.auth_check(redirect=False): return
    length = int(self.headers.get("Content-Length", 0))
    body = json.loads(self.rfile.read(length)) if length else {}
    event_type = str(body.get("event", ""))
    data = body.get("data", {})
    if event_type:
        _emit_event(event_type, data)
    self.reply_json({"ok": True})
```

### Pattern 4: Decision Log Emission in porter.py

**What:** Call `_emit_event('decision:made', {...})` inside `_bridge_dispatch()` and the GSD routing logic. Each emission also writes to the `decision_log` SQLite table via a helper.

**When to use:** Immediately after model selection, agent routing decision, or task skip decision.

**Example:**
```python
# In _bridge_dispatch() after backend selection (around line 44633)
def _log_decision(decision_type, chosen, reasoning, alternatives=None):
    """Write decision to SQLite and push via SSE."""
    conn = _get_db()
    conn.execute(
        """INSERT INTO decision_log (decision_type, chosen, reasoning, alternatives, created_at)
           VALUES (?, ?, ?, ?, unixepoch('now'))""",
        (decision_type, chosen, reasoning, json.dumps(alternatives or []))
    )
    conn.commit()
    _emit_event("decision:made", {
        "decision_type": decision_type,
        "chosen": chosen,
        "reasoning": reasoning,
        "alternatives": alternatives or [],
    })
```

### Pattern 5: Fastify SSE Route (rewrite events.ts)

**What:** Replace the WebSocket handler in `backend/src/routes/events.ts` with a proper SSE handler. The Fastify route proxies to porter.py's `/api/events` so v1 consumers get the same stream.

**When to use:** Fastify v1 API consumers that need SSE.

**Example:**
```typescript
// backend/src/routes/events.ts — rewrite
import { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export default async function eventRoutes(fastify: FastifyInstance) {
  // Proxy SSE to porter.py hub — keeps single source of truth
  fastify.get('/api/events', async (request, reply) => {
    // Forward auth cookies + stream through from porter.py
    const upstream = await fetch(`${config.porterPyUrl}/api/events`, {
      headers: { cookie: request.headers.cookie || '' },
    });
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    });
    // Pipe upstream body to response
    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
        reply.raw.end();
      };
      request.raw.on('close', () => reader.cancel());
      pump().catch(() => reply.raw.end());
    }
  });

  // Emit endpoint for internal use (Fastify services -> porter.py hub)
  fastify.post('/api/events/emit', async (request, reply) => {
    const body = request.body as { event: string; data: Record<string, unknown> };
    await fetch(`${config.porterPyUrl}/api/events/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: request.headers.cookie || '' },
      body: JSON.stringify(body),
    });
    return { ok: true };
  });
}
```

### Anti-Patterns to Avoid

- **Multiple EventSource instances per page:** Phase 5's `useProjectActivity.ts` opens its own `EventSource`. After SSEProvider is in place, refactor this hook to consume `useSSEBus` instead. Never open a new `EventSource` in a hook.
- **Blocking SSE emission:** `_emit_event()` in porter.py acquires `_event_lock` to iterate queues — never call it from inside a queue consumer or a lock-holding context.
- **Polling removal without fallback:** Don't delete `setInterval` pollers without installing a 60s setTimeout fallback. SSE can drop events on reconnect — the fallback catches what was missed.
- **Decision log on every dispatch:** Not every dispatch needs a decision entry — only when Porter *chose* between multiple options. Single-backend agents don't generate decision entries.
- **Mixing WebSocket and SSE in the same Fastify route:** The current `events.ts` uses `@fastify/websocket` which conflicts with a plain SSE response. The WebSocket plugin must be removed from this route's scope.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE reconnection logic | Custom reconnect timer | Native `EventSource` auto-reconnect | Browser handles exponential backoff automatically; custom timers create duplicate connections |
| Service health probing | Raw HTTP ping loop | Extend existing `getBackends()` in ai-router.ts | ai-router.ts already probes all AI backends with HEAD requests and 405-acceptance logic |
| Token counting | Parse response bodies | Store `tokens_used` already in `agent_jobs` schema | `agent_jobs.tokensUsed` column exists — aggregate with GROUP BY model |
| Activity state machine | Custom Active/Completed/Queued logic | SQL query on `agent_jobs.status` | `status IN ('running') = Active`, `status IN ('complete') = Completed`, `status IN ('pending') = Queued` |
| Decision log full-text search | Inverted index | SQLite LIKE on `reasoning` column | Decision log is small (thousands of rows max); LIKE is fast enough at this scale |

**Key insight:** Nearly every data need in this phase is already collected in the database. The work is wiring SSE emission to existing write paths and building new UI consumers — not building new data pipelines.

---

## Common Pitfalls

### Pitfall 1: Missing `/api/events/emit` Endpoint

**What goes wrong:** scheduler.ts's `emitSSE()` silently fails with HTTP 404 when calling `${porterPyUrl}/api/events/emit` because this endpoint does not exist in porter.py yet. Activity events from the scheduler never reach the frontend SSE stream.

**Why it happens:** The endpoint was designed in Phase 5 as a forward-reference. It was coded in scheduler.ts but the matching porter.py handler was never added.

**How to avoid:** Plan 06-01 (SSE hub) must add this endpoint before any other plan that depends on SSE emission from the Fastify scheduler.

**Warning signs:** `[scheduler] SSE emit ...: HTTP 404` in Fastify logs.

### Pitfall 2: WebSocket vs SSE Conflict in Fastify events.ts

**What goes wrong:** `backend/src/routes/events.ts` currently registers a WebSocket route at `/api/events` using `@fastify/websocket`. Rewriting it to SSE while the plugin is still registered causes a route registration conflict.

**Why it happens:** Fastify registers WebSocket routes with different internal methods than HTTP routes. Removing the WebSocket handler without removing the plugin registration causes a startup error.

**How to avoid:** Remove the `websocket: true` option from the route decorator AND remove the `fastify.register(websocket)` call in `index.ts` if WebSocket is no longer used anywhere else. Verify no other route uses `{ websocket: true }`.

**Warning signs:** `FST_ERR_PLUGIN_NOT_EXIST` or `duplicate route` errors on Fastify startup.

### Pitfall 3: porter.py Edit Tool Fails on ~900KB File

**What goes wrong:** Claude Code's Edit tool silently fails on `porter.py` because the file exceeds the tool's working limit at ~900KB. Patches appear to succeed but are not written.

**Why it happens:** Known constraint documented in MEMORY.md (L4) and porter/CLAUDE.md. The Edit tool has no error on oversized files.

**How to avoid:** All porter.py modifications must use Python patch scripts at `/tmp/patch_06_*.py`. Pattern: read target section, verify line numbers with grep, write replacement block.

**Warning signs:** porter.py appears unchanged after an Edit tool call.

### Pitfall 4: Phase 5's useProjectActivity Opens Its Own EventSource

**What goes wrong:** After SSEProvider is mounted at app root, `useProjectActivity.ts` still opens a second `EventSource` (its own connection), resulting in 2 connections per page load. This defeats the "single connection" goal.

**Why it happens:** useProjectActivity was written before the SSEProvider pattern existed.

**How to avoid:** Refactor `useProjectActivity.ts` as part of 06-02 to consume `useSSEBus()` instead of creating its own EventSource. The effect block (lines 51-87) becomes a `useSSEBus.subscribe(...)` call.

**Warning signs:** Browser devtools Network tab shows 2 connections to `/api/events`.

### Pitfall 5: Decision Log for Every Dispatch

**What goes wrong:** Logging a decision entry for every AI dispatch — including single-backend no-choice dispatches — floods the decision log with noise and makes it useless for non-technical users.

**Why it happens:** The simplest implementation hook is inside `_bridge_dispatch()` which fires for all dispatches.

**How to avoid:** Only emit `decision:made` when Porter selected from multiple available backends. Check `len(available_backends) > 1` before logging. Similarly, only log agent routing decisions when 2+ agents were candidates.

**Warning signs:** Decision log grows at 1 entry per message — most entries say "Used Claude because Claude is the only configured backend."

### Pitfall 6: 30s Health Heartbeat Counting as Active Requests

**What goes wrong:** The 30s SSE heartbeat for health metrics shows up as "active HTTP requests" in the request count baseline, making the 80% reduction metric impossible to measure cleanly.

**Why it happens:** Health heartbeats are push events — they don't come from the frontend initiating requests, but the measurement must distinguish "frontend-originated polling" vs "server-pushed heartbeat."

**How to avoid:** Measure "frontend-initiated outbound HTTP requests" not "total server connections." The SSE connection itself is 1 persistent connection — all heartbeats and pushes travel over it without new HTTP handshakes.

---

## Code Examples

Verified patterns from existing codebase:

### Existing `_emit_event` Signature (porter.py line 46453)
```python
# Source: porter.py line 46453
def _emit_event(event_type, data):
    """Broadcast an event to all connected SSE clients."""
    payload = json.dumps({"type": event_type, "data": data, "timestamp": time.time()})
    with _event_lock:
        for q in _event_queues:
            q.put(payload)
```

### Existing SSE Hub (porter.py lines 49599-49636)
```python
# Source: porter.py line 49599-49636
elif parsed.path == "/api/events":
    # ... sends "welcome" event, then loops with 30s heartbeat
    # Queue-based: each connected client gets its own queue
    # _event_queues is a list; _event_lock is threading.Lock()
```

### Existing emitSSE in scheduler.ts (lines 144-160)
```typescript
// Source: backend/src/services/scheduler.ts lines 144-160
async function emitSSE(eventType: string, data: Record<string, unknown>): Promise<void> {
  // POSTs to ${config.porterPyUrl}/api/events/emit — endpoint doesn't exist yet in porter.py
  // 2s AbortSignal timeout — never blocks scheduler
  // Errors silently swallowed
}
```

### Existing SSE Consumer in useProjectActivity (Phase 5 pattern)
```typescript
// Source: frontend/src/hooks/useProjectActivity.ts lines 51-87
// Opens its own EventSource('/api/events')
// Listens on 'project:activity' and 'agent:activity' named events
// This pattern works but must be refactored to use SSEProvider singleton
```

### agentActivity Schema (Drizzle, schema.ts line 148)
```typescript
// Source: backend/src/db/schema.ts line 148
export const agentActivity = sqliteTable('agent_activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  jobId: text('job_id'),
  projectId: text('project_id'),
  eventType: text('event_type').notNull(),
  summary: text('summary'),
  detail: text('detail'),
  createdAt: real('created_at').default(sql`(unixepoch('now'))`),
});
```

### agent_jobs Status Values (Phase 4 pattern)
```sql
-- Source: backend/src/db/schema.ts agentJobs table
-- status values: 'pending' | 'running' | 'complete' | 'failed'
-- Maps to UI sections: Queued=pending, Active=running, Completed=complete+failed
SELECT status, agent_id, prompt, created_at FROM agent_jobs
WHERE project_id = ? ORDER BY created_at DESC LIMIT 50;
```

### React Query Invalidation on SSE Event
```typescript
// Source: pattern from useProjectActivity.ts — extend to invalidate queries
import { useQueryClient } from '@tanstack/react-query';
const queryClient = useQueryClient();

// In SSE handler:
if (payload.type === 'project:update' && payload.data.project_id === projectId) {
  queryClient.invalidateQueries({ queryKey: ['project', projectId] });
}
// This replaces polling-based staleTime refreshes for project data
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-component EventSource | Singleton SSEProvider context | Phase 6 (new) | 1 connection per app instead of N |
| setInterval polling (30s) | SSE push + 60s fallback | Phase 6 | ~80% fewer idle HTTP requests |
| Porter.py-only SSE events | Porter.py + Fastify emit endpoint | Phase 6 | Scheduler.ts can emit without going through porter.py session |
| WebSocket in Fastify events.ts | SSE text/event-stream | Phase 6 | Matches porter.py's established SSE protocol |

**Deprecated/outdated:**
- `backend/src/routes/events.ts` WebSocket handler: replaced by SSE proxy/emit in this phase
- Phase 5's per-component EventSource in useProjectActivity: refactored to useSSEBus consumer

---

## Open Questions

1. **Token usage data source**
   - What we know: `agent_jobs.tokensUsed` column exists but may not be populated for all dispatch paths
   - What's unclear: Does the current `dispatch()` in ai-router.ts write tokens_used back to agent_jobs? (scheduler.ts `markJobComplete` only writes result/status)
   - Recommendation: Check ai-router.ts dispatch return value; if tokens not returned, health panel shows "N/A" for token usage initially with a TODO for Phase 7

2. **Health panel placement — settings vs. sidebar tab**
   - What we know: CONTEXT.md says "dedicated panel accessible from settings/admin area — not cluttering main workspace"
   - What's unclear: There is no settings/admin area in the React frontend yet (Layout.tsx has placeholder stubs for most tabs). The porter.py admin module exists but is legacy JS.
   - Recommendation: Add a `health` tab to the React sidebar TabId list; render SystemHealthPanel at `/v2` when active. This is within Claude's discretion per CONTEXT.md.

3. **Fastify event route — proxy vs. rewrite**
   - What we know: porter.py is the SSE hub; Fastify events.ts currently uses WebSocket (wrong protocol)
   - What's unclear: Whether proxying SSE from Fastify to porter.py will work reliably with `@fastify/http-proxy` (backpressure, chunked encoding)
   - Recommendation: Use native `fetch()` stream reader (shown in Pattern 5) rather than `@fastify/http-proxy` which has known SSE buffering issues

---

## Validation Architecture

nyquist_validation is enabled in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python + requests (ad-hoc, /tmp only per Phase 2/4 convention) |
| Config file | none — scripts at /tmp/ per convention |
| Quick run command | `python3 /tmp/test_phase06_smoke.py` |
| Full suite command | `python3 /tmp/test_phase06_full.py && cd /home/lobster/documents/porter/tests && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRNS-01 | Agent activity appears in feed within 2s of agent_activity INSERT | smoke | `python3 /tmp/test_trns01_activity_feed.py` | Wave 0 |
| TRNS-01 | Three sections (Active/Completed/Queued) render in ActivityFeed | unit/visual | npx playwright test (visual assertion) | Wave 0 |
| TRNS-02 | /api/v1/health returns status for all configured backends | smoke | `python3 /tmp/test_trns02_health.py` | Wave 0 |
| TRNS-02 | system:health SSE event emitted within 35s of startup | smoke | `python3 /tmp/test_trns02_sse_health.py` | Wave 0 |
| TRNS-03 | decision_log table exists and INSERT works | unit | `python3 /tmp/test_trns03_decision_log.py` | Wave 0 |
| TRNS-03 | decision:made SSE event fires when dispatch chooses from 2+ backends | smoke | `python3 /tmp/test_trns03_sse_decision.py` | Wave 0 |
| PERF-03 | /api/events/emit POST returns 200 and broadcasts via SSE | smoke | `python3 /tmp/test_perf03_emit.py` | Wave 0 |
| PERF-03 | All 6 setInterval pollers absent from porter.py source after patch | unit | `python3 /tmp/test_perf03_no_pollers.py` (grep source) | Wave 0 |
| PERF-03 | Idle request count reduced ≥80% vs baseline | load | manual count via devtools | manual-only |

### Sampling Rate
- **Per task commit:** `python3 /tmp/test_phase06_smoke.py` (SSE emit + health endpoint)
- **Per wave merge:** `python3 /tmp/test_phase06_full.py && npx playwright test` (full regression)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `/tmp/test_trns01_activity_feed.py` — verifies SSE event reaches EventSource listener within 2s
- [ ] `/tmp/test_trns02_health.py` — GET /api/v1/health returns {backends: [...], db: {...}}
- [ ] `/tmp/test_trns02_sse_health.py` — connect to /api/events, wait for system:health event within 35s
- [ ] `/tmp/test_trns03_decision_log.py` — verify decision_log table schema + INSERT
- [ ] `/tmp/test_trns03_sse_decision.py` — trigger 2-backend dispatch, verify decision:made SSE event
- [ ] `/tmp/test_perf03_emit.py` — POST /api/events/emit, verify event reaches SSE listener
- [ ] `/tmp/test_perf03_no_pollers.py` — grep porter.py for _projActivityPoller/setInterval patterns

---

## Sources

### Primary (HIGH confidence)
- porter.py lines 46453-46458 — `_emit_event()` implementation (read directly)
- porter.py lines 49599-49636 — SSE hub (`/api/events`) implementation (read directly)
- porter.py lines 20976, 23579, 25856, 25942, 26148, 29951 — 6 confirmed setInterval pollers (read directly)
- `backend/src/services/scheduler.ts` lines 144-184 — `emitSSE()` and `logActivity()` (read directly)
- `backend/src/routes/events.ts` — WebSocket implementation that conflicts with SSE requirement (read directly)
- `frontend/src/hooks/useProjectActivity.ts` — Phase 5 SSE consumer to refactor (read directly)
- `frontend/src/modules/projects/ActivityFeed.tsx` — component to extend (read directly)
- `frontend/src/modules/projects/AgentStatusStrip.tsx` — component to extend (read directly)
- `backend/src/db/schema.ts` — agentActivity and agentJobs schema (read directly)
- `backend/src/config.ts` — featureFlags.sseRealtime already defined (read directly)

### Secondary (MEDIUM confidence)
- `.planning/phases/06-real-time-and-transparency/06-CONTEXT.md` — locked user decisions
- `backend/src/index.ts` — Fastify plugin registration order (read directly)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, code read directly
- Architecture: HIGH — patterns derived from existing working code in the repo
- Pitfalls: HIGH — pitfalls #1, #3, #4 are confirmed facts (emit endpoint missing, Edit tool limit, dual EventSource); pitfall #5 is inferred from design
- Validation: HIGH — test patterns follow established Phase 2/4/5 convention

**Research date:** 2026-03-21
**Valid until:** 2026-04-20 (30 days — stable stack)
