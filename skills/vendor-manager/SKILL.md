---
name: vendor-manager
description: Evaluate, select, negotiate, govern, renew, or replace external vendors, agencies, software providers, outsourcers, and strategic suppliers with explicit attention to business fit, total cost, implementation burden, security/compliance, service levels, lock-in risk, and renewal leverage. Use when the main task is making or managing a vendor decision: scorecards, RFP/RFQ criteria, shortlist recommendations, negotiation prep, renewal strategy, performance reviews, or exit planning. Do not use when the main work is contract redlining, security auditing, or procurement-policy design.
---

# vendor-manager

Buy leverage, not just product.

This skill owns practical vendor decision quality: defining what must be true, comparing options on comparable criteria, exposing hidden lifecycle cost and dependency risk, and turning messy supplier information into a recommendation the team can actually act on.

## Scope

Use this skill for:
- vendor selection and shortlist decisions
- RFP, RFQ, and demo-scorecard design
- SaaS, agency, BPO, platform, or infrastructure vendor comparison
- renewal, renegotiation, replacement, and exit planning
- supplier performance reviews and corrective-action framing
- total-cost, SLA, support, lock-in, and implementation-risk analysis
- negotiation briefs with must-win terms and walk-away points

## Do not use this skill for

Do not use this skill for:
- line-by-line contract redlines or legal interpretation; use **contract-reviewer** or **ip-attorney** when legal depth is primary
- security-control testing or breach-path assessment; use **security-auditor**
- procurement-policy creation or compliance-governance design when the main task is internal controls; use **procurement-specialist** or **compliance-officer**
- architecture-fit assessment where the hard problem is technical design; use **system-architect**, **cloud-architect**, or another technical skill first

## Routing rules

Route to **vendor-manager** when the core question is:
- which vendor should we choose
- should we renew, renegotiate, replace, or exit
- what criteria should govern the decision
- where are the pricing, service, or dependency traps
- how should we structure a negotiation or performance reset

Do not route here just because a tool, SaaS product, or agency is mentioned. If the main work is implementation, legal redlining, security audit, or internal sourcing process design, another skill should lead.

## Inputs to gather

Before recommending anything, identify:
- business outcome the vendor must enable
- required capabilities vs nice-to-haves
- budget guardrails and full lifecycle cost sensitivity
- implementation effort, switching cost, and time-to-value pressure
- security, privacy, compliance, data residency, and SLA requirements
- expected volume, seats, integrations, and support model
- contract timing: renewal date, notice window, auto-renewal traps
- current pain points, incumbent leverage, and fallback options

If there is no decision context, say the vendor analysis is underspecified.

## Output expectations

Return outputs such as:
- weighted evaluation matrices
- shortlist or winner recommendations with rationale
- negotiation prep briefs
- renewal / replace / exit recommendations
- vendor-governance scorecards and review cadences
- risk registers covering lock-in, service, cost, and transition exposure

Lead with the decision or decision frame. Do not drown the user in generic procurement language.

## Working method

### 1. Define the buying job
State:
- what problem is being solved
- what success looks like 6–12 months after purchase
- what would make the vendor unusable even if features look strong

### 2. Separate hard requirements from preferences
Build criteria buckets such as:
- business fit
- technical fit
- implementation effort
- security / compliance
- service model and SLA
- commercial terms and TCO
- dependency / lock-in risk
- vendor stability and roadmap credibility

Weight them before comparing vendors.

### 3. Compare on lifecycle reality, not demo theater
Check for:
- onboarding and migration burden
- hidden usage tiers, overages, seat floors, or services dependency
- reference quality and support responsiveness
- data portability and exit mechanics
- contract terms that shift leverage at renewal

### 4. Recommend with tradeoffs
For each viable option, state:
- where it wins
- where it creates operational or commercial risk
- which scenario makes it the best choice
- what terms must be negotiated before signing

### 5. Plan governance after the decision
If the vendor is selected or already live, define:
- review cadence
- KPI / SLA scorecard
- issue-escalation path
- renewal decision date minus buffer
- triggers for remediation, competitive rebid, or exit

## Heuristics

Prefer:
- total cost over sticker price
- pilot evidence over polished demos
- leverage preservation over convenience lock-in
- explicit renewal timing discipline
- operational fit over feature-count bragging

Avoid:
- choosing on brand comfort alone
- treating references as proof without context
- ignoring migration and change-management cost
- vague scorecards with no weighting
- renewing because the deadline is close

## Adjacent skill boundaries

- **procurement-specialist** owns broader sourcing process, purchasing controls, and internal procurement rigor
- **contract-reviewer** owns contract-term interpretation and redline guidance
- **security-auditor** owns technical security assessment
- **operations-manager** owns day-to-day operating process once the vendor is embedded
- **cost-optimizer** may support spend analysis when the task is portfolio-wide savings, not a single vendor decision

## Quick routing examples

Use **vendor-manager** for:
- comparing three customer-support platforms with migration and compliance constraints
- deciding whether to renew an agency after missed deadlines and rising retainers
- preparing a SaaS renewal negotiation with seat compression and SLA demands
- setting a quarterly vendor scorecard for a logistics provider

Do not use **vendor-manager** for:
- marking up indemnity, liability, and termination clauses in detail; use **contract-reviewer**
- testing a vendor's cloud environment for security weaknesses; use **security-auditor**
- drafting internal purchasing policy; use **procurement-specialist**

## Quality bar

A strong result should:
- make the decision criteria explicit before naming a winner
- account for lifecycle cost, service quality, and dependency risk
- expose renewal, notice-period, and exit traps
- give a recommendation with clear tradeoffs and next moves
- be concise enough to use in a real buying or renewal meeting

## Use with

- `prompt.md` for execution posture and output structure
- `examples/README.md` for representative requests and deliverable patterns
- `guides/qa-checklist.md` for final review
- `meta/skill.json` for machine-readable metadata
