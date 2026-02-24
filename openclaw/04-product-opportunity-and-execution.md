# Porter Memory Platform
## Product Opportunity and Execution Blueprint

## 1) Product thesis
Porter remains a strong cross-device file system first. The new opportunity is to add an optional memory layer that helps humans and agents retain context over time without bloating local memory files.

Core rule:
- Do not replace existing Porter behavior.
- Add memory capabilities as optional modules.

This gives two outcomes at once:
1. Existing users keep the current Porter experience.
2. Advanced users unlock persistent, token-efficient agent memory.

---

## 2) What problem this solves
Current pain:
- Important context is scattered across devices, chats, notes, and project folders.
- Agent memory files become bloated and expensive to query repeatedly.
- Users re-explain context every session.

Target outcome:
- One canonical memory source in Porter.
- Small local memory pointers for OpenClaw and Claude Code.
- Fast retrieval of only relevant slices.

---

## 3) Product positioning
Primary product:
- Porter: file continuity across devices.

Premium layer:
- Porter Memory: context continuity across humans and agents.

Positioning line:
- "Porter is your cross-device file layer. Porter Memory is your cross-session context layer."

---

## 4) Design principles
1. Non-invasive integration
   - Existing workflows must continue unchanged.
2. Pointer-first memory
   - Store long context in Porter, keep local memory compact.
3. Provenance always
   - Every recalled fact should point to source URI + timestamp.
4. Token efficiency by default
   - Fetch only needed excerpts, not full files.
5. Human override always
   - Direct user instructions can change behavior instantly.

---

## 5) Integration model
### 5.1 OpenClaw integration
Add optional connector endpoints used by OpenClaw memory tools:
- Search memory documents
- Fetch excerpt by URI + range
- Upsert notes
- Create/update memory pointers

OpenClaw memory policy:
- Local `MEMORY.md` stays concise.
- Long details live in Porter docs.
- Local memory references Porter URIs.

### 5.2 Claude Code integration
Claude Code remains your execution engine. Porter acts as shared context store:
- Claude writes implementation notes, decisions, and checkpoints to Porter.
- Claude reads prior context before making architecture changes.
- No forced workflow changes: only when you instruct it.

---

## 6) Memory architecture
Three tiers:
1. Hot memory (local)
   - User preferences, current priorities, critical anchors.
2. Warm memory (local pointer docs)
   - Summaries with Porter URIs.
3. Cold memory (Porter canonical docs)
   - Full notes, transcripts, evidence, artifacts.

Result:
- Better continuity
- Lower token usage
- Cleaner memory hygiene

---

## 7) Proposed feature set
### Phase 1 (Fast path: 1-2 weeks)
- Optional memory API endpoints
- Pointer schema
- URI conventions
- Search + fetch + upsert

### Phase 2 (2-4 weeks)
- Memory compaction jobs
- Pointer validation and stale-link checks
- Context pack generator (for interview/project/compliance use)

### Phase 3 (4-8 weeks)
- Multi-agent memory views (OpenClaw + Claude Code + future tools)
- Confidence scoring on memory retrieval
- Memory timeline and diff view

---

## 8) Token-efficiency mechanics
- Retrieval by scope (`project`, `topic`, `date`, `tag`)
- Snippet windowing (line ranges)
- Pointer summaries capped by size
- Automatic demotion of old detail from hot to cold memory

Success target:
- 40-70 percent reduction in repeated context tokens for ongoing projects.

---

## 9) UX concepts
1. Memory pointer cards
   - Title, summary, tags, source URI, last validated date.
2. Context packs
   - One-click bundle for "all relevant context for this task".
3. Explainability strip
   - "Answer generated from: URI A + URI B + URI C"

---

## 10) Business opportunity
### Why this is real
- AI workflow users now hit context fragmentation daily.
- Existing file tools do not solve agent memory continuity.
- Teams need traceability and defensible recall, not just chat history.

### Who pays first
- Founder-operators
- Technical consultants
- Compliance-heavy teams
- Power users with multi-device setup

### Monetization direction
- Free/core: file layer
- Pro: memory connectors, context packs, advanced search
- Team/enterprise: policy controls, audit logs, role-based access

---

## 11) Risks and mitigations
Risk: product confusion (files vs memory)
- Mitigation: keep memory as explicit optional module.

Risk: overbuilding before usage signals
- Mitigation: ship minimal APIs and measure adoption.

Risk: memory quality drift
- Mitigation: provenance + validation dates + curation workflow.

---

## 12) Implementation guardrails for Claude Code
- Do not modify existing Porter core behavior unless explicitly instructed.
- Add all memory features behind feature flags or dedicated endpoints.
- Keep migration reversible.
- Add tests for backward compatibility.

---

## 13) 30-day execution plan
Week 1:
- Implement memory API basics
- Add pointer schema + URI conventions

Week 2:
- Add OpenClaw connector wrappers
- Demo real workflow (DFSA or project continuity)

Week 3:
- Add Claude Code memory write/read workflow
- Add context pack generator

Week 4:
- Stabilize, test, document, package for launch narrative

---

## 14) Launch narrative draft
"Porter started as cross-device files.
Now Porter Memory gives you cross-session intelligence.
Your files stay where they are. Your context finally stays with you."

---

## 15) Immediate next steps
1. Keep current Porter behavior untouched.
2. Implement memory APIs as optional module.
3. Wire OpenClaw pointer-based recall.
4. Add Claude Code memory checkpoints.
5. Validate token savings and memory quality on one live project.
