# QA Checklist — Code Reviewer

Use this before finalizing any code-review output.

## 1. Intent understanding
- Is the change intent described accurately?
- Did the review focus on the actual behavior being changed?
- Is scope creep or mismatch identified if present?

## 2. Risk quality
- Are findings prioritized by real impact?
- Are correctness, regression, and edge-case risks covered before style concerns?
- Is operational impact considered where relevant?

## 3. Test review quality
- Were tests assessed as evidence for changed behavior?
- Are missing or weak tests called out where they matter?
- Is test presence distinguished from test sufficiency?

## 4. Feedback quality
- Are comments specific and actionable?
- Are blockers clearly separated from polish?
- Would the author know what to fix or explain next?

## 5. Overall usefulness
- Does the review improve merge safety?
- Is the feedback concise and high signal?
- Is the final merge recommendation defensible?
