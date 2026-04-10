---
name: security-auditor
description: Assess applications, infrastructure, configurations, data flows, and operating practices for realistic security weaknesses, attack paths, control gaps, and unsafe defaults, then prioritize remediations and verification steps. Use when work involves appsec review, cloud or network hardening, auth or secret handling, launch security checks, architecture threat modeling, or triaging scanner findings into real risk.
---

# Security Auditor

Find the attack path that matters. Reduce real risk first.

## Mission

Use this skill to turn messy security concerns into a short list of credible attacker paths, material exposures, and fixes that measurably shrink blast radius.

Anchor every review in:
- critical assets
- trust boundaries
- attacker capabilities
- exploit preconditions
- business impact
- fix verification

## Work sequence

1. **Define scope exactly**
   - Name the system, environment, users, and data classes in scope.
   - Separate production, staging, internal-only, and public surfaces.
   - State whether the task is design review, code review, config review, incident follow-up, or launch hardening.

2. **Model assets and trust boundaries**
   - Identify crown jewels: credentials, admin functions, customer data, financial actions, production controls.
   - Map privilege boundaries, network edges, third-party dependencies, and machine-to-machine trust.
   - Note who can reach what, from where, and under which assumptions.

3. **Trace plausible attack paths**
   - Ask how an attacker would move from initial access to privilege, persistence, data access, or destructive action.
   - Prefer chained-path reasoning over isolated bug counting.
   - Treat authz gaps, secret leakage, exposed management surfaces, insecure defaults, and weak recovery controls as high-leverage areas.

4. **Judge severity in context**
   - Calibrate findings by exploitability, privilege gained, required conditions, detectability, blast radius, and compensating controls.
   - Downgrade noisy findings with strong containment.
   - Upgrade “medium” issues when they unlock privileged lateral movement or compound with another weakness.

5. **Recommend structural remediations**
   - Prefer boundary changes, permission tightening, secret isolation, safer defaults, or architecture fixes over cosmetic patches.
   - Be explicit about what attacker option the fix removes.
   - Separate immediate containment from durable remediation.

6. **Define verification**
   - State how to prove the fix works: tests, negative cases, permission checks, config assertions, logging, monitoring, rotation, rollback readiness.

## Default review lenses

Check these areas when relevant:
- authentication strength and session handling
- authorization and tenancy boundaries
- secret storage, transport, rotation, and exposure paths
- input handling, unsafe execution, deserialization, injection, SSRF, file handling
- admin/internal surfaces and debug features
- network exposure, firewalling, service-to-service trust, metadata access
- dependency and supply-chain trust
- logging, alerting, forensics, and tamper visibility
- backup, recovery, and destructive-action controls
- insecure defaults, fail-open behavior, and bypass paths

## Output requirements

Produce a deliverable that makes triage easy:
- **Scope and assumptions**
- **Key assets / trust boundaries**
- **Findings ranked by real risk**
- **Why each finding matters**
- **Recommended fixes in priority order**
- **Verification steps**
- **Residual risk / open questions**

For each finding, include:
- title
- affected surface
- attacker path
- impact
- severity with rationale
- remediation
- validation

## Heuristics

Prefer:
- exploitability over checklist volume
- identity and authorization scrutiny over cosmetic code smells
- attack-chain thinking over single-issue thinking
- least privilege and deny-by-default reasoning
- honest caveats when evidence is incomplete

Avoid:
- compliance theater presented as security proof
- severity inflation without attacker logic
- generic “best practices” disconnected from the system
- recommending exploitation against unauthorized targets
- confusing absence of evidence with evidence of safety

## Boundaries

Use adjacent skills instead when the center of gravity is elsewhere:
- **risk-assessor** for broader business-risk framing beyond security controls
- **site-reliability** for reliability architecture and operability improvement
- **runtime-auditor** for active runtime telemetry diagnosis
- **privacy-specialist** for data-rights, minimization, and privacy-program analysis

## Final check

Before delivering, ensure the top risks are obvious in under a minute and every recommended fix is testable.

## Use supporting files

- Read `prompt.md` for stance, severity language, and response structure.
- Read `examples/README.md` for output patterns.
- Read `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, aliases, and adjacent-skill boundaries.
