# QA Checklist — Project Lineage

Use this before finalizing any lineage-focused output.

## 1. Scope correctness
- Is the exact object being traced explicit?
- Is the time window or event boundary defined?
- Is the reason for tracing it clear?

## 2. Evidence integrity
- Are sources identified and weighted by strength?
- Are strong claims anchored in records where possible?
- Are missing records or weak links labeled directly?

## 3. Analytical discipline
- Are chronology, dependency, and causality kept separate?
- Are transformations, handoffs, forks, and overrides mapped?
- Are downstream consumers or impacts included where relevant?

## 4. Source-of-truth clarity
- Is the current authoritative source named when possible?
- Are conflicting records called out explicitly?
- Is uncertainty stated instead of glossed over?

## 5. Practical value
- Does the lineage explain why the current state exists?
- Does it support a current audit, migration, remediation, or accountability decision?
- Are verification steps listed for unresolved gaps?

## 6. Common failure checks
- speculative narrative presented as fact
- timeline mistaken for causation
- ownership shifts ignored
- downstream impact omitted
- no current recommendation on what to trust now
