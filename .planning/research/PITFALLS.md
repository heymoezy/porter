# Pitfalls Research

**Domain:** AI Orchestration Platform (SaaS, multi-agent, collaborative sessions)
**Researched:** 2026-03-20
**Confidence:** HIGH (grounded in actual codebase analysis + verified against external sources)

---

## Critical Pitfalls

### Pitfall 1: Distributed Monolith — Splitting Code Without Splitting Concerns

**What goes wrong:**
You create a Fastify backend alongside porter.py, but both backends still share the same SQLite file, same config JSON, and same session state. You've created a "distributed monolith" — two processes with physical separation but logical coupling. API calls silently cross the boundary in both directions. One backend assumes the other has already done something. The migration never actually completes because neither side can be deployed or tested independently.

**Why it happens:**
Gradual migration feels safe. Teams extract code file-by-file rather than feature-by-feature. The shared database is treated as neutral ground — "we'll deal with that later." Later never comes, and the coupling deepens with every sprint.

**How to avoid:**
Migrate by vertical slice, not horizontal layer. A vertical slice means the Fastify backend owns one complete feature end-to-end: its own routes, its own database tables, its own background workers. Porter.py never calls the Fastify backend's tables directly, and vice versa. The strangler fig pattern works exactly this way: place a routing layer (nginx or a thin proxy) in front, and route /api/chat/* to Fastify once that module owns its full data path. Porter.py never notices.

Current state: The Fastify backend (`backend/src/`) is reference-only. The migration risk is real if new features are added to Fastify before the data ownership boundary is established.

**Warning signs:**
- Fastify routes query porter.db tables that porter.py also writes to
- A bug fix requires touching both porter.py and backend/src/ simultaneously
- Integration tests fail non-deterministically because write order between backends matters
- "We need to coordinate the deploy order" becomes a recurring phrase

**Phase to address:** Codebase migration phase (the one that extracts features from porter.py into Fastify). Must define data ownership contracts before writing any Fastify feature.

---

### Pitfall 2: Silent Failure Propagation from 683 Broad Exception Catches

**What goes wrong:**
Porter has 683 broad `except Exception:` catches and 4 `except: pass` statements. When a new feature (agent scheduling, Memory V2) introduces a bug, the exception is swallowed at one of these catch sites. The feature "works" in testing — it just silently does nothing. The bug surfaces weeks later when a user reports that their agent "never actually ran anything" and there is no audit trail to explain why.

This is especially dangerous for agent autonomy features. If a scheduled agent run throws an exception during tool call setup, a broad catch means the agent appears to have "run" (no error returned to user) but produced no output. The user has no way to distinguish "agent ran and found nothing" from "agent never ran."

**Why it happens:**
Rapid prototyping habits. Every new feature was wrapped in try/except to keep the monolith stable during development. The habit solidified. Now the codebase structurally obscures failures.

**How to avoid:**
Before adding agent scheduling or any autonomous workflow, establish a logging contract: every exception path must emit a structured log entry via `mlog.emit()` at WARNING or ERROR severity. The fix is not to remove try/except blocks but to add `log.exception()` inside every catch. This can be done incrementally — start with the workflow registry paths and any new code, then work backward.

For the 4 bare `except: pass` statements (lines 197-198, 221, 224): eliminate immediately. These are the most dangerous — they catch `SystemExit` and `KeyboardInterrupt` too.

**Warning signs:**
- Agent "runs" complete instantly with no output and no error
- Workflow stats show success but the downstream effect never happened
- A bug is reported but adding print statements reveals the code path was never reached
- Memory V2 migration "completed" but old Cortex records are still being written

**Phase to address:** Tech debt cleanup phase (earliest possible). Must precede agent autonomy work — you cannot trust scheduled agents on a codebase where failures are invisible.

---

### Pitfall 3: Two Memory Systems Running Simultaneously Indefinitely

**What goes wrong:**
Cortex (auto-memory extraction) and Memory V2 (directives, concepts, signals) coexist in the database right now. Both systems allocate resources. Both write to the memories table. Both have consolidation loops. The migration is "in progress" but there is no hard deadline or cutover plan.

The risk is that Memory V2 is built on top of a partially-migrated foundation. If Cortex still writes signals while Memory V2 tries to promote/dismiss them, the signal queue is polluted. Memory V2's noise-reduction guarantee (no login/upload noise) is violated from day one by Cortex still extracting those events.

This is also a resource problem: on a 2 vCPU VPS with 8GB RAM, two memory consolidation loops running simultaneously is not free. The `_memory_v2_consolidation_pass()` and `_cortex_consolidate_facts()` both do full table scans. When they collide, database lock contention spikes.

**Why it happens:**
"We'll clean it up in the next sprint" is said once too many times. Deprecated systems are never fully removed because they feel risky to delete. The V2 migration is treated as additive (add new system, keep old) when it needs to be a replacement (add new system, then cut over, then delete old).

**How to avoid:**
Set a hard cutover event in the roadmap: "Memory V2 is the only active memory system from Phase X onward." Before that milestone, remove the `_wf_register("memory_extraction"...)` call for Cortex. After that milestone, delete all Cortex code (lines 1551-2156, 1860-1908, 2041-2060, etc.). Do not let both systems coexist past the first milestone that depends on Memory V2 quality.

**Warning signs:**
- Memory V2 signals include "user logged in" and "file uploaded" entries (Cortex still active)
- `workflow_stats` table shows both `memory_extraction` and `memory_v2_consolidation` running
- Directives are defined but not injected into dispatch context (partially wired)
- Memory-related database queries become the bottleneck under load

**Phase to address:** Memory V2 completion phase. Must include a "Cortex removal" deliverable with a verifiable definition of done (grep for cortex references returns zero results).

---

### Pitfall 4: SQLite as a Shared Mutable State Store for Autonomous Agents

**What goes wrong:**
Porter uses SQLite with WAL mode and a 5-second connection timeout. This is acceptable for a human-paced chat application. It is not acceptable for an agent scheduler that fires multiple background workers concurrently.

When agent scheduling goes live, you will have: (1) the HTTP request handler writing chat messages, (2) the workflow background thread running memory consolidation, (3) one or more scheduled agent workers executing tool calls and writing results. All three are writing to the same SQLite file. WAL mode helps readers, but write contention on a single file with no connection pooling and a 5-second timeout will produce `OperationalError: database is locked` exceptions. These get swallowed by the broad exception catches (Pitfall 2) and agents silently fail.

**Why it happens:**
SQLite is appropriate for the current usage pattern. The mistake is not addressing concurrency before adding write-heavy background workers, not SQLite itself. SQLite can handle this workload, but requires explicit connection management: connection pooling with `threading.local()`, longer timeouts (30-60s), and exponential backoff on lock errors.

**How to avoid:**
Before any agent scheduling work: wrap `_db_conn()` in a proper pool using `threading.local()`. Increase the connection timeout to 30 seconds. Add an exponential backoff retry wrapper for `OperationalError: database is locked`. Write tests that simulate 3 concurrent writers and verify no data loss.

The future PostgreSQL migration path (mentioned in PROJECT.md) is correct but not urgent. Fix the SQLite layer first; switch to Postgres when horizontal scaling is needed.

**Warning signs:**
- `OperationalError: database is locked` appears in logs after adding background agent workers
- Agent runs show up in workflow history as "failed" with no duration recorded
- Chat response times spike when background workflows are running
- `_wf_lock` contention visible if logging is added

**Phase to address:** Performance overhaul phase, but the connection pooling fix should be in the tech debt phase — it is a prerequisite for agent scheduling.

---

### Pitfall 5: Global Mutable State Breaks Agent Isolation

**What goes wrong:**
`_sessions`, `_login_attempts`, `_wf_registry`, and `_config` are global Python dicts. When agent scheduling adds concurrent workers that read/modify agent context, tool results, or task state, they share these globals without coordination. A scheduled agent that modifies `_config["projects"]` while another request reads it will produce torn reads. A workflow that updates `_wf_registry` history while the HTTP handler reads stats will produce inconsistent results.

The deeper problem: if Porter is ever run as multiple processes (e.g., for load balancing or blue/green deployments), these in-memory globals mean the two processes have divergent state. The Fastify migration actually makes this worse — the Fastify backend has no access to Python globals, so any state held in `_config` is invisible to the new backend.

**Why it happens:**
Globals are the path of least resistance in a single-file monolith. Every function can read `_config` without passing context. This felt like a feature during rapid development and is now a structural liability.

**How to avoid:**
New code (Fastify backend, new Python features) must read state only from the database or explicit function parameters, never from Python globals. The migration path is: move `_config["projects"]` to SQLite first (already identified as a fix in CONCERNS.md), then migrate `_sessions` to database-only reads, then encapsulate `_wf_registry` in a class that reads/writes from `workflow_stats` table.

Do not build agent scheduling on top of global mutable state. The scheduled worker must receive its context at dispatch time, not read it from globals mid-run.

**Warning signs:**
- Intermittent test failures that only happen under parallel test execution
- Agent run produces different results when run twice with identical inputs (global state leaked from previous run)
- Fastify backend returns stale project data because it cannot see `_config` changes

**Phase to address:** Tech debt cleanup (globals encapsulation) must precede agent scheduling.

---

### Pitfall 6: LLM Token Bloat from Heavy System Prompts Compounds at Scale

**What goes wrong:**
"Heavy system prompts causing slowness across the app" is already identified as a known issue in PROJECT.md. When agent autonomy is added, this multiplies: each scheduled agent run constructs a full system prompt including persona soul, memory injection, project context brief, and tool descriptions. If each run is 8,000 tokens of context and you have 10 agents running on 30-minute schedules, you are making hundreds of expensive context-heavy calls per day.

The latency problem is worse: a 4,000-token system prompt adds 400-800ms to every response. For a chatbot, that is noticeable. For a background agent, it is fine — but for the guided project creation wizard (which needs to feel snappy), it is a user experience killer.

**Why it happens:**
System prompts are assembled by appending context blocks. Each feature adds another block ("add the memory context here", "add the project brief here"). Nobody ever removes blocks. The prompt grows from 500 tokens to 5,000 tokens over 30 versions without anyone noticing because the individual additions seemed small.

**How to avoid:**
Establish a token budget per prompt type before building the guided project creation wizard:
- Interactive chat (user is waiting): hard cap 2,000 tokens system context
- Background agent run (no user waiting): allow up to 6,000 tokens
- Wizard steps: cap at 1,500 tokens per turn

Use Anthropic's prefix caching (already available — 90% cost reduction for cached prefixes). Structure prompts so the stable prefix (persona soul, core directives) comes first and is always the same, and the dynamic context (project brief, recent signals) comes last. Cache reads cost 10x less than fresh tokens.

**Warning signs:**
- `/api/chat` response time is >3 seconds for short user messages
- Token usage logs show system prompt > 50% of total tokens per call
- Project creation wizard feels "sluggish" compared to regular chat
- Agent background runs are costing more than expected in token spend

**Phase to address:** Performance overhaul phase. The token budget cap must be in place before the guided project wizard is built — building the wizard without it will embed the bloat permanently.

---

### Pitfall 7: Feature Flags Missing — No Safe Path to Roll Back New Agent Features

**What goes wrong:**
Porter has 35 Playwright tests that must pass at all times. But tests passing does not mean the new feature is safe to expose to users. Agent autonomy features (scheduled runs, tool execution, autonomous project creation) can cause irreversible side effects: files written to workspace, messages sent externally, database records created. If a bug is found after rollout, you cannot "un-run" the agents.

Without feature flags, the only rollback option is reverting the git commit and restarting the service — which breaks in-progress sessions and may leave agent runs in a partially-complete state.

**Why it happens:**
Feature flags feel like overhead for a single-developer project. They are not added until after the first incident where a rollback was painful.

**How to avoid:**
Add a minimal feature flag system before agent autonomy goes live. A simple JSON config field per feature is sufficient:
```json
"feature_flags": {
  "agent_scheduling": false,
  "guided_project_wizard": false,
  "whatsapp_integration": false
}
```

Agent scheduling workers check `_config["feature_flags"]["agent_scheduling"]` before running. Setting it to false in the config (without a restart) disables all scheduled runs immediately. This is not about A/B testing — it is about having an emergency stop switch for every autonomous feature.

**Warning signs:**
- The only way to disable a new feature is to git revert and restart
- A bug in agent scheduling causes every background run to fail but there is no way to stop the flood of errors without taking the whole service down
- Partially-executed agent runs are left in an inconsistent state after a restart

**Phase to address:** Agent autonomy phase, before first agent scheduling code is committed.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `except Exception: pass` everywhere | Keeps monolith stable during rapid development | Failures become invisible; agent autonomy is impossible to debug | Never — replace with `log.exception()` immediately |
| Projects in JSON config instead of SQLite | Zero migration needed, quick reads | Cannot query, no transactions, config and project data are entangled, fragile startup | Only during initial prototyping — migrate before adding collaborative sessions |
| Single background thread for all workflows | Simple to reason about, no coordination needed | Blocks HTTP on slow workflows; cannot add agent workers without redesigning the runner | Acceptable until agent scheduling; redesign when adding concurrent workers |
| Global mutable state (`_config`, `_sessions`) | All functions can access without context plumbing | No isolation between requests; Fastify backend cannot share state; globals break horizontal scaling | Acceptable in single-file monolith during prototyping; must be removed before multi-process deploy |
| SQLite with no connection pooling | Works fine for low concurrency | Database lock errors when concurrent agent workers write simultaneously | Acceptable for current load; must fix before agent scheduling |
| Deprecated Cortex code left in place | Avoids risk of removing working code | Two memory systems use double the resources; Memory V2 quality guarantees are violated | Never — set a hard removal date |
| YMC Capital hardcoded in prompts | Worked for one specific deployment | Every other deployment gives wrong examples; undermines "product, not internal tool" vision | Never for a product — genericize immediately |

---

## Integration Gotchas

Common mistakes when connecting to external services in this domain.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| openclaw gateway | Assuming gateway is up at startup; treating unavailability as an error | Detect on startup, badge backend as "degraded" if unavailable, retry on next request |
| Ollama (local Qwen) | Loading Qwen 7B (4.7GB) alongside other memory-heavy processes; no RAM guard | Check available RAM before model load; refuse if <6GB free; document memory constraint in admin UI |
| WhatsApp bidirectional | Treating incoming messages as untrusted user input with no throttle or dedup | Deduplicate on message ID; rate limit per WhatsApp number; sandbox agent response before sending |
| External calendar/mail | Making synchronous API calls in HTTP handler path | Queue all external calls to background workers; return immediate acknowledgment to user |
| LLM provider APIs | Retrying immediately on 429 rate limit errors; no exponential backoff | Implement exponential backoff with jitter; surface degraded state to user rather than silent retry loop |
| SQLite under concurrent writes | Opening new connection per request with default timeout | Use `threading.local()` pooling; set timeout to 30s; add retry decorator for `OperationalError: database is locked` |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full table scan in memory consolidation | Memory consolidation blocks all DB writes for seconds; HTTP requests time out | Index `memories` table by `created_at`, `scope`, `kind`; process in time-windowed batches of 100 | ~5,000 memory records |
| N+1 query in chat sessions list | `/api/chat/sessions` becomes slow as chat history grows; already flagged in chat.ts:56-68 | Replace with single `LEFT JOIN + GROUP BY` query | ~100 chat sessions |
| Unbounded workflow history in `_wf_registry` | Memory grows indefinitely; heap size increases after days of uptime | Cap history at last 100 entries; rotate oldest | After ~1,000 workflow runs (days) |
| Audit log reads entire file | Audit viewer becomes slow or times out | Move audit log to SQLite table; rotate file; use indexed queries with LIMIT | ~100MB audit file |
| Public IP lookup on startup (3 × 4s timeout) | Cold start takes up to 12 seconds | Move to background thread; cache for 1 hour; use 1s timeout with immediate fallback | Every restart |
| Full context assembly for every chat message | Chat latency is high even for "hi" messages | Cache project context brief (invalidate on project edit); use prompt prefix caching | Scales linearly with number of projects |
| Context hygiene scans all files | Hygiene workflow takes minutes on large workspaces | Index by `last_modified`; only scan files changed since last run; run as low-priority background thread | ~10,000 memory files |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Agent can call any tool at any time without scope restriction | Autonomous agent makes destructive external call (sends email, deletes file, pushes code) during misconfigured run | Define explicit tool allowlist per agent; validate tool scope at dispatch time, not in system prompt |
| Long-lived 30-day session tokens with no revocation | Compromised token valid for up to 30 days; logout does not invalidate | Implement `revoked` flag on sessions table; logout marks token revoked immediately; reduce TTL to 7 days |
| Test credentials `admin/porter` reachable on production-like system | Default password enables access if tests run against production DB | Use random test credentials; require `PORTER_TEST_PASSWORD` env var; never share DB between test and production runs |
| Admin endpoint protection in route handler (not middleware) | New admin endpoint added without protection check is an unprotected endpoint | Add auth middleware in Fastify that enforces capability check; route handler cannot opt out |
| Bearer tokens in cleartext in database | DB file compromise = all agent tokens exposed | Not urgent for single-server deployment, but document the risk; implement token hashing if moving to shared hosting |
| Collaborative session does not scope agent tool access to tenant | User A invites User B to project; User B's session can call tools scoped to User A's workspace | Session tokens must carry tenant/workspace scope; all tool calls validate scope at execution |

---

## UX Pitfalls

Common user experience mistakes in AI orchestration platforms.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Agent is working" with no progress feedback | User does not know if agent is running, stuck, or done; they refresh or give up | Emit SSE events for each agent step (started, tool called, tool result, complete); surface in transparency dashboard |
| Agent runs silently fail with no user notification | User waits for output that never arrives; no way to distinguish "ran, found nothing" from "never ran" | Failed runs must produce a visible event: "Agent run failed at 14:32 — reason: memory consolidation timeout" |
| Feature shown in UI before it works reliably | User tries to use it, it fails, trust is destroyed | Follow Porter's own rule: feature flag off until it passes 3 consecutive live runs without errors |
| Memory V2 signal noise clutters agent context | Agent receives irrelevant noise (login events, file uploads) as learned signals; response quality degrades | Gate Cortex removal before Memory V2 goes live; validate signal quality with representative test cases |
| Guided project wizard asks too many questions | User abandons before completing; project never created | Maximum 3 questions in initial wizard; agent proposes the rest; user approves or adjusts |
| Collaborative session has no clear "what can I see/do" indicator | Invited user does not know their permissions; accidentally tries unauthorized actions | Show role badge and permission summary on every collaborative session; surface in UI before first action |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Memory V2:** Visible in admin UI and accepting writes — verify Cortex is fully disabled (grep for cortex writes to memories table returning zero results)
- [ ] **Agent scheduling:** Workflow registered and running — verify tool execution scope is restricted (agent cannot call tools outside its allowlist)
- [ ] **Guided project wizard:** Multi-turn conversation works — verify it produces a real project with milestone, tasks, and agent assignment (not just a project record with empty fields)
- [ ] **Collaborative sessions:** User can be invited — verify that invited user's session cannot access other workspaces (tenant isolation test)
- [ ] **Fastify migration:** Route is served by Fastify — verify porter.py is NOT also handling the same route (dual-handling causes non-deterministic behavior)
- [ ] **Feature flags:** Config field exists — verify that setting flag to false stops all in-flight agent runs within one polling cycle (not just prevents new starts)
- [ ] **Performance overhaul:** Chat is faster — verify system prompt token count is measured and within budget cap per prompt type
- [ ] **WhatsApp integration:** Messages route to agent — verify that message deduplication is working (send same message twice, agent responds once)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Distributed monolith — Fastify and porter.py entangled | HIGH | Identify all cross-boundary reads; establish data ownership contract; one side wins per table; write migration script to move data; route through new owner; remove old path |
| Silent failures — bug hidden for weeks | MEDIUM | Add `mlog.emit()` to all exception handlers in affected path; replay recent workflow history to find where output diverged; fix root cause |
| Cortex and Memory V2 both active — polluted signals | MEDIUM | Run one-time migration script to mark all cortex-era signals as `status='archived'`; disable Cortex workflow; verify Memory V2 signal queue is clean before re-enabling agent context injection |
| SQLite lock errors under concurrent agents | LOW-MEDIUM | Increase timeout immediately (config change, no restart needed); add connection pool in next deploy; identify which workflow is holding long write locks and add batching |
| Global state leaked between agent runs | HIGH | Add test that runs two agents concurrently and verifies output isolation; identify which globals are read mid-run; move reads to database-sourced context passed at dispatch time |
| LLM token bloat causing budget overrun | LOW | Audit system prompts for all agent types; remove redundant blocks immediately; enable Anthropic prefix caching; add token count logging per call type |
| Feature deployed without feature flag — cannot roll back safely | MEDIUM | Add flag in config immediately; set to false; verify it stops behavior; create database snapshot; fix bug; re-enable |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Distributed monolith (Pitfall 1) | Codebase migration — establish data ownership before first Fastify feature | No table is written by both porter.py and Fastify |
| Silent failure propagation (Pitfall 2) | Tech debt cleanup — before agent scheduling | grep for `except: pass` returns zero results; all exception paths emit mlog |
| Two memory systems coexisting (Pitfall 3) | Memory V2 completion — hard cutover date | grep for cortex write paths returns zero results; workflow_stats shows only memory_v2 consolidation |
| SQLite lock errors under agents (Pitfall 4) | Tech debt cleanup — connection pooling fix | 3 concurrent agents write to DB without OperationalError in 100-run load test |
| Global mutable state (Pitfall 5) | Tech debt cleanup — before agent scheduling | Agent runs receive context via parameters, not globals; Fastify reads only from SQLite |
| LLM token bloat (Pitfall 6) | Performance overhaul — before guided wizard | Per-prompt token count logged; system context <= 2,000 tokens for interactive calls |
| No feature flags (Pitfall 7) | Agent autonomy phase — day one | Every autonomous feature has a feature flag; setting flag to false stops behavior within 1 polling cycle |

---

## Sources

- Codebase analysis: `/home/lobster/documents/porter/.planning/codebase/CONCERNS.md` (HIGH confidence — direct inspection)
- Architecture review: `/home/lobster/documents/porter/.planning/codebase/ARCHITECTURE.md` (HIGH confidence — direct inspection)
- [Your AI Agent Platform Is a Monolith. Here's How to Fix It.](https://seanfalconer.medium.com/your-ai-agent-platform-is-a-monolith-heres-how-to-fix-it-784c9b5194af) (MEDIUM confidence)
- [9 Most Common Mistakes when Migrating from Monolith to Microservices](https://nglogic.com/9-most-common-mistakes-when-migrating-from-monolith-to-microservices/) (MEDIUM confidence)
- [Strangler Fig Pattern — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/strangler-fig.html) (HIGH confidence — official docs)
- [Orchestrating AI Agents in Production: The Patterns That Actually Work](https://hatchworks.com/blog/ai-agents/orchestrating-ai-agents/) (MEDIUM confidence)
- [7 Common Pitfalls in AI Agent Deployment and How to Avoid Them](https://www.getmaxim.ai/articles/7-common-pitfalls-in-ai-agent-deployment-and-how-to-avoid-them/) (MEDIUM confidence)
- [LLM Token Optimization: Cut Costs & Latency in 2026](https://redis.io/blog/llm-token-optimization-speed-up-apps/) (HIGH confidence — Redis official blog, current)
- [PEP 760 – No More Bare Excepts](https://peps.python.org/pep-0760/) (HIGH confidence — official Python PEP)
- [SQLite 4.0 as a Production Database: 2025 Benchmarks and Pitfalls](https://markaicode.com/sqlite-4-production-database-benchmarks-pitfalls/) (MEDIUM confidence)
- [The 2025 AI Agent Report: Why AI Agents Fail in Production](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap) (MEDIUM confidence)

---
*Pitfalls research for: AI Orchestration Platform (Porter)*
*Researched: 2026-03-20*
