# Memory Curator — Example Output Shapes

## Example 1 — Durable directive extraction

**Input:**
Turn an ops thread into memory candidates.

**Good output shape:**
| Type | Candidate or action | Why | Confidence |
|---|---|---|---|
| directive | Always update the canonical project checkpoint after shipping changes. | repeated operating rule with future value | high |
| discard | "Let's revisit this Thursday afternoon." | scheduling chatter only | high |

## Example 2 — Superseding stale memory

**Input:**
A newer architecture decision conflicts with an old note.

**Good output shape:**
- existing memory
- new evidence
- recommendation: supersede
- final replacement text
- reason the old note should no longer be trusted

## Example 3 — Session summary for reuse

**Input:**
Summarize a debugging session for future agents.

**Good output shape:**
- outcome shipped
- verified root cause
- lasting rule or constraint
- one unresolved follow-up only if it matters later

## Example 4 — Merge review

**Input:**
Three notes all describe the same customer preference differently.

**Good output shape:**
| Existing entries | Decision | Final memory text | Reason |
|---|---|---|---|
| note A, note B, note C | merge | concise normalized preference statement | removes duplication and ambiguity |