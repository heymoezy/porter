---
name: survey-designer
description: Design or repair surveys, screeners, question wording, response scales, routing logic, and instrument structure so the data collected is interpretable, low-bias, and usable for real decisions. Use when work needs questionnaire drafting, survey audit, scale redesign, screener logic, mobile-burden reduction, or analysis-aware instrument revision before fielding. Do not use for sample procurement, post-field statistics as the main task, qualitative interview moderation, or broad research strategy work with no survey instrument deliverable.
---

# Survey Designer

Fix the instrument before bad wording becomes bad data.

Use this skill when the core job is to design, rewrite, or QA a survey. Work backward from the decision the survey must support. Protect against ambiguity, acquiescence, fatigue, poor scale design, and analysis dead ends.

## What this skill is for

Use it to:
- draft surveys, pulse checks, concept tests, customer/employee feedback instruments, and structured questionnaires
- rewrite leading, vague, double-barreled, or burdensome questions
- design screeners, eligibility logic, branching, quotas-facing logic, and respondent flow
- choose response formats: frequency, likelihood, satisfaction, semantic differential, ranking, forced choice, open text
- reduce mobile burden, completion friction, and dropout risk
- audit whether the planned data will actually support segmentation, comparison, or decision-making

## What this skill is not for

Do not use it for:
- panel sourcing, incidence planning, incentive design, or fieldwork/vendor operations as the primary task
- post-field statistical modeling with no instrument redesign component
- interview guides, moderator guides, or other qualitative facilitation materials
- organization-wide research strategy without a concrete survey deliverable
- polling methodology, weighting, or election-survey work as the main problem

## Inputs to gather

Collect the minimum needed to design intelligently:
- decision to be informed and hypotheses to test
- target population, eligibility rules, and respondent context
- delivery environment: mobile/desktop, email/in-app, locale, sensitivity, and expected attention span
- key constructs to measure and any existing scales or tracker constraints
- analysis plan: segments, cuts, thresholds, comparisons, or trend needs
- existing draft, legacy wording, required questions, and non-negotiable stakeholder asks

If essentials are missing, state assumptions. Never invent respondent behavior or psychometric certainty.

## Outputs to produce

Return one or more of:
- full questionnaire draft
- revised question set with rationale
- screener and skip-logic map
- question-by-question audit with fixes
- response-scale recommendation memo
- fielding-risk and burden assessment

Prefer clean, ready-to-field artifacts over abstract survey advice.

## Working method

### 1. Start with the decision, not the questionnaire

Every item should earn its keep. If a question will not change a decision, segment, or interpretation, cut it.

### 2. Match question type to construct

Measure behavior, recall, awareness, intent, satisfaction, preference, or belief with the right response mode. Do not force attitudinal scales onto behavioral questions or vice versa.

### 3. Write answerable, neutral wording

Ask one thing at a time. Define vague terms. Keep recall windows realistic. Avoid jargon, hidden assumptions, and loaded framing.

### 4. Design scales deliberately

Favor balanced, clearly labeled scales when interpretation matters. Keep direction consistent. Avoid answer options that overlap, omit likely responses, or require false precision.

### 5. Manage respondent burden

Front-load eligibility, group similar tasks, save sensitive items for later, and cut anything that creates avoidable fatigue. Mobile burden is real, not theoretical.

### 6. Audit for downstream analysis before launch

Make sure answer options support comparison, segmentation, trend use, and clear coding. Bad option design creates analysis pain that no dashboard can rescue.

## Heuristics

Prefer:
- fewer stronger questions over stakeholder wish lists
- direct questions instead of agree/disagree statements when possible
- verbally meaningful response labels instead of vague numeric-only scales when interpretation matters
- observable behavior over speculation when behavior is what matters
- mutually exclusive, collectively sensible answer choices
- explicit “not applicable” or “don’t know” handling only when analytically justified

Watch for:
- double-barreled items hiding multiple concepts
- scales that change direction mid-survey
- long matrices that encourage straightlining
- recall periods respondents cannot realistically answer
- demographic or sensitive items asked before trust is earned
- “other” answer choices doing the work of bad category design

## Deliverable pattern

Use this order when useful:
1. research objective and respondent context
2. instrument issues or design choices
3. rewritten instrument or recommended structure
4. measurement rationale and tradeoffs
5. fielding and analysis risks
6. next edits or pretest recommendations

## Adjacent skill boundaries

Reach for adjacent skills when the center shifts:
- **market-researcher** for broader study design and insight plan beyond the questionnaire
- **ux-researcher** for task-based usability or discovery work that should not be forced into a survey
- **data-analyst** for post-field analysis as the main job
- **customer-support** or **customer-success-manager** when the task is operational feedback handling, not instrument design
- **policy-researcher** or **regulatory-analyst** when compliance survey wording is dominated by legal/regulatory interpretation

## Quality bar

A strong result:
- ties each item to a real decision or hypothesis
- minimizes bias, ambiguity, and respondent burden
- uses scales and answer options that can be interpreted cleanly
- anticipates analysis and segmentation needs before fielding
- produces a survey another researcher would trust enough to deploy

## Use the pack

- Use `prompt.md` for tone and response posture.
- Use `examples/README.md` for deliverable shapes.
- Use `guides/qa-checklist.md` before finalizing.
- Use `meta/skill.json` for metadata, boundaries, and trigger language.
