# Chatbot Trainer — Example Output Shapes

Use these as patterns for strong chatbot-training deliverables.

## Example 1 — Transcript audit

**Input:**
Review these 30 support-bot transcripts and tell us why the bot keeps failing.

**Good output shape:**
- chatbot goal and current success criteria
- failure taxonomy with transcript examples
- severity and frequency notes
- root-cause layer per failure type
- prioritized fixes and validation plan

## Example 2 — Prompt refinement request

**Input:**
Our bot sounds repetitive and misses escalation moments. Improve the instructions.

**Good output shape:**
- observed behavior summary
- likely prompt versus policy causes
- revised instruction recommendations
- sample before-and-after responses
- regression risks and test conversations

## Example 3 — Knowledge and retrieval tuning

**Input:**
The bot often says it doesn't know things that are already in our help center.

**Good output shape:**
- retrieval-failure hypotheses
- missing or weak source-content findings
- query or grounding recommendations
- sample conversations to test recall improvement
- metrics to watch after rollout

## Example 4 — Eval design

**Input:**
We need a better QA system for chatbot updates before shipping them.

**Good output shape:**
- evaluation goals
- rubric dimensions and scoring rules
- representative test set categories
- pass/fail thresholds or review triggers
- maintenance advice for the eval suite

## Example 5 — Brand and tone calibration

**Input:**
Make the assistant more professional without sounding cold.

**Good output shape:**
- target tone definition
- examples of current mismatch
- answer-pattern guidance
- do/don't phrasing examples
- validation prompts and conversation scenarios
