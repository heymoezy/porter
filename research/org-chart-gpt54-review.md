# GPT-5.4 Org Chart Review — 2026-03-24

## Assessment Summary

Current org chart is a solid blueprint for an autonomous operating system but not yet the org to run an autonomous company end-to-end.

**What's right:**
- Porter is singular and central
- Functions grouped by mission
- Memory, Forge, and Admin concerns properly separated

**Three structural problems:**
1. **Top layer too flat** — Porter directly oversees too many areas. No executive staff layer.
2. **Some teams are presentation-level splits** — Admin, Brain, Memory overlap. Should collapse into Platform/Governance.
3. **Light on company-risk roles** — Strong execution, weak control. Missing: budget authority, approval authority, compliance/risk authority, prioritization authority, incident authority.

## Recommended Org Chart

```
Porter (CEO)
├── Chief of Staff
│   ├── Delivery
│   ├── Product
│   └── Growth
├── Finance Controller
│   ├── Revenue Ops
│   └── Budget / ROI Control
├── Risk & Compliance
│   ├── Legal / Privacy
│   └── Approval Policy
├── Platform Governor
│   ├── Runtime / Brain
│   ├── Tools / Access
│   ├── Audit / Security
│   └── Memory Governance
├── Forge Director
│   └── Scribe / Mentor / Armorer / Inspector
└── Specialist Worker Pool
    ├── Engineering
    ├── Design
    ├── Research
    ├── Support
    ├── Content
    └── Domain Experts
```

## What To Keep
- Porter on top
- Forge as distinct capability
- Memory as distinct capability
- Product and Growth separation
- Specialist workers under functional leads, not all as peers

## What To Change
- Merge Brain + Admin + governance parts of Memory → Platform Governor umbrella
- Add Chief of Staff (prioritization, cross-team coordination, escalation)
- Add Finance Controller (budgets, spend limits, ROI thresholds)
- Add Risk & Compliance (approvals, policy guardrails, legal/privacy vetoes)
- Stop treating every useful function as a visible peer team
- Make many roles on-demand workers instead of permanent departments

## Human Oversight Layer (non-optional)
- Moe / operator approval queue
- Irreversible-action review
- Compliance exceptions
- High-value / high-risk outbound approval
- Quarterly org redesign / strategy reset

## Implementation Gaps
- Routing is heuristic (ai-router.ts:50)
- Decision traces are shallow (ai-router.ts:209)
- Scheduling is queue execution, not executive control (scheduler.ts:201)
- Core loops are feature-flagged (config.ts:59)
- Tenant and scope boundaries are partial (schema.ts:55, schema.ts:170)

## Verdict
"Close on the shape, not yet close on the control model. The org chart should become more executive and less catalog-like."
