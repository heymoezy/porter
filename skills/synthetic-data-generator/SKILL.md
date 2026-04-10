---
name: synthetic-data-generator
description: Design and generate synthetic datasets, personas, event streams, fixtures, labels, and sandbox records that preserve useful structure without exposing real people or production secrets. Use when the task is to simulate realistic-but-safe data for testing, demos, analytics development, ML experiments, privacy-preserving sharing, edge-case coverage, or scenario generation. Do not use for simple anonymization-only requests, live data migration, or statistical analysis of existing datasets.
---

# Synthetic Data Generator

Generate synthetic data that is usable, explainable, and hard to confuse with real records.

## Scope

Use this skill for:
- synthetic relational datasets with joins and referential integrity
- event streams, logs, API payloads, and message fixtures
- personas, accounts, transactions, tickets, sessions, and behavioral traces
- privacy-safe demo/staging/sandbox data
- ML training or evaluation fixtures when synthetic generation is explicitly acceptable
- adversarial, rare, malformed, and boundary-case data generation
- generation recipes, schemas, seeds, and validation plans

Do not use this skill for:
- light masking/redaction of real data as the main task; use a privacy/compliance skill when policy risk dominates
- analysis of an existing real dataset; use a data-analysis skill
- production ETL or database migration work
- benchmark claims that require real-world validity the synthetic data cannot support

## What good looks like

Synthetic data is only good if it serves a job.
Optimize for the stated purpose:
- **Testing:** maximize coverage, failure modes, invalid states, and reproducibility.
- **Demos:** maximize believability, variety, and narrative coherence.
- **Analytics development:** preserve schema logic, key distributions, seasonality, and joins.
- **ML experimentation:** preserve signal structure carefully, then state synthetic-to-real limitations explicitly.
- **Privacy-safe sharing:** minimize disclosure and linkage risk, not just direct identifiers.

Follow the fidelity / utility / privacy triad. Do not maximize one dimension blindly at the expense of the others.

## Working method

### 1. Pin down the use case
Clarify:
- who will use the data
- what system or workflow it must exercise
- whether realism, coverage, or privacy is the top constraint
- required volume, shape, format, and refresh cadence
- whether outputs must be deterministic and reproducible

If the use case is fuzzy, pick a conservative target and state assumptions.

### 2. Model the truth that matters
Preserve the parts of reality that the downstream task depends on:
- schema and type constraints
- foreign-key and parent-child relationships
- business rules and state transitions
- distribution shape, skew, sparsity, and seasonality
- chronology, sessionization, and event ordering
- important correlations between fields
- operational defects: nulls, duplicates, retries, malformed payloads, and partial failures

Do not generate decorative randomness. Generate structure.

### 3. Decide the privacy posture
State which method is being used:
- fully synthetic from schema/rules only
- synthetic from aggregated patterns or summary statistics
- synthetic from exemplar patterns with privacy guardrails
- privacy-enhanced generation with explicit re-identification controls

Watch for indirect disclosure through rare combinations, long tails, free text, geolocation, timestamps, and identifiers that can be linked externally. If privacy risk is meaningful, call out membership-inference or linkage concerns instead of implying safety.

### 4. Design the generator
Prefer a documented recipe over opaque filler:
- entities and counts
- field rules and conditional logic
- weighted distributions
- temporal generation rules
- edge-case injectors
- seed handling for reproducibility
- output formats and sample records

For related tables or streams, keep referential integrity and lifecycle logic intact.

### 5. Validate before handing off
Check at least these dimensions:
- **Utility:** does it exercise the target workflow?
- **Fidelity:** do the important patterns resemble the intended domain?
- **Privacy:** could a record or rare cohort be mistaken for a real one?
- **Coverage:** are happy path, edge cases, and failure states all represented?
- **Operability:** can another person regenerate the same data set or extend it safely?

## Heuristics

Prefer:
- clear schemas and generation rules
- deterministic seeds when repeatability matters
- believable categorical values and narrative consistency
- explicit realism limits
- targeted adversarial cases
- datasets that are obviously synthetic but operationally useful

Avoid:
- shallow faker-style noise with no domain logic
- copying real records then changing names
- preserving unique outliers that invite re-identification
- unrealistic perfect data with no nulls or errors
- synthetic labels presented as model-ready ground truth without caveats

## Output patterns

Return one or more of:
- dataset design spec
- generation plan or pseudocode
- sample records or payload fixtures
- privacy-risk notes
- validation checklist and known limitations

When useful, structure the answer as:
1. intended use
2. assumptions
3. schema/entities/events
4. generation logic
5. edge cases
6. privacy controls
7. validation notes

## Adjacent skill boundaries

- **data-analyst / analytics-engineer:** analyze or model real data; this skill creates synthetic inputs
- **privacy-specialist:** owns legal/privacy governance decisions when compliance analysis is primary
- **test-engineer:** designs test strategy broadly; this skill provides the synthetic fixtures/data layer
- **ml-engineer / model-trainer:** owns model development; this skill supports data generation for it

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
