---
name: chatbot-trainer
description: Improve chatbot behavior through prompt tuning, policy refinement, knowledge shaping, conversation review, rubric design, and training-data feedback loops. Use when the work is about making an assistant answer better, safer, more consistent, more on-brand, or more task-effective across real conversations. Do not use for model pretraining research, low-level ML infrastructure, or generic customer-support handling without a training or evaluation objective.
---

# Chatbot Trainer

Improve how a chatbot behaves in the wild.

This skill is for diagnosing conversation failures, refining instructions, designing evaluation criteria, improving retrieval or knowledge usage, and building repeatable feedback loops that make an assistant more reliable over time.

## Scope

Use this skill for:
- reviewing transcripts to find chatbot failure patterns
- designing prompt, policy, and behavior refinements
- creating evaluation rubrics and conversation test sets
- improving tone, helpfulness, escalation behavior, and answer consistency
- tuning knowledge-base usage, retrieval prompts, or guardrail wording
- labeling failure categories and proposing remediation loops
- preparing structured feedback for chatbot iteration cycles

## Do not use this skill for

Do not use this skill for:
- building model-training pipelines or ML infrastructure from scratch
- academic NLP experimentation with no product chatbot objective
- answering support tickets unless the goal is to improve the bot from them
- inventing policies or knowledge the business has not approved
- shipping prompt changes without considering regressions and eval coverage

## Inputs to gather

Before recommending changes, identify:
- chatbot purpose, audience, and success criteria
- current instructions, policies, and knowledge sources
- representative transcripts of strong and weak conversations
- failure types: hallucination, refusal, tone miss, escalation miss, retrieval miss, task drop
- business constraints, compliance rules, and brand voice requirements
- measurable goals such as resolution rate, containment, CSAT, accuracy, or deflection quality
- current evaluation process, if any

If there is no transcript evidence, ask for examples or state that the recommendations are provisional.

## Output expectations

Return outputs such as:
- transcript review with failure taxonomy
- prioritized chatbot improvement plan
- prompt or policy revision recommendations
- evaluation rubric and test conversation set
- knowledge-gap analysis and retrieval guidance
- before-and-after behavior examples with risks and validation steps

## Working method

### 1. Define success before fixing behavior

Clarify what the chatbot is supposed to optimize for:
- accurate answers
- issue resolution
- safe refusal behavior
- smooth escalation
- concise replies
- brand-consistent tone

A bot cannot be improved well against a vague standard.

### 2. Review real conversations, not abstract complaints

Inspect transcript evidence and tag patterns such as:
- wrong answer with high confidence
- retrieval miss despite available knowledge
- repetitive or robotic phrasing
- failure to ask a necessary clarification
- unnecessary escalation or failure to escalate
- policy overreach that blocks useful help

Use examples, not intuition, to justify changes.

### 3. Fix the layer causing the problem

Choose the right intervention:
- prompt rewrite for instruction clarity
- policy wording change for safety or escalation behavior
- retrieval/query change for knowledge access
- content update for missing source material
- rubric or eval addition for regression protection
- workflow change for human handoff quality

Do not treat every failure as a prompt problem.

### 4. Design for repeatability

Translate findings into durable assets:
- failure taxonomy
- rubric
- regression test set
- approved answer patterns
- escalation rules
- iteration backlog with severity and impact

Training without a loop is just commentary.

### 5. Validate behavior changes explicitly

For every recommended change, define:
- which failure mode it addresses
- example conversations it should improve
- risks of overcorrection
- what to monitor after rollout

Improvements should make the bot better overall, not merely different.

## Heuristics

Prefer:
- transcript-backed diagnosis
- small targeted changes over sweeping rewrites
- explicit rubrics and test cases
- separating policy, prompt, retrieval, and knowledge issues
- balancing containment with appropriate escalation

Avoid:
- rewriting the entire system prompt for isolated issues
- assuming user dissatisfaction always means “be warmer”
- optimizing only for deflection while harming trust
- ignoring failure severity and frequency
- making unsupported claims about improvement without evaluation design

## Review lenses

When evaluating chatbot-training work, check:
- Are the main failure modes clearly categorized?
- Is each recommendation tied to a specific observed problem?
- Are prompt, policy, retrieval, and content layers separated correctly?
- Is there a validation plan with sample conversations or rubric coverage?
- Would the proposed changes improve both answer quality and operational trust?

## Adjacent skill boundaries

- **model-evaluator**: broader model benchmarking beyond chatbot improvement workflows
- **prompt-engineer**: general prompt crafting rather than conversation-system iteration loops
- **customer-support**: solving support issues directly instead of improving the bot behind them
- **knowledge-base-author**: writing help content rather than tuning chatbot behavior around it
- **nlp-specialist**: deeper language-model research or pipeline work beyond product chatbot refinement

## Quality bar

A strong result should:
- isolate the actual causes of poor chatbot behavior
- recommend targeted changes at the right layer
- define how improvements will be tested
- reduce regressions and ambiguous advice
- leave the team with a repeatable training loop, not just opinions

## References to use

Use `prompt.md` for response stance and structure.
Use `examples/README.md` for common deliverable shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for metadata and boundaries.
