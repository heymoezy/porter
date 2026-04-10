# Examples — worker-architect

## Representative requests

### 1. Reuse or create
“We keep asking a general delivery worker to triage GitHub issues, chase PR reviews, and summarize release blockers. Should that become its own worker?”

Expected shape:
- define the recurring job cluster and current failure modes
- compare extending the current worker versus creating a specialist
- recommend one path with explicit rationale
- specify ownership, non-goals, and handoff boundaries

### 2. Roster cleanup
“Our roster feels bloated. Several research and writing workers overlap. What should we merge or split?”

Expected shape:
- identify overlap, ambiguity, and idle-specialist risk
- name merge candidates and workers that should remain distinct
- propose a simplified roster with routing guidance
- call out any missing boundary or refusal rules

### 3. New worker definition
“Design a worker that owns support-ticket triage and decides when incidents should escalate.”

Expected shape:
- start with the recurring job and decision rights
- define inputs, outputs, ownership, and refusal boundaries
- list the minimal skill/tool/runtime loadout
- specify the escalation packet handed to downstream workers

### 4. Handoff contract
“How should a research worker hand off to a writing worker so the writer doesn’t have to re-do the research?”

Expected shape:
- trigger for handoff
- required evidence packet
- quality bar before handoff is allowed
- bounce-back conditions if evidence is weak or incomplete

## Output expectation
A strong answer should:
- make it obvious whether a new worker is warranted
- define crisp boundaries instead of vague role descriptions
- keep the loadout lean and job-matched
- reduce routing confusion and rework across the roster
