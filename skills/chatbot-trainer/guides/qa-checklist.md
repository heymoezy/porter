# QA Checklist — Chatbot Trainer

Use this before finalizing any chatbot-training output.

## 1. Evidence quality
- Are the findings grounded in real transcripts, examples, or approved behavior requirements?
- Are failure modes categorized clearly instead of bundled loosely?
- Are frequency, severity, or business impact considered where possible?

## 2. Root-cause precision
- Does each recommendation target the right layer: prompt, policy, retrieval, knowledge, workflow, or evaluation?
- Are support-process or content problems separated from model-behavior problems?
- Are proposed fixes tied to specific observed issues?

## 3. Improvement design
- Is there a practical prioritization of changes?
- Are before-and-after examples, rubric updates, or test cases included where useful?
- Are overcorrection and regression risks identified?

## 4. Operational usefulness
- Could a team implement the recommendations without guessing what to do next?
- Are success metrics or validation steps defined?
- Does the output improve long-term iteration discipline rather than just commenting on failures?

## 5. Overall strength
- Would the recommended changes likely make the chatbot more reliable and trustworthy?
- Is the work specific, testable, and aligned with the bot's purpose?
- Does the result create a repeatable training loop rather than a one-off opinion dump?
