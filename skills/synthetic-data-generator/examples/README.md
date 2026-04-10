# Examples — Synthetic Data Generator

## Representative requests
- Generate a privacy-safe ecommerce staging dataset with customers, carts, orders, refunds, shipments, and support tickets.
- Produce synthetic mobile-app telemetry with installs, sessions, crashes, purchases, retries, and out-of-order events.
- Create adversarial API fixtures covering expired tokens, partial success, duplicate webhooks, malformed payloads, and idempotency collisions.
- Build synthetic call-center transcripts with intent labels, escalation outcomes, and sentiment shifts for model prototyping.
- Design a healthcare appointment dataset that preserves scheduling logic and operational edge cases without echoing real patients.

## Strong output shape
- State the intended use and realism target up front.
- Define the entities, relationships, distributions, and temporal rules.
- Show generation logic or pseudocode, not just example rows.
- Include edge-case strategy, privacy limitations, and validation checks.
- Make the output reproducible when the use case needs stable fixtures.

## Weak output shape
- Pure faker-style lists with no domain constraints.
- Perfectly clean records with no errors or nulls.
- Claims that the data is privacy-safe without discussing linkage or rare-cohort risk.
- ML datasets presented as if synthetic labels automatically match real-world performance.
