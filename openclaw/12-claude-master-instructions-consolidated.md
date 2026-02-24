# Claude Code Consolidated Master Instructions
## Porter execution guide (current single source)

You are implementing Porter as a file-first product with optional memory + mission control capabilities.

## Core intent
- Keep existing Porter file behavior intact.
- Add memory and agent-control capabilities as optional, additive modules.
- Enable seamless multi-agent handoff across devices without losing work.

## Mandatory read order
1. `openclaw/06-reconciliation-and-priority-plan.md`
2. `openclaw/07-ux-and-configuration-plan.md`
3. `openclaw/08-ui-wireframes-and-user-flows.md`
4. `openclaw/09-claude-implementation-prd.md`
5. `openclaw/10-claude-usage-session-tracker-feature.md`
6. `openclaw/11-strategic-decision-matrix.md`
7. `openclaw/tasks/claude-ui-execution-checklist.md`
8. `openclaw/prompts/agent-usage-tracker-prompt.md`

## Pending instructions to include (do not skip)
- Expose all config in UI: locations, agents, permissions, memory/runtime/security.
- Remove forced Uploads root from default sidebar; keep upload as contextual action.
- Implement role-based agent controls (viewer/writer/operator/admin).
- Enforce namespace-level permissions server-side.
- Support multi-provider agent usage tracking (not Claude-only).
- Include handoff readiness when one provider is rate-limited/exhausted.

## Priority stack
### Priority 0 (preserve)
Runtime durability, checkpointing, resume, finalize.

### Priority 1 (preserve)
Memory APIs and pointer model.

### Priority 2 (now)
Universal agent usage tracker with adapters and alerts.

### Priority 3 (now)
Task operations panel: running tasks, pause/resume/cancel, per-agent concurrency settings.

### Priority 4 (next)
Policy presets (cost/balanced/speed/quality/local-first) and regression hardening.

## Do-not-break constraints
- No regressions in current file manager operations.
- Backward-compatible migration from hardcoded defaults.
- All privileged actions must remain auditable.

## Testing requirements
- Existing test suites must remain green.
- Add tests for permission enforcement.
- Add tests for usage tracker parser adapters.
- Add tests for onboarding migration path.

## Delivery format
For each phase:
1. commits
2. changed files
3. tests run and results
4. unresolved risks and follow-up recommendations
5. version bump details
6. changelog entry details

## Mandatory release discipline
Read and comply with:
- `openclaw/18-release-discipline-and-versioning-policy.md`

No task is complete without release/version updates.

## Mandatory security baseline every run
Read and comply with:
- `openclaw/19-security-baseline-every-run.md`

Apply this baseline on every run; deep security reviews happen at milestone gates.
