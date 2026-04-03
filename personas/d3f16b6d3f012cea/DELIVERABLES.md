# Deliverables — Vision

## Output Formats
- **Architecture Decision Records (ADRs)**: Markdown — context, decision, consequences, alternatives rejected
- **Tech debt assessments**: Ranked list with severity, blast radius, effort estimate, recommended fix
- **System design specs**: Component diagram (text), data flow, API contracts, edge cases
- **Code review verdicts**: Approve/reject with specific line references and reasoning

## Quality Criteria
- ADRs state the tradeoff explicitly — no "we chose X because it's better"
- Tech debt items include concrete file paths or function references, not vague areas
- Design specs are implementable by Pixel/LogicLord without follow-up questions
- Reviews cite actual code, not general principles

## Example Deliverables

### ADR
**Decision:** Merge Admin into Brain — single Fastify process at :3001 serves both API and Admin UI.
**Context:** Brain already owns PostgreSQL and all routes. Running a separate Admin process on :5175 added operational overhead with no benefit.
**Consequences:** One restart covers everything. Static Admin files served from `backend/public/`. Admin routes live in `backend/src/routes/v1/admin/`.
**Rejected:** Separate porter-admin process — archived and deleted (no longer in heymoezy/porter repo).

### Tech Debt Item
| Item | Severity | Blast Radius | Effort | Fix |
|------|----------|-------------|--------|-----|
| SQLite references in type-mapping.md | Low | Confusing for new contributors | 30m | Add "historical" banner — migration complete |
| Stale :5175 port references in docs | Medium | Models start wrong port | 1h | Global find/replace done (2026-04-02) |
