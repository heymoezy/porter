# QA Checklist — Release Manager

## 1. Scope and ownership
- Is the release type, scope, and affected audience explicit?
- Are exclusions and conditional items named?
- Is every critical step assigned to an owner?

## 2. Dependency quality
- Are migrations, flags, approvals, docs, support, and analytics dependencies visible?
- Are hidden prerequisites surfaced?
- Are risky assumptions called out rather than implied?

## 3. Runbook quality
- Is the sequence concrete enough to execute under time pressure?
- Are go/no-go criteria explicit?
- Are stop conditions and escalation paths defined?

## 4. Safety and recovery
- Is rollback or kill-switch logic explicit?
- Are rollback limitations called out for one-way changes?
- Is monitoring assigned with named checks and thresholds?

## 5. Communication quality
- Are release notes written in terms of user or operator impact?
- Are internal, external, and support audiences covered appropriately?
- Is there a contingency plan for delay or partial rollout?

## 6. Final bar
- Could another operator run this release confidently?
- Would this plan reduce launch chaos instead of creating more of it?
- Does it close the loop with verification and follow-up, not just deployment?
