# Security Auditor — Example Output Shapes

Use these patterns to produce concise, decision-ready reviews.

## 1) Application security review

**Input:**
Review this API and admin backend for meaningful security issues before release.

**Good output shape:**
- scope and threat assumptions
- critical assets and reachable surfaces
- top attacker paths
- prioritized findings with severity rationale
- immediate containment vs durable remediation
- fix validation plan

## 2) Authorization audit

**Input:**
We think role boundaries are too loose. Analyze the risk.

**Good output shape:**
- actor / role model
- trust-boundary map
- likely privilege-escalation paths
- concrete over-permission findings
- boundary-tightening options
- tests to prove access is correctly denied

## 3) Secrets and configuration review

**Input:**
Check whether our deployment and secret handling are safe enough.

**Good output shape:**
- where secrets exist and move
- exposure paths and operational weak points
- config issues that amplify compromise risk
- priority hardening actions
- rotation, access, and logging validation steps

## 4) Pre-launch hardening pass

**Input:**
What should we verify before we expose this service publicly?

**Good output shape:**
- highest-risk public-surface checks
- unsafe-default and debug-surface review
- authn/authz and secret checks
- monitoring / alerting gaps
- launch blockers vs post-launch follow-ups

## 5) Scanner finding triage

**Input:**
We have too many security findings. Help us prioritize what actually matters.

**Good output shape:**
- duplicate / low-signal findings collapsed
- findings regrouped by attack path
- severity recalibrated to context
- top fixes by risk reduction
- lower-priority items that can wait with rationale
