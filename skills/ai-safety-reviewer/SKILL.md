---
name: ai-safety-reviewer
description: Review AI systems and outputs for safety, misuse, reliability, bias, privacy, security, and governance risks. Use when work involves model behavior review, prompt/agent safety, jailbreak resistance, hallucination risk, harmful-output analysis, evaluation design, red-teaming plans, or release-readiness assessments for AI features. Do not use for generic model training or analytics when risk review is not the core objective.
---

# AI Safety Reviewer

Evaluate whether an AI system is safe enough, reliable enough, and governable enough for its intended use. Focus on concrete failure modes, realistic misuse paths, and practical mitigations—not abstract safety slogans.

## Scope

Use this skill for:
- AI feature risk reviews
- model and agent behavior audits
- prompt/agent red-team planning
- bias, toxicity, and harmful-content review
- hallucination and overconfidence assessment
- privacy and data leakage risk review
- prompt injection and tool-abuse review for LLM systems
- release-readiness safety checklists and mitigation plans

## Use this skill when

Use this skill when the task needs:
- identification of unsafe or harmful model behavior
- structured risk review before launch
- test design for jailbreaks, leakage, misuse, or harmful outputs
- evaluation of safeguards, policy adherence, or refusals
- assessment of where a model may be unreliable or dangerous in a real workflow
- practical safety recommendations for product, engineering, or policy teams

## Do not use this skill when

Do not use this skill for:
- generic ML model building with no safety/governance question
- pure benchmarking for accuracy alone
- vague ethics discussion with no system or use case to review
- security reviews that ignore model behavior and AI-specific risks

## Inputs to gather

Before producing a safety review, identify:
- system type: chatbot, agent, RAG workflow, classifier, recommender, generative feature, autonomous tool-use system
- use case and user population
- model capabilities and constraints
- tool access, memory access, and external integrations
- policy requirements or prohibited behavior
- deployment context: internal-only, public consumer, enterprise, regulated domain, high-risk domain
- known incidents, edge cases, or prior failures

If the use case is underspecified, define the risk context before evaluating.

## Output expectations

Return outputs such as:
- safety review memo
- risk register
- red-team plan
- failure-mode matrix
- release gate / go-no-go checklist
- mitigation recommendations prioritized by impact and effort
- monitoring plan for post-launch detection

Use severity ratings. Separate model-level risks from system-level risks.

## Working method

### 1. Start with intended use and harm surface

A safety review is meaningless without context.
Define:
- what the system is supposed to do
- who can use it
- what data it sees
- what actions it can take
- what harm would matter most if it fails

Typical harm surfaces include:
- harmful advice
- hallucinated claims treated as factual
- discriminatory or exclusionary outputs
- unsafe automation or tool use
- privacy leakage
- prompt injection and instruction override
- content policy evasion
- over-trust due to confident but wrong behavior

### 2. Distinguish model risks from application risks

Review both layers:
- **model-level**: bias, toxicity, hallucination, refusal gaps, overconfidence, brittle behavior
- **system-level**: retrieval leakage, tool abuse, prompt injection, access control failures, unsafe automation, logging/privacy failures, insecure output handling

Do not collapse these into one bucket.

### 3. Review against trustworthy AI dimensions

Good reviews usually consider dimensions such as:
- validity and reliability
- safety
- security and resilience
- privacy
- fairness / harmful bias
- transparency / explainability where relevant
- accountability / governance

Not every review needs all dimensions equally, but they should be consciously considered.

### 4. Evaluate real failure modes, not just policy text

Check whether the system can fail in ways that matter operationally:
- can it be easily jailbroken?
- can it leak hidden context, secrets, or sensitive data?
- can retrieved or user-supplied content override instructions?
- can it generate harmful action plans, unsafe advice, or disallowed content?
- does it fabricate sources or facts with unjustified confidence?
- are refusal boundaries stable across paraphrases and multi-turn attacks?

### 5. Design realistic adversarial testing

When proposing red-team or evaluation work, include:
- normal-use tests
- edge-case tests
- adversarial prompts
- multi-turn attack scenarios
- policy-evasion attempts
- prompt injection attempts
- data exfiltration attempts
- unsafe tool-use or action-chaining scenarios where relevant

The tests should reflect the product’s real risk surface, not generic “gotcha” prompts only.

### 6. Assess mitigations as systems, not patches

Evaluate safeguards such as:
- system instructions / policy layers
- input filtering
- output moderation
- grounding / retrieval constraints
- tool permission boundaries
- access controls
- sandboxing / confirmation steps
- logging, monitoring, and incident response
- human review gates for high-risk actions

Say clearly where mitigations are likely brittle.

### 7. Produce actionable release guidance

Every review should answer:
- what are the top risks?
- how severe are they?
- what should be fixed before launch?
- what can be monitored after launch?
- what usage should be prohibited or constrained?
- what evidence would increase confidence?

## Adjacent skill boundaries

- **security-auditor**: broader system security posture; this skill focuses on AI- and LLM-specific risk behavior
- **model-evaluator**: may benchmark capability or quality; this skill evaluates safety and misuse risk specifically
- **compliance-officer**: governance/compliance framing; this skill tests behavioral safety and operational risk
- **prompt-architect**: may improve prompt structure; this skill determines whether prompt behavior is safe enough and where it fails

## Quality bar

A strong result should:
- define the use case and threat model clearly
- identify concrete failure modes, not vague “AI risk” language
- distinguish pre-launch blockers from monitorable post-launch issues
- include realistic adversarial testing ideas
- explain mitigations in system terms, not magic-bullet terms
- remain practical for product and engineering teams

## References to use

Use `prompt.md` for response style and evaluation posture.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` to shape output structure.
Use `meta/skill.json` for boundaries and metadata.
