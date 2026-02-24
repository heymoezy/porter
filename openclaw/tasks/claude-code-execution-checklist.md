# Claude Code Execution Checklist

## Build order
1. Implement Porter memory API endpoints
2. Add storage layout and URI routing
3. Add indexing and search
4. Add OpenClaw connector wrappers
5. Add pointer schema validation
6. Add memory compaction scripts
7. Add tests

## Detailed tasks
- [ ] Create `POST /memory/search`
- [ ] Create `GET /memory/fetch`
- [ ] Create `POST /memory/upsert`
- [ ] Create `POST /memory/pointer`
- [ ] Define pointer schema and validation
- [ ] Add project/person/decision/compliance directory initializers
- [ ] Implement tagging model and simple ranking
- [ ] Add provenance metadata (`created_at`, `updated_at`, `source`, `version`)
- [ ] Write integration tests for all endpoints
- [ ] Write migration script for existing local memory into Porter refs

## Done definition
- All endpoints tested and documented
- Example integration with OpenClaw works end-to-end
- One real workflow (DFSA/MAS) demonstrated with pointer-based recall
