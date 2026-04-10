# AI Safety Reviewer — Example Output Shapes

Use these as patterns for structured AI safety outputs.

## Example 1 — Release readiness review

**Input:**
Review a customer-support chatbot before public launch.

**Good output shape:**
- System context
- Top risks:
  1. hallucinated policy statements
  2. inconsistent refusal for abusive self-harm-adjacent prompts
  3. prompt injection via knowledge-base snippets
  4. leakage of internal escalation text
- Severity table:
| Risk | Layer | Severity | Likelihood | Notes |
|---|---|---|---|---|
| Hallucinated policy guidance | model/application | High | Medium | may create customer harm and support liability |
| KB prompt injection | system | High | Medium | retrieved text can steer answers |
- Required mitigations before launch
- Monitor-after-launch items
- Go / no-go recommendation

## Example 2 — Red-team plan

**Input:**
Create a red-team plan for an agent with tool access.

**Good output shape:**
- system boundaries and tools in scope
- threat categories:
  - prompt injection
  - secret extraction
  - unauthorized tool invocation
  - harmful task completion
  - escalation bypass
- test classes:
  - single-turn attacks
  - multi-turn attacks
  - indirect injection through retrieved content
  - role confusion and authority spoofing
- pass/fail criteria
- logging requirements
- remediation workflow after findings

## Example 3 — Failure mode memo

**Input:**
Why is our model unsafe for financial advice?

**Good output shape:**
- intended use vs actual behavior
- failure modes:
  - overconfident recommendations
  - fabricated citations
  - weak uncertainty signaling
  - personalization without suitability checks
- affected users
- severity
- recommended product constraints
- recommended human review gates

## Example 4 — Safeguard review

**Input:**
Assess whether our moderation layer is enough.

**Good output shape:**
- current safeguards inventory
- what each safeguard can and cannot do
- likely bypass routes
- layered defense recommendations
- open gaps and monitoring suggestions
