# Architecture and Data Model

## High-level architecture
1. **Porter Storage Layer**
   - canonical files (notes, project docs, transcripts, decisions)
2. **Porter Index Layer**
   - metadata, tags, embeddings/search index
3. **OpenClaw Connector Layer**
   - tools: search, fetch, write, summarize pointers
4. **Agent Working Memory Layer**
   - compact local files referencing Porter documents

## Memory tiers
- **Hot memory** (`MEMORY.md`): stable preferences, active priorities, critical anchors
- **Warm memory** (pointer files): project/person/decision summaries with Porter refs
- **Cold memory** (Porter docs): full canonical history and evidence

## Proposed pointer format
```yaml
id: mem_dfsa_mas_001
title: MAS transaction explanation
summary: Buyout, earnout-to-loan shift, LP protection rationale, governance lapse.
source:
  porter_uri: porter://compliance/mas/transaction-history.md
  version: 2026-02-24T05:36:00Z
tags: [mas, dfsa, interview, governance]
confidence: high
last_validated: 2026-02-24
```

## Porter URI convention
- `porter://projects/<project>/...`
- `porter://people/<name>/...`
- `porter://decisions/<yyyy>/<slug>.md`
- `porter://compliance/<topic>/...`

## OpenClaw connector API (Phase 1)
### 1) Search
`POST /memory/search`
```json
{ "query": "MAS circular structure", "limit": 5, "tags": ["mas"] }
```

### 2) Fetch
`GET /memory/fetch?uri=porter://compliance/mas/transaction-history.md&from=1&lines=80`

### 3) Upsert note
`POST /memory/upsert`
```json
{
  "uri": "porter://projects/porter/openclaw-memory-plan.md",
  "content": "...",
  "tags": ["porter", "openclaw", "memory"],
  "source": "agent"
}
```

### 4) Create pointer
`POST /memory/pointer`
```json
{
  "id": "mem_porter_strategy_001",
  "title": "Porter as memory substrate",
  "summary": "...",
  "porter_uri": "porter://projects/porter/strategy.md",
  "tags": ["strategy","memory"]
}
```

## File organization in Porter
```text
porter/
  projects/
  people/
  decisions/
  compliance/
  transcripts/
  artifacts/
  indexes/
```

## Quality rules
- Pointer summaries must be factual, not speculative
- Every pointer must include canonical source URI
- Critical claims should include timestamp/version
- No destructive overwrite without versioning
