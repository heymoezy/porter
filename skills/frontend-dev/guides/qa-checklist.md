# QA Checklist — Frontend Developer

Use this before finalizing any frontend-dev output.

## 1. Scope and fit
- Is the primary difficulty actually in browser-facing behavior?
- Would frontend-dev still be the right skill if tiny backend edits were removed?
- Are adjacent boundaries with backend-dev, fullstack-dev, ux-designer, and accessibility-specialist respected?

## 2. User-visible quality
- Are loading, empty, error, retry, pending, and permission states handled where relevant?
- Is the UI usable on keyboard and reasonable on touch?
- Are focus behavior, announcements, semantics, and target sizes acceptable?
- Is responsive behavior defined instead of assumed?

## 3. Architecture and correctness
- Is state ownership clear and proportional?
- Are server state and local UI state separated appropriately?
- Are timing, race, hydration, and stale-data issues considered where relevant?
- Does the solution reduce brittleness instead of adding more conditional clutter?

## 4. Evidence and verification
- Are claims tied to actual code, reproduction steps, tests, or browser checks?
- Are unverified assumptions labeled clearly?
- Were realistic interaction paths checked, not just static rendering?

## 5. Deliverable usefulness
- Can another operator quickly see what changed and why?
- Are tests, browser checks, risks, and follow-ups explicit?
- Is the result concise without skipping the states that matter?
