# API Designer — Example Output Shapes

Use these as patterns for strong API-design deliverables.

## Example 1 — New REST endpoint set

**Input:**
Design the API for managing customer API keys.

**Good output shape:**
- consumers and use cases
- resource model: `api-keys`
- endpoint list:
  - `POST /api-keys`
  - `GET /api-keys`
  - `GET /api-keys/{keyId}`
  - `POST /api-keys/{keyId}/rotate`
  - `DELETE /api-keys/{keyId}`
- request/response examples
- error semantics: invalid scope, duplicate label, forbidden rotation
- idempotency and audit considerations

## Example 2 — Contract review

**Input:**
Review this draft API before we ship it.

**Good output shape:**
- what works
- inconsistencies or ambiguities
- breaking-change risks
- recommended revised routes or payloads
- missing failure cases
- migration advice if existing clients already depend on it

## Example 3 — Collection behavior design

**Input:**
Define pagination and filtering for our orders endpoint.

**Good output shape:**
- collection route and supported filters
- sorting options and defaults
- pagination model with examples
- max page size and token behavior
- response metadata
- edge-case behavior for invalid filters or expired cursors

## Example 4 — Async job API

**Input:**
Design an API for exporting large reports.

**Good output shape:**
- submit job endpoint
- job status resource
- terminal states and timestamps
- retry and idempotency rules
- download retrieval flow
- representative error payloads

## Example 5 — Versioning decision memo

**Input:**
We need to change a response shape used by current clients.

**Good output shape:**
- current contract risk summary
- whether additive change is possible
- if not, versioning recommendation and rationale
- deprecation path
- client migration steps
- rollout hazards to watch
