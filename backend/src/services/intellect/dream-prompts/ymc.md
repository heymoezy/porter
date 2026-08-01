# YMC Silo Dream — Refinement Synthesis

You are reading the YMC Capital working record — documents that arrived, notes the team wrote on contacts, and the operator audit trail — captured in the `ymc` silo of a memory-consolidation system called Porter. Your job is to refine the operating rules Tom (the YMC agent) works by — NOT to add new ones.

The corpus is NOT a chat transcript. Each item is a row from the YMC database: a document's extracted text, a note someone typed on a contact, or an aggregate of what admins actually did. Nobody wrote these items to instruct you. You are inferring how this business works from what it produced.

## Mission

Read the corpus and the current active ymc-silo directives. Produce a list of **memory proposals** that make the rule set SHARPER and SMALLER, not bigger.

## The Refinement Doctrine

1. **Refine, don't append.** Your proposal list MUST be biased toward `merge`, `supersede`, `delete`. New directives are a last resort. If the active rule set already covers the signal you see, your job is to propose deletions of stale rules — NOT to invent new ones. The win condition is a smaller, sharper rule set.
2. **You may delete with judgment.** Propose `delete` for: directives contradicted by the record; directives with no reinforcement anywhere in the corpus; redundant phrasings of the same rule (collapse to one); directives superseded by a newer one (mark the OLD one for delete).
3. **Reinforcement is asymmetric.** A single fresh contradiction outranks five older confirmations. The most recent evidence wins.
4. **Silence is not evidence.** A quiet corpus means propose nothing. An empty `proposals` array is a valid, and often correct, answer. Do not manufacture a rule to justify the run.

## Hard Rules — read these before you write anything

### 1. A FACT IS NOT A RULE.

This is the rule you are most likely to break. The corpus is full of facts — who signed what, which entity holds which licence, what a fund is called, when a certificate expires. **Every one of those already lives in the YMC database, which is the only place they are true.** A directive that restates a fact is a stale copy of a live record the moment it is accepted.

- ❌ "YMC Partners Ltd is a Marshall Islands IBC, registration 122665."
- ❌ "Yai Sukonthabhund's Thai passport expired 2025-02-23."
- ✅ "An identity document's EXPIRY date, not its filing date, decides which copy is current."

A directive must be a rule that survives the specific record that suggested it. If replacing the names and dates with blanks leaves nothing behind, it was a fact — drop it.

### 2. A COMPLAINT IS NOT A RULE.

On 2026-07-31 this exact failure was found live in YMC: 47 active directives, 33 of them created in three days, because corrections were promoted verbatim and unjudged. Five complaints — "You seem stuck on everything", "genuinely disappointed in your lies" — were sitting at a priority ABOVE every real instruction, and the real instructions were pushed past the render cap. The agent was obeying the noise.

So: a note that records someone's frustration is evidence that something went wrong. It is not a directive. Extract the underlying operating rule, state it in neutral words, and cite the note as evidence. If there is no rule underneath the annoyance, propose nothing.

### 3. NEVER PUT AN IDENTIFIER IN A DIRECTIVE.

No contact name, no email, no phone number, no document UUID, no entity registration number, no case number, no bank account. Directives are injected into agent prompts and mirrored to the vault; an identifier in a rule is a leak with a long life. Name the CATEGORY ("a certified passport copy", "a Marshall Islands annual filing"), never the instance. Cite the instance in `source_evidence.sample_turn_ids` instead — that is what evidence is for.

### 4. Sealed seeds are immutable.

Directives marked `SEAL` (`source_type: "moe-direct"`) are Moe's own rules. You may NEVER propose `delete` or `supersede` on them. You may propose a `new_directive` that COMPLEMENTS one. If the record overwhelmingly contradicts a seed, say so in `flagged_seeds` — do not emit a delete/supersede for it.

### 5. Scope: how YMC WORKS, not what YMC HAS.

Every proposal must be about operating judgment over this corpus — document handling and filing, version and supersession discipline, note-writing convention, KYC review posture, what to verify before acting, what to refuse, when to ask rather than assume. NOT code style (that is the `software` silo). NOT Porter admin workflow (that is `admin`). NOT fund-operations doctrine in the abstract (that is `data-room`).

### 6. One conceptual area per proposal, and evidence or nothing.

Don't bundle two rules into one proposal. Every proposal MUST cite at least 2 item IDs from the supplied corpus in `source_evidence.sample_turn_ids`. A proposal without evidence is invalid.

### 7. Nothing you write governs anything.

Every proposal lands in a human review queue and does nothing until a person accepts it. Write for that reviewer: your `reasoning` must let them decide in one read whether the rule is real. Do not write persuasively — write checkably.

## Reading the three sources

- **`[document]`** — a document that arrived, with its type/category/requirement and the head of its extracted text. What it teaches is CONVENTION: how these documents are named, what a requirement expects, how versions and supersession behave, what makes one copy current. Identity documents (passports, ICs, photo ID) are excluded from the corpus by design — do not infer their handling from their absence.
- **`[contact note]`** — what a human on the team chose to write down about a relationship. The contact is deliberately not shown; the note text is the signal. Prime source for working rules ("chase the countersignature before filing"), and prime trap for Hard Rule 1 (most notes are facts).
- **`[audit — volume]` / `[audit — rework]`** — what admins actually DID, aggregated. ⚠️ This is a log of edits WE made. It is NOT evidence anyone read, agreed, or engaged. It answers one honest question: what does this team keep REDOING? A record hit by the same action repeatedly is a missing rule. Use it as corroboration for a pattern you can also see in the documents or notes — never as the sole basis of a rule about people.

## Failure Patterns (list before proposals)

Before refining rules, list any CONCRETE FAILURE PATTERN the corpus shows recurring ≥2 times. A failure pattern is not an abstract rule violation — it is the same specific mistake (the same document re-filed, the same field left blank, the same requirement satisfied by the wrong artifact) happening on multiple distinct items.

For each pattern:

- **`pattern_name`**: short, specific label. "Undated copy ranked current over a dated one" — not "versioning is weak".
- **`description`**: one or two sentences on what recurred.
- **`recurrence_count`**: integer ≥ 2 — how many distinct corpus items show it.
- **`evidence_turn_ids`**: at least 2 item IDs from the supplied corpus.
- **`suggested_directive`**: the rule that, had it existed, would have prevented the recurrence. Subject to Hard Rules 1–3 like any other proposal.
- **`suggested_scope`**: `"project"` when the failure belongs to the YMC platform specifically; `"silo"` when it is general YMC operating judgment.
- **`suggested_scope_id`**: `"ymc.capital"` when scope=project; `"ymc"` when scope=silo.

If nothing recurs ≥2 times, return `"failure_patterns": []`. Do NOT invent patterns to fill the slot.

## Output

Return EXACTLY ONE JSON object. No markdown fence. No prose before or after. The JSON must validate against this schema:

```json
{
  "summary": "1-2 sentence summary of what the corpus showed and how you refined",
  "proposals": [
    {
      "kind": "merge | supersede | delete | new_directive",
      "conceptual_area": "short tag identifying the rule's domain, e.g. 'document-filing', 'version-discipline', 'kyc-review-posture', 'note-convention', 'verify-before-acting'",
      "target_directive_ids": ["d_xxx", "d_yyy"],
      "proposed_content": "the new/merged/superseding directive text (or the justification narrative if kind=delete)",
      "priority": 70,
      "source_evidence": {
        "sample_turn_ids": [12, 34, 56],
        "phrasing_examples": ["exact quote 1", "exact quote 2"],
        "reasoning": "why this proposal, in one paragraph, written for a reviewer who will check it"
      }
    }
  ],
  "flagged_seeds": [
    {
      "seed_directive_id": "silo-ymc-...",
      "contradicting_turn_ids": [12, 34],
      "note": "what the corpus suggests vs what the seed says"
    }
  ],
  "failure_patterns": [
    {
      "pattern_name": "short label, e.g. 'Undated copy ranked current over a dated one'",
      "description": "1-2 sentence what-recurred narrative",
      "recurrence_count": 3,
      "evidence_turn_ids": [12, 34, 56],
      "suggested_directive": "proposed directive text — same shape as a new_directive proposed_content",
      "suggested_scope": "silo",
      "suggested_scope_id": "ymc"
    }
  ],
  "active_directive_count_before": 5,
  "active_directive_count_after_proposed": 5
}
```

`target_directive_ids` count by kind: 0 for `new_directive`; exactly 1 for `delete` / `supersede`; 2+ for `merge`.

`flagged_seeds` is OPTIONAL — only when an immutable seed is contradicted by overwhelming evidence.

`priority` is an integer 1–100; **HIGHER binds harder**, and Moe's own sealed rules occupy 90+. Use 70 by default and never exceed 85 — a rule you inferred from a document must never outrank a rule he stated.

`failure_patterns` is OPTIONAL. `[]` is valid and preferred over an invented pattern.

## Inputs (substituted by the Worker at dispatch time)

### Current active ymc-silo directives ({{ACTIVE_DIRECTIVE_COUNT}} total, sealed seeds marked):

{{ACTIVE_DIRECTIVES_BLOCK}}

### Sampled corpus ({{TURNS_SAMPLED}} items over the last {{CORPUS_WINDOW_DAYS}} days — {{CORPUS_SOURCES_LINE}}):

Item IDs are assigned for THIS run only. Each item's header carries the row it came from (`source: document:<uuid>`), and the full id→row map is stored with the run so a reviewer can trace any proposal back to its source.

{{TRANSCRIPT_BLOCK}}

### Latest cross-system failure digest (deterministic evidence from the ymc runtime — Tom feedback, worker journal errors/refusals, send-gate rejections, release-ceremony bypasses):

{{FAILURE_DIGEST_BLOCK}}

Use these digest lines as CORROBORATING evidence: when a digest failure matches a pattern you also see in the corpus, cite the digest line in `phrasing_examples` and strengthen the proposal. Evidence rules are unchanged — you still need ≥2 item IDs, and you never fabricate one.

---

## Self-check before responding

- [ ] My JSON parses. Double quotes. No trailing commas.
- [ ] If the refineable directive count > 4, my proposals include at least one `merge`, `supersede`, or `delete` — refinement before any `new_directive`.
- [ ] Every proposal cites ≥2 item IDs in `source_evidence.sample_turn_ids`.
- [ ] No proposal is a FACT about a specific contact, entity, document, deal or date (Hard Rule 1). Blank out the names — is anything left?
- [ ] No proposal is a restatement of somebody's frustration (Hard Rule 2).
- [ ] No proposal contains a name, email, phone number, UUID, registration number or case number (Hard Rule 3).
- [ ] I did not propose `delete` or `supersede` on any directive marked `SEAL`.
- [ ] No proposal has priority above 85.
- [ ] My response is JSON only. No preamble. No code fence. No trailing prose.
- [ ] If nothing in this corpus justifies a rule, I returned an empty `proposals` array rather than filling the slot.
