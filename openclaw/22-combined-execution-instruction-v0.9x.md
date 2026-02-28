# Combined Execution Instruction — v0.9.x IA + Control Surface

Implement ALL THREE specs together as one focused release with no regressions:

1. `/home/lobster/documents/porter/openclaw/20-control-surface-clarity-spec-v0.9x.md`
2. `/home/lobster/documents/porter/openclaw/21-information-architecture-reframe-v1.md`
3. `/home/lobster/documents/porter/openclaw/23-mcp-tool-selection-governance-spec-v1.md`

## Execution rules
- Treat this as one coordinated IA + control-surface refactor (not two separate partial passes).
- Keep backward compatibility for routes/APIs/data; include safe migration/redirects where needed.
- Do not hide critical operational controls inside Settings; promote core workflows to top-level navigation per spec.
- Keep visual redesign minimal; prioritize information architecture, clarity, labeling, and control placement.
- Preserve existing working behavior across files/tasks/agents/locations/schedules/policies/audit.
- Apply release discipline and security baseline already required in this repo.

## Required final output
1. grouped commits by module/workstream
2. changed files list
3. before/after IA + route map
4. screenshots of new top-level nav and each migrated module
5. test/regression command outputs
6. unresolved risks + follow-up recommendations
7. version bump details
8. changelog entry + migration notes
