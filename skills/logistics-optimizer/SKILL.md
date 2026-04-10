---
name: logistics-optimizer
description: Design and improve logistics systems across transportation, warehousing, fulfillment, inventory flow, and service-level performance. Use when the work involves routing strategy, distribution-network design, warehouse throughput, last-mile tradeoffs, inventory positioning, carrier choice, OTIF/SLA improvement, returns flow, or cost-to-serve analysis. Do not use for generic operations advice with no physical-goods flow component.
---

# Logistics Optimizer

Improve the flow of goods across the network, not just one cost line inside it.

## Focus
This skill is for **physical-flow and fulfillment-system decisions**: transportation design, warehouse throughput, inventory placement, service-level tradeoffs, carrier strategy, returns handling, and diagnosing where goods flow breaks between promise and delivery.

Use adjacent skills instead when the main need is:
- **operations-manager**: broader cross-functional operating cadence without a logistics-system core
- **procurement-specialist**: supplier sourcing or commercial negotiation work
- **data-analyst**: metric production without logistics interpretation and redesign
- **vendor-manager**: partner governance work after the network design decision is already set

## Gather first
- Product profile: size, cube, value density, perishability, hazard class, handling sensitivity, seasonality
- Demand and order shape: units per order, order lines, split shipments, volume variability, cutoff times, returns rate
- Network map: plants, ports, DCs, stores, cross-docks, micro-fulfillment nodes, customer regions
- Transportation reality: modes, lane lengths, carrier performance, route density, delivery windows, access constraints
- Warehouse reality: slotting, labor model, dock capacity, replenishment logic, pick/pack bottlenecks, system latency
- Service and economics: OTIF, promised SLA, fill rate, stockout pain, premium freight usage, cost-to-serve by segment

## Deliverables
Provide some combination of:
- Bottleneck diagnosis across transportation, warehouse, inventory, and last mile
- Network design or inventory-positioning recommendation
- Warehouse throughput improvement plan
- Carrier / mode / routing option comparison
- Service-level recovery plan with cost and complexity tradeoffs
- KPI tree linking root causes to customer outcomes and operating cost

## Working method
1. Map the full goods flow from source to customer and back if returns matter.
2. Name the dominant constraint before suggesting fixes.
3. Separate structural choices from tactical workarounds.
4. Make service, cost, resilience, and complexity tradeoffs explicit.
5. Check whether inventory policy, warehouse capacity, and transport design are fighting each other.
6. Prioritize recommendations by speed to value: now, next, later.
7. End with expected KPI movement, dependencies, and what to test first.

## Operating rules
- The visible symptom is often downstream of a different constraint upstream.
- Faster service usually costs something: more touches, more inventory, more premium freight, or more complexity.
- Network centralization reduces some costs while increasing lead time and zone-shipping exposure.
- Local inventory improves responsiveness but fragments stock and raises obsolescence risk.
- Warehouse heroics do not fix structural promise/capacity mismatch for long.
- A good recommendation ties every operational change to both a service metric and an efficiency metric.
- Spreadsheet wins that ignore labor, dock, carrier, or slotting reality are not real wins.

## Common deliverable types
### Network redesign memo
Use when evaluating node footprint, regionalization, inventory placement, or carrier-mode shifts.

### Fulfillment bottleneck diagnosis
Use when OTIF drops, cutoff misses rise, backlogs form, or same-day / next-day promises fail operationally.

### Last-mile cost review
Use when service is intact but route density, premium delivery, or carrier mix makes economics unsustainable.

## Quality bar
A strong deliverable makes it obvious:
1. Where the primary logistics constraint actually sits
2. Which fixes are tactical versus structural
3. What service, cost, and resilience tradeoffs are being accepted
4. Which KPIs should move if the diagnosis is right
5. What operators, planners, and leadership should do in sequence

## Final check
Before finishing, read `guides/qa-checklist.md`, align the response structure with `prompt.md`, and sanity-check the deliverable against `examples/README.md`.
