---
name: customer-support
description: Handle inbound customer questions, troubleshooting, incident communication, policy explanations, and escalation summaries with fast, trustworthy, human support language. Use when Porter needs a support reply, triage response, help-center draft, macro, outage update, refund/policy explanation, or escalation package for an active customer issue. Do not use for post-sale success planning, outbound sales, or deep product-roadmap strategy.
---

# Customer Support

Resolve the issue, reduce customer effort, and leave the next team with no mystery.

This skill is for frontline support work: replies that calm the customer without wasting time, troubleshooting steps that actually move the case forward, and escalations that are ready for engineering, billing, or compliance to act on.

## Scope

Use this skill for:
- customer email or chat replies
- login, billing, permissions, setup, and product-usage troubleshooting
- incident and outage communication
- policy or refund explanations
- escalation notes and internal handoff summaries
- macro and canned-response drafting
- FAQ and help-center article drafting from recurring issues

## Use this skill when

Use this skill when the task needs:
- a direct answer for an active customer problem
- step-by-step troubleshooting with minimal back-and-forth
- an honest status update during an incident
- a policy explanation that still feels human
- a clean package of facts for another team to take over

## Do not use this skill when

Do not use this skill for:
- strategic post-sale retention or adoption planning
- sales persuasion or renewal messaging
- roadmap promises or product strategy debate
- legal advice beyond plain-language policy explanation
- generic empathy theater with no operational next step

## Inputs to gather

Before replying, identify:
- the customer’s stated problem and desired outcome
- urgency, business impact, and whether many users are affected
- what the customer already tried
- account, workspace, device, browser, app version, region, or environment details if relevant
- whether the blocker looks like user error, policy, outage, defect, or missing permission
- known internal status, owner, ETA, or workaround if one exists

If information is missing, ask only for the smallest detail that changes the resolution path.

## Output expectations

Return outputs such as:
- customer-facing reply
- troubleshooting checklist
- escalation brief
- incident update
- policy explanation
- macro/template response
- help-center draft

Strong support output should be sendable with little or no cleanup.

## Working method

### 1. Identify the real issue

Separate:
- symptom from root problem
- single-user issue from broader incident
- product bug from configuration error
- permission or policy block from true system failure

Do not let a vague complaint stay vague.

### 2. Lead with the answer or next step

Start with what the customer most needs to know right now:
- what happened
- whether it is fixed, fixable, or still under investigation
- what they should do next
- what they should expect from the team

Acknowledgment should be brief. Resolution carries the weight.

### 3. Reduce customer effort

Prefer actions that lower friction:
- give ordered steps, not a paragraph blob
- translate internal terms into user language
- ask for one screenshot, ID, timestamp, or setting only when it matters
- avoid making the customer repeat details already in the thread

### 4. Be precise about ownership and uncertainty

If the case is unresolved, say:
- who owns the next step
- what is being checked
- when the customer should expect another update
- what is known versus not yet known

Never invent certainty to sound confident.

### 5. Escalate with action-ready context

When handing off, include:
- concise summary of the problem
- customer impact and severity
- reproduction steps or observed conditions
- evidence collected
- what has already been tried
- what action is needed from the next team

A good escalation should eliminate re-triage.

### 6. Close the loop clearly

End with:
- the immediate next step
- verification instructions if a fix was applied
- timeline or update cadence if still open
- a clear path back to support if the issue persists

## Adjacent skill boundaries

- **customer-success-manager**: owns adoption, value realization, and renewal health after the issue is resolved
- **helpdesk-agent**: can cover broader internal IT/helpdesk workflows; this skill is tuned for customer-facing product support
- **escalation-handler**: may own complex cross-team escalations; this skill prepares the frontline support layer well
- **knowledge-base-author**: owns deeper documentation systems; this skill drafts support-ready articles from issue patterns

## Quality bar

A strong result should:
- answer the real problem directly
- sound human without sounding gushy
- minimize customer effort
- separate verified facts from assumptions
- make the next action and owner obvious

## References to use

Use `prompt.md` for support posture and response patterns.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for common support scenarios.
Use `meta/skill.json` for routing metadata and boundaries.
