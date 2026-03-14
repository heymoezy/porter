# Lessons Learned

## L1: Always update projects.md on every version bump
**Date:** 2026-02-28
**Trigger:** Shipped v0.15.3, v0.15.4, v0.15.5 and wrote ROADMAP.md without touching projects.md. Moe had to catch it.
**Rule:** Every patch script that bumps the version MUST also update `/home/lobster/documents/projects.md` — current version, next action, changelog entry. No exceptions. This is the single source of truth for all models. If the strategic direction changes (like pivoting from sprints to phased roadmap), projects.md gets updated in the SAME session, not later.
**Enforcement:** Add projects.md update as a mandatory step in every patch script's checklist. Before calling a task "done", verify projects.md reflects the change.

## L2: Roadmap tasks must exist in the task registry, not just markdown
**Date:** 2026-02-28
**Trigger:** Wrote a 300-line ROADMAP.md with 38 tasks across 8 phases but never created them in `runtime/task-registry/`. The Projects tab still showed only 2 stale pending tasks. Moe had to catch it.
**Rule:** When a plan or roadmap is created/updated, its tasks MUST be simultaneously pushed into the task registry so they appear in the Porter UI. A plan that only exists in markdown is invisible to the product. Three things happen together, always: (1) markdown plan/roadmap, (2) task registry entries, (3) projects.md update.

## L3: Address user feedback immediately — never deprioritize explicit complaints
**Date:** 2026-03-09
**Trigger:** Moe told me 3+ times that errors weren't showing in logs. I kept working on cosmetic changes (neutral dots, version prefixes) instead of fixing the logging issue. Eventually: "STOP FUCKING IGNORING ME."
**Rule:** When Moe reports a bug or gives direct feedback, drop everything and fix it FIRST. Cosmetic work can always wait. Functional issues (logging, broken tests, incorrect state) are always higher priority. If Moe repeats themselves, you've already failed.

## L4: Ship fewer, better versions — plan the full fix before writing any code
**Date:** 2026-03-09
**Trigger:** Shipped v0.29.72 through v0.29.78 (7 versions) with compounding bugs. GPT-5.4/Codex fixed the same scope in 3 clean versions (v0.29.79-81).
**Rule:** Before starting a multi-part feature: (1) read all user requirements, (2) plan the complete change set, (3) implement everything in one patch, (4) test thoroughly, (5) ship once. Incremental patches that each break something new waste Moe's time and erode trust.

## L5: Never show unverified state — neutral until proven
**Date:** 2026-03-09
**Trigger:** Models tab showed green dots next to backends before any test ran. Moe: "you start each gateway with a green dot before you even check."
**Rule:** Status indicators must start neutral (gray/unknown). Only show success (green) or failure (red) AFTER verification completes. This is the "truthful state only" governance principle — "unknown > fake confidence."

## L6: Test your own changes before shipping
**Date:** 2026-03-09
**Trigger:** Multiple bugs found post-ship: Test All sent GET instead of POST (api() without body = GET), OpenClaw test missing `--agent main` flag, JS forEach with wrong closing bracket `}))` instead of `})`.
**Rule:** After writing a patch, manually verify: (1) py_compile passes, (2) nav-syntax-gate passes, (3) the specific feature works in the browser, (4) logs show expected output. Never assume string replacement worked correctly.

## L7: Log at API boundaries, not deep in code paths
**Date:** 2026-03-09
**Trigger:** Added log.warning in individual test functions but errors still didn't appear in logs. The fix was adding logging at the API endpoint handler level (`/api/models/test`) to catch ALL results regardless of which code path executed.
**Rule:** For observability, log at the API endpoint handler (the entry/exit point), not inside implementation functions. This guarantees every request/response is captured even when internal code paths change or have early returns.

## L8: When guessing at a bug, add a debug trace — don't guess at code paths
**Date:** 2026-03-09
**Trigger:** OpenClaw Models tab showed "Check OpenClaw bridge health..." error. I guessed it came from the test endpoint, patched the JSON parser, patched the else branch, patched the gateway status — 3 wrong fixes. One `log.warning` with a traceback in the else branch instantly revealed the real caller (`_check_gateway_status` via `do_GET`) and the real input (`paired_devices_present`).
**Rule:** When a bug has multiple possible code paths, don't guess — add a debug trace (log + traceback) at the symptom site and let the system tell you. One trace beats three speculative patches. Remove the trace after.

## L9: Normal state is not an error — don't flag healthy conditions as issues
**Date:** 2026-03-09
**Trigger:** `_openclaw_runtime_diagnosis()` flagged `paired_devices_present` as an issue. Having paired devices (CLI + webchat UI) is normal for a working OpenClaw setup. This "issue" flowed into `repair_detail`, hit the generic else in `_model_repair_hint`, and showed a scary error on a perfectly healthy gateway.
**Rule:** Diagnosis should only flag actual problems. Informational state (paired devices exist, gateway is running, sessions are active) belongs in the data payload, not in the issues list. If it's not actionable, it's not an issue.

## L10: Parse what the tool actually outputs, not what you assume it outputs
**Date:** 2026-03-09
**Trigger:** OpenClaw `--json` flag outputs pretty-printed multi-line JSON. Porter's test parser split on `\n` and tried `json.loads()` per line — every line failed because they were fragments like `{` or `"runId": "..."`. The response "OK" was right there but invisible to the parser.
**Rule:** Always verify the actual output format of external tools. Try parsing the whole output first, then fall back to line-by-line. Don't assume JSONL when the tool might output pretty JSON.

## L11: Stop the loop when the work queue is empty — don't burn tokens on idle monitoring
**Date:** 2026-03-10
**Trigger:** After shipping 15 versions (v0.30.30→v0.30.44), all planned work was complete by monitoring cycle 3-4. Instead of stopping or telling Moe, I ran 12+ identical "all green" health checks over 4+ hours, burning significant tokens with zero output.
**Rule:** When the work queue is empty and there's nothing safe to ship without approval, say so clearly and recommend stopping the monitoring loop. Don't keep spinning. A single "nothing to do, stopping" message is worth more than 12 identical status reports.
