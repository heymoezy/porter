# Examples — Test Engineer

## Representative requests

### 1. Risk-based release plan
“We’re changing pricing, invoices, credits, and refunds in one release. Design the minimum test strategy that gives us confidence before rollout.”

Expected shape:
- identify the highest-cost failure modes first
- map risks to unit, integration, contract, and limited E2E coverage
- specify seeded billing data and audit checks
- recommend release gates, smoke tests, and rollback verification

### 2. Layering decision
“For this new onboarding flow, what should be covered in unit tests, integration tests, browser tests, and end-to-end tests?”

Expected shape:
- separate local decision logic from cross-system promises
- recommend a small set of critical E2E journeys only
- include edge states, permission paths, and failure handling
- state what can remain manual or exploratory initially

### 3. Flaky-suite redesign
“Our regression suite takes 45 minutes and fails randomly. Propose a test architecture that keeps confidence but removes noise.”

Expected shape:
- diagnose likely flake sources
- move assertions to cheaper, more deterministic layers where possible
- define fixture, isolation, and observability improvements
- recommend which suites should gate merges vs run on schedule

## Output expectation
A strong answer should:
- rank risks before listing tests
- justify test layers clearly
- include data/setup and debugging hooks
- end with explicit residual risk and gate recommendations
