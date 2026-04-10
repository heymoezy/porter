---
name: api-designer
description: Design HTTP and RPC APIs that are clear, versionable, secure, and easy for clients to adopt. Use when work involves endpoint design, resource modeling, request/response schemas, error contracts, pagination, idempotency, auth boundaries, webhooks, API migrations, or interface reviews. Do not use for pure backend implementation without contract work, frontend UI design, or infrastructure-only tasks.
---

# API Designer

Design API contracts that are stable under change, obvious to consumers, and hard to misuse.

This skill is for shaping the interface itself: resources, operations, payloads, constraints, errors, versioning, and adoption guidance. The goal is not to expose internal code structure. The goal is to give API consumers a contract that makes sense.

## Scope

Use this skill for:
- new API surface design
- endpoint and route planning
- request and response schema design
- resource and entity modeling
- naming and consistency reviews
- pagination, filtering, sorting, and search contracts
- authentication and authorization boundary design
- idempotency and retry-safe write operations
- webhook/event payload design
- API versioning and migration planning
- API design critique and cleanup
- documentation-ready contract drafting

## Do not use this skill for

Do not use this skill for:
- implementing handlers, services, or database code when the contract is already settled
- frontend UX or visual design
- infrastructure provisioning
- deep legal/compliance review beyond clearly flagging affected areas
- protocol implementation details that do not change the consumer-facing contract

## Inputs to gather

Before designing, identify:
- primary consumers: internal services, external developers, partners, mobile apps, frontend apps, third parties
- API style and constraints: REST, RPC, GraphQL-like conventions, webhook callbacks, internal service APIs
- domain entities and lifecycle rules
- key operations: create, read, update, delete, search, bulk, async jobs, events
- latency, scale, and payload-size expectations
- auth model and role boundaries
- backward-compatibility requirements
- observability and debugging needs
- error scenarios and validation rules

If domain rules are unclear, resolve those first. A clean endpoint over a fuzzy business rule still produces a bad API.

## Output expectations

Return outputs such as:
- API design brief
- endpoint map
- resource model
- request/response examples
- error model
- versioning and deprecation plan
- API review memo with recommended changes
- documentation-ready contract notes

Prefer concrete contracts over abstract advice.

## Working method

### 1. Start from user goals, not tables

Design around what the client is trying to accomplish.
A database table is not automatically an API resource.
A clean contract reflects domain actions and stable concepts, not storage leakage.

Ask:
- what does the caller need to do?
- what identifiers do they reliably have?
- what fields are writable vs computed vs internal?
- what sequence of calls will feel natural?

### 2. Choose a predictable resource model

Use nouns for resources and keep naming consistent.
Prefer a small set of obvious patterns over clever exceptions.

Good API design usually means:
- stable resource names
- consistent pluralization
- clear parent/child relationships only when they matter
- no mixed idioms across adjacent endpoints

If two endpoints feel similar but behave differently, fix the design instead of documenting the inconsistency away.

### 3. Make write operations safe and explicit

For create/update/delete flows, define:
- required fields
- optional fields
- immutable fields
- partial-update behavior
- concurrency expectations
- idempotency behavior for retries

For operations with side effects, be explicit about:
- whether retries are safe
- whether duplicate requests are deduplicated
- what status the client sees while work is in progress

### 4. Design errors as part of the product

An API contract is not complete until failure cases are designed.
Specify:
- validation error shape
- auth/authz failures
- rate-limit responses
- not-found behavior
- conflict semantics
- retryable vs non-retryable errors
- machine-readable codes where useful

Errors should help clients recover, not just tell them they were wrong.

### 5. Keep collection behavior disciplined

For list/search endpoints, define:
- pagination model and tokens/parameters
- sort rules and defaults
- filtering semantics
- search behavior vs exact filtering
- max page size and response shape
- total-count behavior if supported

Do not leave these as implicit implementation details. They become long-term contract debt.

### 6. Protect compatibility intentionally

If the API already exists, classify changes as:
- additive and safe
- behavior-changing
- shape-changing
- deprecated but supportable
- breaking and migration-required

When versioning is needed, explain why.
Do not version by reflex. Version when compatibility or semantics genuinely require it.

### 7. Model async and event-driven flows clearly

For long-running work, define:
- submission endpoint or command
- job/status resource or callback behavior
- terminal states
- retry guidance
- webhook/event payloads and signature expectations if applicable

Clients should know how to start, observe, and reconcile async work without guessing.

### 8. Optimize for docs and adoption

A good API can be understood from examples.
Include:
- representative requests and responses
- field meaning where ambiguity exists
- lifecycle notes
- common edge cases
- migration notes if replacing an old contract

If a consumer would need a 30-minute verbal walkthrough, the design is not finished.

## Heuristics

Prefer:
- consistency over novelty
- explicitness over magical defaults
- additive evolution over breaking churn
- domain language over storage language
- simple payloads over deeply nested cleverness
- machine-readable contracts with human-readable explanations

Avoid:
- exposing internal IDs if external stable identifiers are better
- mixing transport concerns into business fields
- overloading one endpoint with unrelated behaviors
- ambiguous null vs missing semantics
- hidden side effects on read-like routes
- one-off exception patterns that multiply documentation burden

## Review lenses

When critiquing an API, check:
- Can a new consumer predict route names and field behavior?
- Are write operations retry-safe or clearly not?
- Are errors structured and actionable?
- Are pagination and filtering rules explicit?
- Are permissions implied vaguely or modeled clearly?
- Will this contract survive future fields, roles, and product expansion?
- Does the design leak internal implementation details that will change?

## Adjacent skill boundaries

- **backend-dev / fullstack-dev / code-implementer**: implement the API after the contract is designed
- **system-architect / microservices-designer**: shape broader system boundaries and service topology
- **security-auditor / privacy-specialist**: review deeper security and data-handling concerns
- **technical-writer / documentation-writer**: turn final contracts into polished public docs

## Quality bar

A strong result should:
- make consumer workflows obvious
- use consistent naming and resource patterns
- define success and failure contracts clearly
- handle pagination, filtering, auth, and versioning deliberately
- minimize future breaking changes
- be concrete enough for implementation and documentation to proceed cleanly

## References to use

Use `prompt.md` for delivery stance and review framing.
Use `examples/README.md` for output shapes.
Use `guides/qa-checklist.md` before finalizing.
Use `meta/skill.json` for boundaries and metadata.
