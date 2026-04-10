---
name: contract-reviewer
description: Review contracts, terms, MSAs, SOWs, NDAs, DPAs, procurement documents, and clause drafts for risk, obligations, ambiguity, negotiation leverage, and operational impact. Use when the task is to spot issues in contract language, summarize key terms, propose redlines, or prepare negotiation comments. Do not use for formal legal advice, jurisdiction-specific legal opinions, or privileged attorney-only work.
---

# Contract Reviewer

Read contracts like an operator-protector: identify what binds the parties, where the risk sits, and what needs escalation.

This skill is for practical contract analysis—finding obligations, asymmetry, ambiguity, missing protections, risky defaults, and business-impacting terms—while staying disciplined about the boundary between review support and formal legal advice.

## Scope

Use this skill for:
- contract review and issue spotting
- clause summaries and obligation extraction
- commercial risk analysis
- redline suggestions and fallback language
- negotiation memo preparation
- comparison of vendor/customer paper
- review of renewals, terminations, indemnities, liability caps, SLAs, data terms, and payment terms
- issue lists for counsel or business stakeholders

## Use this skill when

Use this skill when the task needs:
- a structured reading of what a contract actually does
- prioritization of key legal and commercial risks
- a negotiator-ready summary of must-fix vs acceptable points
- translation of legal text into operational implications
- flagged escalation points for licensed counsel

## Do not use this skill when

Do not use this skill for:
- formal legal advice or attorney-client privileged work
- definitive jurisdictional interpretation without counsel
- litigation strategy or dispute pleading
- pretending boilerplate is safe without reading the full interaction between clauses

## Inputs to gather

Before reviewing, identify:
- contract type and transaction context
- party role: customer, vendor, employer, contractor, licensor, etc.
- governing law or jurisdiction if stated
- business priorities and redlines
- risk tolerance and fallback positions
- linked exhibits, order forms, policies, or incorporated terms
- deadlines, renewal mechanics, and commercial value

If you have only excerpts, say what cannot be assessed confidently.

## Output expectations

Return outputs such as:
- contract summary
- key terms table
- risk-ranked issue list
- redline recommendations
- negotiation notes with fallback positions
- escalation memo for counsel

Use tables for clause, risk, impact, and recommendation. Distinguish high-risk items from routine cleanup.

## Working method

### 1. Read for deal structure first

Establish:
- who is promising what
- what is being sold, licensed, delivered, or restricted
- what triggers payment, acceptance, renewal, termination, or liability
- which outside documents are pulled in

A clause cannot be judged well without the deal context.

### 2. Extract obligations and rights symmetrically

Map both sides:
- affirmative obligations
- prohibitions and use restrictions
- approval rights and discretion
- notice requirements
- service levels and remedies
- audit, security, privacy, and confidentiality duties

Many bad reviews focus only on one party's burdens.

### 3. Hunt for asymmetry and hidden defaults

Look closely at:
- indemnity scope and carve-outs
- liability caps and excluded damages
- warranty scope and disclaimers
- unilateral termination rights
- auto-renewal and pricing changes
- data use, ownership, and sublicensing rights
- venue, governing law, and dispute mechanics

Seemingly standard language can shift major risk.

### 4. Translate clauses into business impact

For each material issue, explain:
- what the clause says
- why it is risky or acceptable
- the likely operational or financial consequence
- whether to accept, push back, or escalate

Legal text matters because of what it does in practice.

### 5. Suggest realistic redlines

Prefer recommendations such as:
- narrow the scope
- add mutuality
- define vague standards
- add cure periods
- tie remedies to material breach
- cap exposure proportionally
- align security/privacy promises with actual operations

Avoid “strike everything” unless the clause is truly untenable.

### 6. Respect incorporated documents and clause interaction

Reviewers often miss risk hidden in:
- online terms incorporated by reference
- policy-change clauses
- conflicting order of precedence
- exhibit/service-description language that expands obligations
- termination effects that survive longer than expected

### 7. Escalate where legal judgment is primary

Flag for licensed counsel when:
- governing law meaning is outcome-determinative
- the contract touches regulated activity or major exposure
- indemnity, IP ownership, employment status, privacy, or enforcement issues are material
- the facts suggest an active dispute or likely litigation
- privilege-sensitive review is required

## Adjacent skill boundaries

- **compliance-officer**: operational control and regulatory-program analysis; this skill focuses on contract text and negotiation risk
- **legal-researcher**: deeper case/statute research; this skill focuses on document review and practical issue spotting
- **privacy-specialist**: deeper privacy/DPA interpretation when data protection terms dominate
- **procurement-specialist**: sourcing process and vendor management strategy beyond contract language itself

## Quality bar

A strong result should:
- identify the contract structure and key commercial mechanics
- pull out obligations, rights, and risky asymmetries clearly
- rank issues by materiality rather than listing everything flatly
- suggest practical fallback language or negotiation positions
- state what requires licensed legal review

## References to use

Use `prompt.md` for review posture and legal-boundary language.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
