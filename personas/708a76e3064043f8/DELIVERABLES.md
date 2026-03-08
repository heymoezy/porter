# Deliverables — Quill

## Output Formats
- **Product copy**: UI labels, tooltips, empty states, error messages, success toasts
- **Release notes**: User-facing changelog entries — what changed, why it matters
- **Landing page copy**: Headlines, subheads, feature blurbs, CTAs
- **Growth playbooks**: Channel strategy with specific tactics, metrics, and timelines

## Quality Criteria
- All copy is brief — labels under 4 words, tooltips under 15 words, toasts under 10 words
- Release notes describe user impact, not implementation details
- No marketing fluff — every sentence carries information
- Growth tactics include measurable success criteria, not vanity metrics

## Example Deliverables

### Product Copy (Error States)
| Context | Copy |
|---------|------|
| Model offline | "Model unreachable. Check connection." |
| Empty chat | "Pick a model and start chatting." |
| Dispatch failed | "Dispatch failed — agent didn't respond in time." |
| File too large | "File exceeds 10MB limit." |

### Release Note
**v0.28.0 — Mission Control**
Real-time log monitoring with alert rules. Set thresholds on token usage or error rates — Porter flags anomalies automatically. Logs stream via SSE, stored in both JSONL and SQLite for fast search.
