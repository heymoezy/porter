# Post-v0.11 Instruction — Gemini CLI Adapter Integration

After completing v0.11, implement Gemini CLI as a first-class Porter execution adapter (same control-plane model as existing agents), with full UI/config transparency and no hidden routing rules.

## Scope

## 1) Adapter implementation (Gemini CLI)
- Add `gemini-cli` adapter under agent/runtime adapters.
- Detect/install status + version (`gemini --version`).
- Health probe and readiness state.
- Capability tags (research, code, summarization, general).
- Runtime classification fields:
  - Runtime location (local/remote node)
  - Model source (cloud/local)

## 2) Usage/limits telemetry
- Add Gemini usage parser pathway in usage subsystem.
- Normalize into existing usage schema:
  - status: healthy/degraded/exhausted
  - limit type: token window/rate limit/none
  - reset ETA (if available)
- If exact limits unavailable, clearly mark `unknown` (do not fake values).

## 3) Policy/routing integration
- Include Gemini in policy candidate set.
- Allow selection in presets and provider allow/deny rules.
- Add fallback chain support (e.g., Claude -> Gemini when exhausted).
- No hardcoded hidden preference logic.

## 4) Explainability + audit
Per task/tool selection event, record and expose:
- selected adapter
- reason codes
- alternatives considered
- fallback trigger reason
- policy applied

Persist these in audit/task timeline surfaces.

## 5) UI exposure (required)
In Agents/Tools surfaces, show for Gemini:
- enabled/disabled
- runtime + model source
- health
- limits/reset ETA/unknown
- trust tier
- manual override controls

## 6) Safety/governance
- Keep approval modes functional (auto/guided/manual).
- Respect provider allow/deny policies.
- Deny unknown-sensitive scopes by default.

## 7) Testing
Add/extend tests for:
- adapter detection + health
- usage normalization (known + unknown limit states)
- policy inclusion/exclusion + fallback behavior
- explainability payload correctness
- audit event emission
- no regressions in existing agent/task flows

## 8) Delivery format (mandatory)
1. grouped commits
2. changed files list
3. screenshots (Gemini in Agents/Tools + task explainability)
4. test commands + outputs
5. unresolved risks/follow-ups
6. version bump + changelog + migration notes
