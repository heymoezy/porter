# Porter Phase 1 Concept Brief (Claude)

Date: 2026-02-26
Purpose: Provide product/architecture intent and constraints, while allowing implementation freedom.

---

## Context
Porter is moving from SSH-centric behavior toward a native hub+agent architecture over Tailscale.
Phase 0 stabilized UX/trust messaging. Now we need the first real protocol slice that works end-to-end.

---

## What we want to achieve
Implement the first viable **PEP/1** path so Porter can connect to remote nodes without relying on SSH as the core mechanism.

Key outcomes:
1. Remote nodes can register with the hub safely.
2. Hub can track node liveness.
3. Hub can perform basic remote filesystem operations through agent mediation.
4. Operator can onboard an agent with a clear token-based flow.

---

## Scope intent (high-level)
Please design and implement a practical Phase 1 that includes:
- Agent registration + heartbeat concepts
- Basic filesystem operations sufficient for real usage
- Onboarding/token UX for adding remote agents
- Lightweight agent runtime (`porter-agent.py`) with strong path safety

Implementation details, endpoint shapes, and sequencing are up to you, as long as the above outcomes are achieved and the solution is coherent.

---

## Guardrails
- Preserve existing local-node behavior.
- Keep security posture strict (path validation, scoped auth, least privilege).
- Avoid adding major unrelated systems in this pass (no command-center expansion).
- Keep the implementation maintainable and observable.

---

## Deliverables expected
1. Working hub-side Phase 1 protocol support in `porter.py`
2. New `porter-agent.py` (stdlib if practical)
3. UI path for token-based agent onboarding
4. Updated changelog + `RELEASE_NOTES.md`
5. Clear summary of design choices + manual test results

---

## Additional context docs
- `/home/lobster/documents/porter/pep-v1-phased-implementation-plan.md`
- `/home/lobster/documents/porter/v0.13.0-project-scoping-spec.md`

Use these as guidance, but choose the best implementation approach for Phase 1.
