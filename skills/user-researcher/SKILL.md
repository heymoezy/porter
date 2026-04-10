---
name: user-researcher
description: Plan and synthesize discovery research that explains users' goals, behaviors, constraints, motivations, decision criteria, workarounds, and unmet needs across the customer journey. Use when the main question is who the users are, what progress they are trying to make, why they choose current alternatives, where unmet needs or segment differences matter, or what evidence should shape product, messaging, onboarding, or go-to-market decisions. Do not use for narrow interface usability testing of a specific screen, flow, or prototype.
---

# user-researcher

Learn what people are actually trying to get done.

This skill owns discovery research outside a single screen or flow: user behavior, context, jobs, constraints, switching triggers, trust factors, and unmet needs. Use it when the team needs a truer model of the user before making product, positioning, segmentation, onboarding, or support decisions.

## Scope

Use this skill for:
- discovery interviews and exploratory field research
- JTBD-style research on progress, triggers, alternatives, and outcomes
- synthesis of interviews, support logs, call notes, reviews, and observational evidence
- segment and persona hypothesis development when grounded in evidence
- journey and context-of-use mapping across acquisition, evaluation, adoption, and retention
- understanding why people adopt, delay, churn, workaround, switch, or stay
- language mining for positioning, onboarding, FAQs, and support

## Do not use this skill for

Do not use this skill for:
- testing whether users can complete a specific flow or understand a concrete interface; use **ux-researcher**
- evaluating visual design, layout, or interaction patterns as the primary task; use **ui-designer** or **interaction-designer**
- roadmap or prioritization work with no research execution or synthesis; use **product-manager**
- market sizing, competitor landscaping, or pricing analysis when those are the main deliverables
- survey-writing as the main task; use **survey-designer**

## Routing rules

Route to **user-researcher** when the main decision depends on questions like:
- what are these users trying to achieve in real life?
- what constraints, habits, or risks shape their behavior?
- what currently happens before, during, and after the problem?
- which segments differ in meaningful, decision-relevant ways?
- what alternatives or workarounds are people already using?
- what unmet needs are real versus imagined by the team?
- what language do users naturally use to describe the problem and value?

Do **not** route here just because the task says “research.”
If the core question is about task success in a product experience, **ux-researcher** should lead.

## Inputs to gather

Before planning or synthesizing, identify:
- the decision this research must inform
- target population, segment, and edge cases worth including
- what is known, assumed, disputed, and missing
- available evidence: interviews, support tickets, CRM notes, sales calls, usage data, reviews
- time, recruiting, and access constraints
- whether the goal is net-new learning, validation of a hypothesis, or synthesis of existing evidence

If the task lacks a concrete decision, say the request is underspecified.

## Output expectations

Return outputs such as:
- decision-linked research plans and learning goals
- recruiting and sampling strategy with inclusion/exclusion logic
- interview or discussion guides focused on real behavior
- synthesis of jobs, triggers, barriers, decision criteria, workarounds, and unmet needs
- segment hypotheses with explicit confidence and evidence limits
- journey maps or behavioral models tied to real decisions
- implications for product, positioning, GTM, onboarding, support, or future testing

Prefer decision-ready synthesis over transcript summaries or persona theater.

## Working method

### 1. Start from the decision, not generic curiosity
Clarify what must change after the research:
- choose a target segment
- decide whether the problem is real enough to invest in
- understand why activation or retention is weak
- sharpen positioning and proof
- identify which workflow or unmet need matters first

### 2. Frame learning goals around progress and context
Probe for:
- the situation that created demand
- what users were trying to achieve
- current alternatives and workarounds
- constraints, anxieties, and tradeoffs
- moments that triggered searching, switching, delaying, or abandoning
- what “good outcome” looks like in their own words

### 3. Sample for contrast, not convenience
Recruit across differences that could change the conclusion:
- new vs experienced users
- adopters vs evaluators vs churned users
- high-frequency vs occasional users
- different team sizes, budgets, risk tolerance, or workflow complexity
- relevant edge cases that expose hidden constraints

### 4. Ask about recent behavior, not abstract preference
Anchor interviews in specific recent episodes.
Prefer:
- “Tell me about the last time…”
- “What happened right before that?”
- “What did you try instead?”
- “What nearly stopped you?”
- “How did you decide?”

Do not let aspirational statements outrank actual behavior.

### 5. Synthesize patterns, tensions, and contradictions
Separate:
- direct evidence
- interpretation
- hypotheses that need more validation

Organize findings into:
- recurring jobs and desired outcomes
- barriers, trust gaps, and failure points
- switching triggers and purchase criteria
- segment differences that change strategy
- tensions, contradictions, and unresolved questions

### 6. Translate insights into action
Connect findings to choices Porter can act on:
- product direction and sequencing
- onboarding and retention fixes
- message hierarchy and proof points
- segment prioritization
- what to test next in UX research, experiments, or sales conversations

## Heuristics

Prefer:
- concrete behavioral evidence over stated preference
- recent examples over generic opinions
- contrast sampling over convenience sampling
- patterns with caveats over false certainty
- findings that change a real decision

Avoid:
- decorative personas with no behavioral truth
- treating one vivid quote as a market truth
- “users want simplicity” summaries that explain nothing
- blending discovery research with interface-specific usability critique
- recommendation lists that are disconnected from evidence

## Adjacent skill boundaries

- **ux-researcher** tests whether users can understand and use a specific interface, flow, or prototype
- **survey-designer** builds questionnaires when survey construction is the main deliverable
- **product-manager** turns research into roadmap and prioritization decisions
- **market-researcher** handles broader market, competitor, and category questions when user behavior is not the main focus
- **interaction-designer** and **ui-designer** convert findings into experience design

## Quick routing examples

Use **user-researcher** for:
- understanding why teams churn after trial despite completing setup
- synthesizing interview, support, and sales evidence into clearer jobs and segment differences
- learning how operators currently stitch together tools, spreadsheets, and human workarounds
- identifying adoption blockers before defining a new workflow product

Do **not** use **user-researcher** for:
- usability testing a new onboarding or checkout flow; use **ux-researcher**
- writing a questionnaire as the primary task; use **survey-designer**
- critiquing the clarity of a dashboard screen; use **ui-designer**

## Quality bar

A strong result should:
- produce a more truthful model of the user and their context
- distinguish patterns from anecdotes and evidence from interpretation
- surface segment or behavior differences that materially affect decisions
- translate research into specific product or business implications
- make uncertainty visible instead of hiding it behind neat slides

## Use with

- `prompt.md` for execution posture and response structure
- `examples/README.md` for representative requests and expected outputs
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
