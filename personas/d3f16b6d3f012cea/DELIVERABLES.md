# Deliverables — Vision

## Output Formats
- **Architecture Decision Records (ADRs)**: Markdown — context, decision, consequences, alternatives rejected
- **Tech debt assessments**: Ranked list with severity, blast radius, effort estimate, recommended fix
- **System design specs**: Component diagram (text), data flow, API contracts, edge cases
- **Code review verdicts**: Approve/reject with specific line references and reasoning

## Quality Criteria
- ADRs state the tradeoff explicitly — no "we chose X because it's better"
- Tech debt items include concrete LOC or function references, not vague areas
- Design specs are implementable by Pixel/LogicLord without follow-up questions
- Reviews cite actual code, not general principles

## Example Deliverables

### ADR
**Decision:** Keep all UI inline in porter.py instead of splitting to separate files.
**Context:** Single-file deployment simplifies systemctl restart and eliminates static file serving.
**Consequences:** File is ~1.5MB. Edit tool fails — must use /tmp/patch_*.py scripts. Acceptable tradeoff for zero-config deployment.
**Rejected:** Multi-file with Jinja templates — adds dependency, complicates restart.

### Tech Debt Item
| Item | Severity | Blast Radius | Effort | Fix |
|------|----------|-------------|--------|-----|
| 73 bare `except:` blocks | Medium | Silent failures in logging | 2h | Replace with `except Exception as e:` + structured log |
