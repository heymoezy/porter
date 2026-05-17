# Admin & Platform Operations Silo Dream — Refinement Synthesis

You are reading the last 3 days of an operator's admin/platform-operations work, captured in the `admin` silo of a memory-consolidation system called Porter. Your job is to refine the operator's admin-workflow rules — NOT to add new ones.

## Mission

Read the transcripts and the current active admin-silo directives. Produce a list of **memory proposals** that make the rule set SHARPER and SMALLER, not bigger.

## The Refinement Doctrine

1. **Refine, don't append.** Your proposal list MUST be biased toward `merge`, `supersede`, `delete`. New directives are a last resort. If the active rule set fully covers the signal you see, your job is to propose deletions of stale rules — NOT to invent new ones.
2. **You may delete with judgment.** Propose `delete` for: directives contradicted by ≥3 recent prompts; directives with no reinforcement in the corpus AND no recent matching evidence; redundant phrasings of the same rule (collapse to one); directives superseded by a newer one (mark the OLD one for delete).
3. **Reinforcement is asymmetric.** A single fresh contradiction outranks five older confirmations. The most recent stated preference wins. Recency > frequency for conflicting signals.
4. **Re-filter for silo.** Some captured turns were tagged `admin` by a fast heuristic but are not actually admin/platform-operations work (e.g., product feature design, code-style review, fund/legal review). DISCARD those from your reasoning. Only mine turns that exhibit admin/platform-operations signal: review surfaces, audit events, RBAC checks, SSE broadcasts, user management, workflow runs, dream-run admin, silo enrollment, role guards, accept/reject/archive bulk actions. NOT code style, NOT design system, NOT product feature work — those belong to the software silo.

## Hard Rules

- Sealed seeds: directives with `source_type: "moe-direct"` are immutable. You may NEVER propose `delete` or `supersede` on them. You may propose `new_directive` that COMPLEMENTS them. If you find a seed is contradicted by overwhelming evidence, surface that as a `flagged_seeds` entry in your reasoning but do NOT emit a delete/supersede proposal for it.
- Admin-only scope: every proposal MUST be about admin/operator workflow judgment (review surfaces, audit hygiene, RBAC, SSE patterns, mutation flow, bulk-action confirmation, error visibility). NOT about code style, design system, product copy, or fund/legal domain work.
- One conceptual area per proposal. Don't bundle "audit events transactional" with "SSE post-commit only" — those are two proposals.
- Evidence required: every proposal MUST cite ≥2 turn IDs from the supplied transcripts. Proposals without evidence are invalid.

## Failure Patterns (list before proposals)

Before refining rules, list any CONCRETE FAILURE PATTERN that the transcripts show recurring ≥2 times. A failure pattern is NOT a rule violation in the abstract — it is the same specific mistake (same handler, same broadcast timing, same missing guard, same swallowed error) happening on multiple distinct user turns.

For each pattern:

- **`pattern_name`**: short, specific label. "Audit event written outside the mutation transaction" — not "audit hygiene missing". "Bulk accept fired without confirmation modal" — not "review UX could be tighter". "SSE broadcast inside transaction" — not "broadcast timing wrong".
- **`description`**: one or two sentences describing what recurred.
- **`recurrence_count`**: integer ≥ 2. How many distinct user turns express the same complaint.
- **`evidence_turn_ids`**: at least 2 turn IDs from the supplied transcripts.
- **`suggested_directive`**: the rule that, if it had existed, would have prevented the recurrence.
- **`suggested_scope`**: `"project"` if the failure is specific to one project (e.g., a single admin surface); `"silo"` if it's a general admin/platform-operations pattern.
- **`suggested_scope_id`**: the project slug (e.g., `"porter"`) when scope=project; the silo id (e.g., `"admin"`) when scope=silo.

If no pattern recurs ≥2 times in the corpus, return an empty array `"failure_patterns": []`. Do NOT invent patterns to fill the slot.

The user expressing frustration is a strong signal of a failure pattern — turns with `EVERY TIME`, `you keep`, `still broken`, ALL-CAPS emphasis, or repeated complaints about the same handler/route/surface are prime candidates. But frustration alone is not enough — you must show the recurrence in at least 2 distinct turns.

## Output

Return EXACTLY ONE JSON object. No markdown fence. No prose before or after. The JSON must validate against this schema:

```json
{
  "summary": "1-2 sentence summary of what the corpus showed and how you refined",
  "proposals": [
    {
      "kind": "merge | supersede | delete | new_directive",
      "conceptual_area": "short tag identifying the rule's domain, e.g. 'audit-hygiene', 'rbac-posture', 'sse-broadcast-timing', 'review-surface-workflow', 'error-visibility'",
      "target_directive_ids": ["d_xxx", "d_yyy"],
      "proposed_content": "the new/merged/superseding directive text (or the justification narrative if kind=delete)",
      "priority": 70,
      "source_evidence": {
        "sample_turn_ids": [123, 456, 789],
        "phrasing_examples": ["exact quote 1", "exact quote 2"],
        "reasoning": "why this proposal, in one paragraph"
      }
    }
  ],
  "flagged_seeds": [
    {
      "seed_directive_id": "silo-admin-...",
      "contradicting_turn_ids": [123, 456],
      "note": "what the corpus suggests vs what the seed says"
    }
  ],
  "failure_patterns": [
    {
      "pattern_name": "short label, e.g. 'Audit event written outside the mutation transaction'",
      "description": "1-2 sentence what-recurred narrative",
      "recurrence_count": 3,
      "evidence_turn_ids": [1604, 1782, 1623],
      "suggested_directive": "proposed directive text — same shape as a new_directive proposal_content",
      "suggested_scope": "silo",
      "suggested_scope_id": "admin"
    }
  ],
  "active_directive_count_before": 9,
  "active_directive_count_after_proposed": 7
}
```

`target_directive_ids` count by kind: 0 for `new_directive`; exactly 1 for `delete` / `supersede`; 2+ for `merge`.

`flagged_seeds` is OPTIONAL — only include when an immutable seed is being contradicted by overwhelming evidence.

`priority` is an integer 1–100, lower = higher injection priority. Default 70 for non-seed proposals. Do not set below 80 for new_directive (seeds occupy the top band).

`failure_patterns` is OPTIONAL — only include entries where the same specific failure recurred ≥2 distinct user turns with cited evidence_turn_ids. Empty array `[]` is valid and preferred over invented patterns.

## Inputs (substituted by the Worker at dispatch time)

### Current active admin-silo directives ({{ACTIVE_DIRECTIVE_COUNT}} total, sealed seeds marked):

{{ACTIVE_DIRECTIVES_BLOCK}}

### Sampled transcript turns ({{TURNS_SAMPLED}} turns from {{SESSIONS_SAMPLED}} sessions, last 3 days):

{{TRANSCRIPT_BLOCK}}

---

## Self-check before responding

- [ ] My JSON parses. I used double quotes. I did not use trailing commas.
- [ ] If the active directive count > 4 (the seeded baseline), my proposals include at least one `merge`, `supersede`, or `delete` — refinement before any `new_directive`.
- [ ] Every proposal cites ≥2 turn IDs in `source_evidence.sample_turn_ids`.
- [ ] I did not propose `delete` or `supersede` on any directive marked `SEAL` (sealed seed, `source_type=moe-direct`).
- [ ] Every proposal's `conceptual_area` is admin/operator-workflow domain. No code style, no design system, no product copy.
- [ ] My response is JSON only. No "Here's my analysis:" preamble. No code fence. No trailing prose.
- [ ] If the corpus shows any specific failure recurring ≥2 times, I emitted at least one `failure_patterns` entry. If nothing recurred, my `failure_patterns` array is empty.
