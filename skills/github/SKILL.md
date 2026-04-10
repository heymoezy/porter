---
name: github
description: Operate GitHub repositories through repository state, pull requests, reviews, checks, releases, and metadata using `gh` or the GitHub API. Use when the task is to inspect repo status, compare branches, review pull-request readiness, interpret CI/check failures, manage labels/reviewers/milestones, summarize releases, or fetch GitHub-native data. Do not use when the main job is implementing code changes, deep issue-queue operations better handled by `gh-issues`, or non-GitHub deployment debugging.
---

# GitHub

Use this skill for GitHub-native repo operations, not for coding itself.

## Work the repo from live state

Start from current evidence:
- repository and owner/repo name
- current branch or target PR
- review state and requested reviewers
- required checks, failing checks, and branch-protection implications
- linked issues, milestones, releases, and labels
- the decision needed: inspect, summarize, unblock, merge, tag, or coordinate

Prefer `gh` and GitHub API data over guesswork.

## Core workflow

1. **Establish state first**
   - Confirm repo, branch, PR number, base/head, and current status.
   - Read the important metadata before forming an opinion.
2. **Frame the exact job**
   - Branch comparison
   - PR review / merge-readiness call
   - CI failure interpretation
   - release summary
   - metadata operation such as reviewer, label, milestone, or issue/PR linkage
3. **Summarize by intent, not by diff size**
   - What changed
   - Why it changed
   - Where risk concentrates
   - What still blocks progress
4. **Interpret checks intelligently**
   - Distinguish real blockers from flaky, stale, optional, or unrelated failures.
   - Note whether missing approvals, CODEOWNERS, or branch protection still block merge.
5. **End with an explicit action**
   - Merge
   - Request changes
   - Rebase/update branch
   - Rerun or fix a specific check
   - Add/remove reviewer
   - Split work or open a follow-up

## What good output looks like

Return compact, operational answers such as:
- merge-readiness verdict with blockers
- branch divergence summary with reconciliation advice
- CI triage with likely owner and next step
- release-note summary grouped by user impact
- reviewer/owner recommendation tied to changed files
- GitHub metadata changes or command suggestions

## Heuristics

Prefer:
- live repo facts over memory
- concise status language
- risk-ranked blockers
- exact next actions
- reviewer and ownership clarity

Avoid:
- narrating the whole diff without judgment
- treating every red check as equally important
- giving a merge recommendation without noting meaningful risk
- drifting into backlog triage or implementation work

## Boundary calls

Use adjacent skills instead when the center of gravity changes:
- **gh-issues**: backlog shaping, issue intake, labels/forms/queue operations at issue-program level
- **code-reviewer**: deeper implementation critique inside the diff
- **release-manager**: broader release orchestration across streams
- **devops-engineer / site-reliability**: runtime or deployment debugging outside GitHub

## Final check

Before finishing, verify:
- all repo/PR/check facts are current
- blockers are clearly separated from nice-to-haves
- recommendations are tied to evidence
- the next GitHub action is obvious

Use `prompt.md` for response structure, `examples/README.md` for deliverable shapes, `guides/qa-checklist.md` for final review, and `meta/skill.json` for boundaries and metadata.
