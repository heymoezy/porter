# Microservices Designer — Example Output Shapes

## Example 1 — Monolith decomposition

**Input:**
Break an e-commerce monolith into services without destroying delivery speed.

**Good output shape:**
| Service / context | Owns | Depends on | Why separate now? |
|---|---|---|---|
| catalog | product data, merchandising rules | pricing read model | high change independence |
| checkout | cart, order submission | payments, inventory, shipping | transactional hotspot |
| fulfillment | pick-pack-ship workflow | orders, warehouse systems | external-system complexity |

Then add:
- context map
- extraction order
- temporary migration compromises

## Example 2 — API vs events

**Input:**
Should fulfillment talk to inventory via API or events?

**Good output shape:**
- decision criteria
- synchronous option tradeoffs
- event-driven option tradeoffs
- recommendation by consistency requirement
- timeout, retry, and idempotency expectations

## Example 3 — Shared database problem

**Input:**
All services still write to the same customer table.

**Good output shape:**
- why this breaks boundaries
- target ownership model
- migration steps
- read-model or replication strategy for reporting needs

## Example 4 — Should we split at all?

**Input:**
A small SaaS app has one team, moderate traffic, and a stable release cadence.

**Good output shape:**
| Question | Observation | Implication |
|---|---|---|
| team autonomy need | low | modular monolith likely enough |
| scaling hotspot | isolated reporting job | split hotspot first or keep internal module |
| ops maturity | limited | full microservices would add risk |