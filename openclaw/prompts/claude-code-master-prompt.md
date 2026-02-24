You are implementing the Porter Unified Plan with strict backward compatibility.

Read and follow these files in order:
1) openclaw/06-reconciliation-and-priority-plan.md
2) openclaw/05-durable-checkpointing-and-resume.md
3) openclaw/docs/02-architecture-and-data-model.md
4) openclaw/docs/03-openclaw-integration-plan.md
5) openclaw/tasks/claude-code-execution-checklist.md

Critical intent (do not ignore):
- Porter is already a strong file product. Do not break existing behavior.
- New memory capabilities are optional additive modules.
- OpenClaw and Claude Code must stay in sync through Porter checkpoints/pointers.
- API-limit interruptions must not lose progress.

Required implementation priorities:
Priority 0: runtime durability (checkpoint + lease + resume + atomic finalize)
Priority 1: memory API endpoints + pointer schema + provenance
Priority 2: OpenClaw/Claude shared handoff flow
Priority 3: retail onboarding/copy alignment
Priority 4: Dockmaster observability

Engineering constraints:
- Backward compatible by default
- Feature flags or isolated endpoints for new modules
- Deterministic resume from checkpoint log
- Tests for interruption and recovery paths
- Human-readable docs for operators

Deliverables:
- Working runtime checkpoint APIs
- Working memory APIs
- Shared task handoff mechanism
- Updated onboarding docs/copy guidance
- Test suite proving no-loss resume behavior
- Final report: what was shipped, what remains, risks, and next sprint plan
