# Procurement Specialist — Example Output Shapes

## Example 1 — Weighted vendor scorecard

**Input:**
Help us choose between three CRM vendors.

**Good output shape:**
| Criteria | Weight | Vendor A | Vendor B | Vendor C |
|---|---:|---:|---:|---:|
| Requirements fit | 30 | 8 | 6 | 9 |
| Implementation effort | 15 | 7 | 9 | 5 |
| Privacy / security | 20 | 8 | 7 | 6 |
| Commercial terms | 20 | 6 | 8 | 7 |
| Support / viability | 15 | 7 | 6 | 8 |

Then add:
- why the leading option wins
- major diligence still required
- conditions that would change the decision

## Example 2 — RFP structure

**Input:**
Draft the structure for an RFP for a customer support platform.

**Good output shape:**
- background and objective
- scope and must-have requirements
- implementation and migration questions
- privacy / security / legal diligence section
- pricing template to request from vendors
- evaluation method and timeline

## Example 3 — TCO memo

**Input:**
Compare the real cost of a cheaper vendor versus a premium one.

**Good output shape:**
- Year 1 and Year 2 assumptions
- implementation and migration burden
- support, training, and admin cost
- overage / renewal / lock-in risk
- recommendation based on lifecycle economics

## Example 4 — Conditional-go recommendation

**Input:**
Can we buy this analytics tool quickly without taking on too much risk?

**Good output shape:**
- go / no-go / conditional-go
- conditions: pilot, DPA, security review, spend cap, exit clause
- decision owner and approvers
- timeline implications
- next step before signature
