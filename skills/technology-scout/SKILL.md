---
name: technology-scout
description: Research, compare, and assess technologies, vendors, frameworks, platforms, and emerging capabilities for real decisions. Use when the task is stack selection, buy-vs-build framing, tool/vendor comparison, maturity assessment, trend scanning, capability scouting, or deciding which technologies are production-ready, risky, overhyped, strategically important, or worth monitoring for a specific team, time horizon, and constraint set.
---

# Technology Scout

Separate durable signal from temporary hype so teams can make better technology bets.

## Scope

Use this skill for:
- technology landscape scans tied to an actual decision
- tool, platform, vendor, or framework comparisons
- build vs buy vs partner assessments
- maturity and adoption-risk analysis
- emerging-technology watch lists
- strategic recommendations for pilots, procurement, or near-term adoption
- stack-fit analysis for a team's actual constraints

Do not use this skill for:
- implementation planning after a tool is already chosen; use the relevant engineering skill
- generic market trivia dumps with no decision frame
- product strategy unrelated to technology choice; use **strategic-planner** or **product-manager**
- architecture design of the selected system; use **system-architect**
- procurement process execution and sourcing operations; use **procurement-specialist**

## Start from the decision

The question is never “what technologies exist?”
It is usually one of these:
- what should we adopt now?
- what should we pilot first?
- what should we avoid?
- what should we monitor but not commit to yet?
- what should we build ourselves versus buy?

If there is no concrete decision, create one before comparing anything.

## Inputs to define

Establish:
- **use case** — what problem must be solved
- **team reality** — skill level, headcount, ops tolerance, delivery speed
- **constraints** — budget, latency, security, compliance, hosting, region, integration requirements
- **time horizon** — immediate adoption, this year, strategic watch list
- **decision stakes** — reversible experiment or expensive lock-in risk
- **evaluation criteria** — capability, maturity, operability, migration burden, cost, roadmap fit, lock-in, ecosystem quality

## Comparison dimensions

Assess options across the dimensions that actually matter:
- functional fit to the use case
- implementation and migration effort
- operational burden after launch
- ecosystem health and community depth
- documentation and support quality
- interoperability and exit difficulty
- pricing predictability and long-term cost shape
- security and compliance posture
- roadmap credibility and vendor durability
- risk of adopting too early or too late

Do not give every dimension equal weight if the requester clearly values some more than others.

## Working method

### 1. Narrow the field
Remove options that fail hard constraints early.
A short relevant set beats a giant market map.

### 2. Separate evidence types
Distinguish:
- firsthand evidence or direct product facts
- credible external evidence
- vendor claims
- community sentiment
- speculation about future direction

Do not present marketing copy as validated reality.

### 3. Evaluate fit, not abstract excellence
The “best” technology in the abstract often loses in context.
Favor:
- team-fit
- integration-fit
- operations-fit
- time-to-value
- risk-adjusted usefulness

### 4. Distinguish now / next / watch
A good scout often produces three buckets:
- **adopt now** — strong fit and acceptable risk
- **pilot / benchmark** — promising but needs validation
- **watch list** — interesting, not yet justified

### 5. End with a recommendation
Do not stop at neutral comparison.
State what to do next, why, and under what conditions the recommendation would change.

## Output expectations

Useful outputs include:
- weighted comparison table
- decision memo
- build-vs-buy recommendation
- vendor shortlist
- watch list by horizon
- pilot plan with success criteria
- risk register for adoption or deferral

## Heuristics

Prefer:
- smaller relevant comparison sets
- explicit criteria and weighting
- evidence quality notes
- practical migration and ops realism
- recommendations matched to the team's actual capacity

Avoid:
- cataloging every option in the market
- treating novelty as a virtue
- ignoring lock-in until too late
- comparing only feature lists
- hiding behind “it depends” when a recommendation is possible

## Adjacent skill boundaries

- **system-architect**: designs the chosen system after the technology decision
- **procurement-specialist**: runs sourcing, vendor process, and commercial evaluation operations
- **competitive-intelligence**: tracks market and competitor moves more broadly
- **strategic-planner**: handles enterprise strategy where technology choice is only one part
- **technology-scout** owns the technology-choice frame itself

## Quality bar

A strong result:
- names the decision clearly
- filters options aggressively
- judges maturity honestly
- surfaces operational and lock-in risk early
- gives a recommendation the requester could actually act on next week

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
