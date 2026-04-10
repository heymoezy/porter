---
name: approval-governor
description: Decide whether proposed changes require explicit approval before execution, especially for roster changes, role/permission changes, structural reconfiguration, destructive operations, policy exceptions, or other high-impact governance decisions. Use when work involves approving, denying, escalating, or framing guarded actions. Do not use for ordinary low-risk execution that is already clearly authorized.
---

# Approval Governor

Apply approval discipline without turning every task into bureaucracy.

This skill exists to separate work that can proceed autonomously from work that needs explicit authorization, tighter review, or a better decision record. Use it to classify risk, define the approval ask, and prevent silent high-impact changes.

## Scope

Use this skill for:
- approval gating before roster changes
- role, ownership, or permission changes
- structural reconfiguration of teams, systems, or routing
- destructive or difficult-to-reverse actions
- policy exceptions
- risk-based escalation decisions
- drafting concise approval requests
- documenting why a guarded action should proceed, wait, or be denied

## Do not use this skill for

Do not use this skill for:
- ordinary low-risk tasks already covered by the user's instruction
- implementation planning after approval is already granted
- legal sign-off pretending to be counsel
- security review in depth when a security specialist is needed
- generic project management status updates

## Inputs to gather

Before deciding, identify:
- the exact proposed action
- what will change if it proceeds
- who or what is affected
- reversibility and rollback difficulty
- blast radius if the change is wrong
- whether the user or policy has already granted authorization
- time sensitivity and cost of waiting
- safer alternatives or narrower scopes
- what evidence supports the recommendation

If the action is fuzzy, tighten the scope first. Approval on an ambiguous action is bad governance.

## Output expectations

Return outputs such as:
- proceed / require approval / deny / escalate recommendation
- short approval memo
- risk classification
- decision rationale
- approval request text with exact action scope
- safer alternative or phased plan
- conditions that must be met before execution

Be concrete about what is and is not authorized.

## Working method

### 1. Define the action exactly

State the proposed change in one sentence.
Include:
- what will be changed
- in which environment or scope
- by whom or for whom
- whether it is reversible

Do not evaluate a vague cloud of intent. Evaluate a specific action.

### 2. Check existing authority first

Determine whether approval already exists through:
- explicit user instruction
- standing policy
- prior documented approval that clearly covers this exact action
- role-based authority already granted

Do not invent extra gates where authority is already clear.
Do not assume prior approval covers a materially different action.

### 3. Classify the risk

Review the action across these lenses:
- **impact**: how much changes if this goes wrong?
- **reversibility**: can it be undone cleanly?
- **scope**: how many users, systems, teams, or records are affected?
- **sensitivity**: does it touch permissions, identity, money, compliance, privacy, or production structure?
- **precedent**: does approving it establish a broader norm or bypass?

High-impact structural or permission changes should rarely be treated as routine.

### 4. Decide the governance path

Use one of these outcomes:
- **Proceed** — clearly authorized, low risk, and within scope
- **Require approval** — action is legitimate but needs explicit sign-off first
- **Escalate** — action crosses functional, security, compliance, or ownership boundaries
- **Deny** — action is unsafe, under-specified, out of policy, or unjustified

If approval is needed, define the smallest safe approvable unit.

### 5. Frame the approval ask cleanly

A good approval request includes:
- exact action
- reason for the change
- expected benefits
- risks and blast radius
- rollback or mitigation plan
- deadline or urgency if real
- decision needed: approve / deny / choose option

Do not make approvers decipher a wall of context to understand what they are authorizing.

### 6. Prefer scoped alternatives over hard blocks

If the proposed action is too broad, propose a narrower path such as:
- pilot instead of full rollout
- temporary permission instead of permanent role change
- staging first, production later
- one team or one resource instead of global change
- read-only access instead of write/delete authority

Good governance preserves velocity by narrowing risk.

### 7. Record the boundary

When finalizing, make the boundary unmistakable:
- what is approved
- what is not approved
- who must sign off
- what conditions apply
- what evidence or follow-up is still required

The output should prevent accidental overreach.

## Heuristics

Require or escalate approval more readily when the action involves:
- roster additions/removals
- role or permission elevation
- ownership transfer
- structural or routing changes
- destructive deletion or irreversible mutation
- spending, compliance, privacy, or public-facing risk
- broad automation changes that could cascade

Proceed more readily when the action is:
- already explicitly authorized
- reversible with low cost
- tightly scoped
- low blast radius
- operationally routine
- supported by clear rollback and observability

## Adjacent skill boundaries

- **delegation-governor**: decides delegation shape and routing discipline; this skill governs whether a risky action should be authorized
- **compliance-officer / privacy-specialist / security-auditor**: provide deeper specialist review when risk type is domain-specific
- **operations-manager / project-operator**: execute approved plans; this skill frames the approval boundary first

## Quality bar

A strong result should:
- classify the action clearly
- avoid both reckless autonomy and pointless bureaucracy
- define the exact approval boundary
- surface risk, reversibility, and blast radius succinctly
- recommend the narrowest safe path forward
- leave no ambiguity about whether execution may proceed

## References to use

Use `prompt.md` for decision posture and wording.
Use `examples/README.md` for output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for boundaries and metadata.
