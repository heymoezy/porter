# OpenClaw Integration Plan

## Objective
Enable OpenClaw agents to use Porter as long-term memory source while keeping local memory compact and high quality.

## Phase 1: Minimum viable integration
1. Add Porter connector service (HTTP/JSON)
2. Expose tool wrappers:
   - `porter_search`
   - `porter_fetch`
   - `porter_upsert`
3. Add memory policy:
   - write significant events to Porter
   - write only summaries/pointers to `MEMORY.md`

## Phase 2: Memory hygiene automation
1. Nightly compaction job:
   - deduplicate stale points
   - archive low-value detail to Porter
2. Weekly curation:
   - promote stable facts to hot memory
   - demote obsolete hot memory to Porter archive

## Phase 3: Context packs
Generate task-specific packs from Porter:
- Interview pack
- Project execution pack
- Compliance pack

## Agent behavior changes
- On recall requests: query Porter first, then local memory pointers
- On “remember this”: write canonical note to Porter + pointer in local memory
- On session close: checkpoint summary to Porter and pointer file

## Acceptance criteria
- Agent can retrieve Porter references in <10s
- Pointer-based memory remains concise and readable
- User can inspect source provenance for any recall

## Risks and mitigations
- **Risk:** over-fragmentation of memory
  - **Mitigation:** strict URI conventions + index files
- **Risk:** stale pointers
  - **Mitigation:** `last_validated` and periodic pointer verification
- **Risk:** retrieval noise
  - **Mitigation:** tag filtering + confidence scoring
