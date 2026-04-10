# QA Checklist — Accessibility Specialist

Use this before finalizing any accessibility-focused output.

## 1. Scope correctness
- Is the task actually accessibility-first, not generic design review?
- Is the relevant platform or flow identified?
- Are assumptions about standards or scope stated explicitly?

## 2. Audit completeness
- Did the review consider semantics, keyboard access, focus behavior, labels, errors, and content structure where relevant?
- Did it go beyond automated-scan issues?
- Are dynamic states and interaction flows considered, not just static visuals?

## 3. Standards alignment
- Is the guidance consistent with practical WCAG 2.1/2.2 AA expectations?
- Does it avoid overstating compliance certainty?
- Are ARIA recommendations appropriate and necessary?

## 4. User impact clarity
- Does each issue explain who is affected?
- Does it explain why the barrier matters?
- Are severity levels meaningful rather than arbitrary?

## 5. Fix quality
- Are fixes specific enough for designers/developers to act on?
- Are native semantic solutions preferred over complex workarounds?
- Are acceptance criteria or verification steps included where useful?

## 6. Common risk checks
- keyboard-only use possible
- focus visible and intentional
- interactive controls have accessible names
- forms have labels, instructions, and recoverable errors
- contrast and non-color cues covered
- screen-reader structure makes sense
- zoom/reflow and target size concerns considered when relevant

## 7. Output usefulness
- Is the result concrete rather than preachy or vague?
- Does it separate blockers from lower-priority improvements?
- Would a real team know what to do next?
