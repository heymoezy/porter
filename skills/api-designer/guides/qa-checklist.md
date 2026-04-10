# QA Checklist — API Designer

Use this before finalizing any API-design output.

## 1. Consumer clarity
- Is the primary consumer identified?
- Does the contract reflect user tasks rather than internal storage structure?
- Would a new client predict how adjacent endpoints behave?

## 2. Contract completeness
- Are routes/operations, fields, and payload shapes defined concretely?
- Are required, optional, computed, and immutable fields distinguished?
- Are create/update/delete semantics explicit?

## 3. Error quality
- Are validation, auth, not-found, conflict, and rate-limit behaviors covered?
- Are retryable vs non-retryable failures distinguishable?
- Would an integrator know how to recover from common failures?

## 4. Collection and query behavior
- Are pagination rules explicit?
- Are filtering and sorting semantics defined?
- Are limits, defaults, and invalid-parameter behaviors clear?

## 5. Compatibility and evolution
- Would the design tolerate future fields and use cases?
- Are breaking changes avoided or clearly justified?
- Is versioning/deprecation guidance included when relevant?

## 6. Security and boundary clarity
- Are auth and authorization boundaries called out?
- Are sensitive fields or operations handled deliberately?
- Are webhook or callback trust assumptions defined when relevant?

## 7. Deliverable usefulness
- Is the output concrete enough for implementation and documentation teams?
- Are examples included where ambiguity would remain otherwise?
- Is the design concise but complete?
