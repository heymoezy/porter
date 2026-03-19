# Pitfalls Research

**Domain:** Two-sided shift marketplace, F&B/retail gig workers, Singapore
**Researched:** 2026-03-19
**Confidence:** HIGH (regulatory), MEDIUM-HIGH (marketplace mechanics), MEDIUM (AI/matching)

---

## Critical Pitfalls

### Pitfall 1: Misclassifying ShiftSG as a "Platform Operator" under the Platform Workers Act 2025

**What goes wrong:**
The Singapore Platform Workers Act (effective 1 January 2025) currently defines "platform operators" as entities providing ride-hailing or delivery services. ShiftSG's F&B shift marketplace likely falls outside this definition — but the Act is designed to expand. If ShiftSG is structured in ways that exercise heavy management control over workers (fixed pricing, scheduling directives, mandatory uniform rules), MOM could extend classification or reclassify workers. Conversely, if ShiftSG is ever deemed a platform operator, mandatory CPF contributions, WICA insurance, earnings slips, and MOM notification requirements immediately apply per-worker.

**Why it happens:**
Founders read the current narrow definition, assume they're exempt, and build control mechanisms (rate floors, mandatory availability windows, shift acceptance pressure) that erode independent contractor status without realizing it. Instawork was forced to reclassify workers as employees in Colorado after a state audit found their control mechanisms violated contractor standards.

**How to avoid:**
- Engage an employment lawyer before launch to audit the product's control mechanisms against MOM's independent contractor tests: control over how/when work is performed, ownership of tools, financial risk on the worker
- Workers must set their own rates (reverse bidding satisfies this), choose which shifts to accept, and work for multiple clients
- Do NOT build minimum shift acceptance rate requirements, mandatory availability windows, or penalize workers for declining shifts
- Even if currently exempt from the Platform Workers Act, bake in WIC insurance from day one (it's already in scope per PROJECT.md — this reinforces it)
- Register with MOM within 14 days if the platform ever meets the definition threshold

**Warning signs:**
- Product spec includes "minimum acceptance rate" features or penalizes workers for not staying active
- Algorithm de-prioritizes workers who decline too many shifts
- Platform dictates exact rate ranges rather than allowing workers to bid freely
- Legal counsel has not reviewed the independent contractor structure before launch

**Phase to address:** Phase 1 (Foundation/Auth) — worker onboarding contract language must be reviewed before any workers sign up. Also Phase 2 (Core marketplace) — shift acceptance mechanics must be architect reviewed.

---

### Pitfall 2: Launching Across Multiple Neighborhoods Before Achieving Density in One

**What goes wrong:**
Shift marketplaces require hyperlocal liquidity — a restaurant in Tanjong Pagar needs workers who can reach Tanjong Pagar in 30 minutes, not someone in Jurong. Launching city-wide or across multiple districts simultaneously creates a supply-demand illusion: enough workers in aggregate, but not enough near any single restaurant. Fill rates stay low, restaurants churn, and workers find no shifts. The platform dies from thin markets everywhere rather than thriving in a dense one.

**Why it happens:**
Early sales pressure pushes founders to onboard as many restaurants as possible for revenue. Workers are recruited broadly to match the spread. The result is a geographically dispersed supply and demand that never achieves real-time fill capacity.

**How to avoid:**
- Commit to one F&B cluster as the launch target (PROJECT.md already identifies geographic clustering — execute this rigorously)
- Define "cluster" precisely: a walkable district with 50+ F&B establishments in under 500m radius. Candidates: Tanjong Pagar, Orchard Road F&B strip, Robertson Quay, Tiong Bahru
- Do not accept restaurant signups outside the launch cluster during the first 6 months
- Track fill rate per cluster, not platform-wide fill rate
- Only expand to a second cluster after achieving >80% fill rate within 4 hours in cluster 1

**Warning signs:**
- Onboarding team pitching restaurants across different parts of Singapore simultaneously
- Worker acquisition campaigns city-wide rather than targeted near the launch cluster
- Reporting fill rates as platform averages rather than per-district metrics
- Fill time rising despite growing total supply numbers

**Phase to address:** Phase 0 (Go-to-market planning) and enforced in Phase 1 (restaurant onboarding workflow must include geographic gating).

---

### Pitfall 3: Reverse Bidding Race to the Bottom Destroying Worker Quality

**What goes wrong:**
Reverse bidding (workers bid their price) is a differentiator, but without a price floor it becomes a race to the bottom. Desperate or low-quality workers bid $10/hr on roles that warrant $18/hr, winning on price alone. Restaurants accept the lowest bid, get poor-quality workers, get burned once, and churn. Experienced workers stop bidding because they can't compete on price against low-quality supply.

**Why it happens:**
The platform optimizes match on price transparency without quality-weighting. Restaurants, especially cost-conscious F&B operators, default to cheapest option. The feedback loop is slow: they don't realize quality degraded until mid-shift or post-shift.

**How to avoid:**
- Implement mandatory price floors per role category (e.g., floor: S$14/hr for service crew, S$18/hr for barista, S$22/hr for experienced chef) — set at MOM's Progressive Wage Model floors as baseline
- Default sort for restaurants is AI-recommended matches, NOT lowest price. Price is a secondary sort option
- Show price band context: display 50th/75th/90th percentile bid prices for each role so restaurants understand market rate
- Reliability score must be visible on every bid card before restaurant selects — quality is front-and-center
- Consider "quality bidding": AI-adjusted effective rate that factors in reliability score (a 5-star worker at S$18 gets priority over a 3-star worker at S$14)

**Warning signs:**
- Average accepted bid price trending downward over time
- Experienced, high-rated workers reducing platform activity
- Post-shift ratings for marketplace-filled shifts lower than historical employee benchmarks
- Restaurant complaints about worker quality despite low fill cost

**Phase to address:** Phase 2 (Bidding mechanics) — price floor logic must be in v1 of bidding. Phase 3 (Matching AI) — quality-weighted sorting must be default behavior.

---

### Pitfall 4: Ignoring SingPass MyInfo Version Migration Timeline

**What goes wrong:**
Myinfo v3 and v4 APIs are decommissioned on 30 September 2026. Any platform built against v3/v4 will break at that date. Migrating to v5 (FAPI 2.0) requires significant auth flow changes: mandatory PKCE, new token handling, different certificate requirements, new endpoint structures. If the platform launches on v3 in mid-2026 and must migrate immediately after, worker identity verification breaks at the worst time.

**Why it happens:**
Developers pick whichever version has the most available sample code and documentation (often v3/v4), then treat migration as a future problem. Singapore government API docs are not always prominently advertised on developer forums.

**How to avoid:**
- Build only against Myinfo v5 (current stable) from day one — do not use v3 or v4
- Check Singpass Developer Portal for the current version before any implementation: https://docs.developer.singpass.gov.sg/docs
- Implement PKCE from the start (required for FAPI 2.0)
- Use different API keys/certificates for staging and production — self-signed keys are not supported
- Test on the SingPass sandbox environment (MockPass) before production integration

**Warning signs:**
- Any integration using the legacy `/myinfo/v3/` endpoint path
- API code parsing access token contents directly (forbidden in v5)
- Certificate expiry not tracked in infrastructure monitoring
- No sandbox/staging environment set up for Myinfo testing

**Phase to address:** Phase 1 (Identity verification) — v5 is non-negotiable for any implementation started in 2026.

---

### Pitfall 5: AI Matching System with No Data to Match On (Cold-Start)

**What goes wrong:**
The platform's key differentiator is AI matching based on experience, reliability, proximity, and revenue impact. But new platforms have no historical shift data. The AI has nothing to train on. Result: recommendations in the first 3-6 months are no better than random assignment, disappointing early restaurant customers who expected "smart" matching.

**Why it happens:**
Founders build the AI matching UI and pitch it to early customers, but the underlying model is not functional without data. AI is announced as a feature before the data infrastructure exists to support it.

**How to avoid:**
- Phase the AI: launch with rule-based matching (role match + distance + explicit skills + food hygiene cert validity), openly described as "smart filtering" not "AI"
- Collect structured data from day one: shift completions, ratings, GPS check-in accuracy, bid prices, restaurant repeat requests
- Build the data pipeline in parallel with the rule-based system — the model trains on real transactions
- Flip to ML-based matching only when 500+ completed shifts exist per role category in the launch cluster
- Revenue correlation feature (which staff combinations drive higher sales) requires POS integration at restaurants — this is likely 12+ months of data minimum, position as a premium/enterprise feature

**Warning signs:**
- AI matching is listed as a launch-day feature with no data collection plan
- No explicit threshold defined for when rule-based matching switches to ML
- Revenue correlation feature bundled into v1 scope without POS integration plan
- Team cannot answer "what is our training dataset?"

**Phase to address:** Phase 2 (Core matching) — rule-based system. Phase 4 or later (AI upgrade) — ML when data threshold is met.

---

### Pitfall 6: Payment Cycle Too Slow, Losing Workers to Competitors

**What goes wrong:**
The project spec intentionally excludes instant pay at launch (no float capital). However, gig workers in Singapore have acute cash-flow needs — surveys consistently show 70%+ would leave a platform for same-day or next-day pay. If ShiftSG pays weekly or bi-weekly while competitors or other gig platforms (Grab, Deliveroo) pay within 24-48 hours, workers will prefer platforms with faster pay cycles even for lower hourly rates.

**Why it happens:**
Platform economics favor holding payroll for as long as possible (float). Founders focus on margins, not worker cash-flow psychology. Weekly pay feels "normal" from an employment perspective but is alien to gig workers used to instant gratification.

**How to avoid:**
- Set realistic expectation in PROJECT.md: weekly pay is the launch mode, but architecture must be designed for faster payouts (add instant pay when revenue supports float)
- Communicate pay schedule extremely clearly at signup — no worker should be surprised
- Use a payment provider that supports fast payouts when ready (e.g., PayNow integration for instant SGD transfers — no float required for already-earned wages)
- Track worker churn reasons actively: if "slow pay" appears in exit feedback, accelerate the payment schedule
- Consider "pay-when-invoiced" timing: restaurant pays ShiftSG within 7 days of shift, worker receives payment within 48 hours of restaurant paying

**Warning signs:**
- No payment schedule clearly stated in worker onboarding flow
- Workers messaging support asking when they'll be paid
- Drop in returning workers after first payout cycle
- Competitor platforms advertising same-day pay in the same worker acquisition channels

**Phase to address:** Phase 2 (Payments infrastructure) — design for fast payouts from the start even if not activated at launch.

---

### Pitfall 7: No-Show Backfill Taking Too Long to Activate

**What goes wrong:**
The system detects a no-show (worker hasn't GPS checked in by shift start + 10 min) and triggers "backfill with next-best worker" — but the next-best worker may be 30 minutes away, have their notifications off, or have already committed to a different job. The restaurant learns at T+40 minutes that they can't get coverage, too late for any alternative. This single failure destroys trust faster than any other scenario in F&B.

**Why it happens:**
Backfill is treated as a background process that runs when needed. The platform does not pre-position backup capacity or force standby acceptance before shift start.

**How to avoid:**
- Pre-confirmation flow: 2 hours before each shift, the confirmed worker receives a "confirm you're coming" push notification. Non-response within 30 minutes triggers pre-emptive backfill search
- Maintain a "standby pool" concept: workers who have flagged availability for a given day but haven't booked a shift — these get priority-notified as warm backfill candidates
- For high-stakes shifts (Friday dinner rush, events), prompt restaurants to book a backup worker proactively at reduced rate
- Define SLAs: backfill notification must go out within 5 minutes of no-show detection; replacement confirmed within 30 minutes or restaurant gets a fee credit
- GPS check-in is mandatory — workers who don't check in via GPS by T-15 get an automated nudge, not manual intervention

**Warning signs:**
- No "pre-confirmation" flow in product spec
- Backfill described as "automatic" without specifying standby pool architecture
- GPS check-in treated as optional ("soft" requirement)
- No SLA defined for backfill confirmation time

**Phase to address:** Phase 2 (Shift lifecycle) — backfill must be v1 behavior, not a Phase 3 addition.

---

### Pitfall 8: Rating System Gaming — Mutual Positive Rating Collusion

**What goes wrong:**
Two-way ratings (worker rates business, business rates worker) are a differentiator but create a collusion dynamic: workers give restaurants 5 stars in exchange for 5-star ratings, inflating both sides. New restaurants and new workers can't differentiate quality because everyone has 4.8+. The reliability signal degrades. This destroys the trust that makes the matching AI valuable.

**Why it happens:**
Platforms launch with simple star ratings. Workers and restaurants quickly learn that being generous benefits both parties. The platform doesn't detect the mutual inflation pattern because both parties game it independently.

**How to avoid:**
- Anchor ratings to objective events: was the worker on time (GPS data), was the shift completed (GPS clock-out), was the shift cancelled by the business (cancellation record)
- Require structured micro-ratings ("Was this worker on time? Did they follow instructions? Would you book again?") rather than just a star count — hard to uniformly collude on multi-dimensional ratings
- Flag statistically anomalous rating patterns: worker with 100 shifts and 4.95 average vs. worker with 100 shifts and 3.8 average triggers a distribution analysis
- Late arrivals and early departures are automatically recorded as objective penalties regardless of star rating
- Reliability score must incorporate hard signals (GPS data, completion rate, late rate) weighted more heavily than subjective stars

**Warning signs:**
- Ratings distribution showing >90% of workers with 4.5+ after the first 200 shifts
- No objective data inputs (GPS, completion) in reliability score formula
- Rating submission not required before payment is released
- Workers or restaurants can rate immediately without a cooling-off period

**Phase to address:** Phase 2 (Rating system design) — the formula must be objective-data-first from day one.

---

### Pitfall 9: Food Hygiene Certificate Verification Gaps

**What goes wrong:**
SFA requires all food handlers (anyone who handles/prepares food or beverages in an SFA-licensed food establishment) to hold a valid WSQ Food Safety Course Level 1 certificate, renewable every 5 years then every 10 years. If ShiftSG places an unverified or lapsed-certificate worker into a food prep role, the restaurant faces SFA enforcement. A single violation cited to ShiftSG as the placement source creates a legal liability crisis.

**Why it happens:**
Platforms treat food hygiene certs as self-reported fields (worker ticks a box). Certificates expire silently. No one checks the FHD2H (Food Handler Digital DataHub) database.

**How to avoid:**
- Food hygiene certificate status must be verified against FHD2H at signup, not just self-reported — workers log into FHD2H with SingPass and the platform captures the verified status
- Store certificate expiry dates and run automated expiry warnings at 60 days, 30 days, and 7 days before expiry
- Automatically exclude workers from food-handling shift matches if certificate is expired or unverified
- Distinguish role categories: front-of-house service roles that never handle food may not require certification — make this explicit in role taxonomy so matches are not over-restricted
- At shift completion, log the certificate status of the placed worker as part of the shift record (audit trail for SFA compliance)

**Warning signs:**
- Certificate is a self-declared field with no third-party verification
- No expiry tracking in the data model
- No distinction between food-handling vs. non-food-handling roles in the matching logic
- No audit trail of which worker's certifications were valid at time of shift

**Phase to address:** Phase 1 (Worker verification/onboarding) — certification verification must be part of the initial profile-building flow, not a later feature.

---

### Pitfall 10: Poaching Protection Fee Unenforceable Without Explicit Contract

**What goes wrong:**
The project spec includes a "conversion fee" (1 month salary) if a restaurant hires a worker within 6 months. Without explicit contract language signed by the restaurant at onboarding, this fee is unenforceable in Singapore. Restaurants will simply hire workers directly without disclosure, and ShiftSG has no legal recourse.

**Why it happens:**
Founders treat poaching protection as a product feature ("we'll add this to the terms") rather than a legal instrument that must be explicitly agreed to. "By using this service" click-through terms are weaker than line-item acknowledgment.

**How to avoid:**
- Require explicit acknowledgment of the conversion fee clause during restaurant onboarding — present it as a separate checkbox, not buried in terms
- Define the calculation clearly: "1 month salary = (agreed hourly rate x 160 hours)" — unambiguous and auditable
- Trigger the monitoring clock: every shift a worker completes at a restaurant starts a 6-month lookback clock — log these relationships explicitly
- Include a clear disclosure mechanism: present "temp-to-perm" as a positive feature ("want to hire this worker permanently? Pay a conversion fee and we'll handle the paperwork")
- Consider a grace period: if restaurant informs ShiftSG of intent to hire and pays the fee proactively, process it smoothly — incentivize compliance over evasion
- Get this reviewed by a Singapore employment lawyer before launch

**Warning signs:**
- Conversion fee language is only in general terms of service, not acknowledged separately
- No data model tracking which workers have completed shifts at which restaurants (the 6-month clock)
- No process for handling a restaurant that wants to hire a worker via the platform legitimately

**Phase to address:** Phase 1 (Restaurant onboarding/contracts) — legal structure must precede first restaurant signup.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Rule-based matching at launch instead of ML | Ships faster, no data requirement | Must be rebuilt later; restaurants may not perceive AI value | MVP only — must define upgrade trigger (500+ shifts) |
| Self-reported skills/certificates | Faster worker onboarding | Liability risk if uncertified worker placed in food-handling role | Never for food hygiene cert — verify all others eventually |
| Weekly pay cycle at launch | No float capital needed | Worker churn if competitors offer faster pay | Acceptable if communicated clearly and architecture supports upgrade |
| Simple star ratings without objective data weighting | Quick to build | Rating inflation degrades matching signal within months | Never — bake objective signals from day one |
| Skipping standby pool for backfill | Simpler shift lifecycle logic | No-show recovery fails, restaurant trust destroyed | Never — must be v1 |
| Using MyInfo v3 API for speed | More sample code available | Hard migration deadline September 2026; breaks shortly after launch | Never — use v5 only |
| City-wide worker acquisition from day one | More supply absolute numbers | Geographic spread kills local liquidity | Never during first cluster launch |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SingPass MyInfo | Using v3/v4 endpoints (deprecated Sep 2026) | Build on v5 only; use PKCE; don't parse access tokens |
| SingPass MyInfo | Single API key for staging + production | Separate certificates and keys per environment |
| FHD2H (food hygiene cert verification) | Self-reported checkbox only | Worker completes SingPass login to FHD2H; platform reads verified status |
| GPS check-in | Client-side GPS only (spoofable) | Server-side timestamp + geofence validation against shift address |
| Payment/PayNow | Batch payment at end of month | Weekly minimum; design for per-shift or next-day payout architecture |
| Push notifications for backfill | Single-channel (push only) | SMS fallback for critical backfill alerts — workers may have notifications off |
| Work Injury Insurance | Manual per-shift policy issuance | API-integrated insurance (e.g., NTUC Income, Sompo) triggered automatically at shift confirmation |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Matching query scans all workers city-wide | Shift posting takes 3-5 seconds to show candidates | Geospatial index (PostGIS or equivalent) with bounding box filter before quality sort | 1,000+ workers in platform |
| Real-time shift status (open/filled/in-progress) via polling | Mobile app drains battery; server load spikes during F&B dinner rush | WebSocket or SSE for shift status updates; push notifications for match events | 500+ concurrent shift listings |
| Rating recalculation on every page load | Profile pages slow; worker reliability score inconsistent | Pre-compute reliability scores asynchronously, cache with TTL, recompute on trigger events (new rating, shift completion) | 200+ ratings per worker |
| No-show detection via cron job (1-minute intervals) | Detection delay up to 60 seconds after cutoff | Event-driven: shift confirmation sets a server-side timer, fires no-show check exactly at T+10 | Launch day — latency in F&B context is unacceptable |
| Unindexed shift search by role + date + location | Shift browse page slow for workers | Composite index on (role, shift_date, location_cluster, status) | 10,000+ total shift records |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| NRIC stored as plaintext in database | PDPA violation; data breach exposes national IDs | Encrypt NRIC at rest; store only verification status token from SingPass, not raw NRIC |
| GPS coordinates logged without retention policy | PDPA breach; worker location history is sensitive personal data | Define retention: keep GPS check-in/check-out for 90 days (payroll disputes), delete after |
| Worker profile photo scraped from public shareable URL | Identity theft, catfishing of businesses | Require auth token for profile photo access even on "public" profiles; watermark shift cards |
| Bank account details for payout stored without encryption | Financial fraud vector | Use payment provider token vault (never store raw bank account numbers) |
| Shift booking accessible without verifying restaurant is active/verified | Fraudulent shift postings to harvest worker personal data | Restaurant must complete identity verification and first payment method before any shift is live |
| Rating manipulation via repeat account creation | Fake reviews inflate scores | Tie accounts to SingPass NRIC — one NRIC per worker account |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing shift listings before worker completes verification | Worker browses but can't bid; frustrating; creates "almost there" drop-off | Show verification progress inline on browse page; unlock bidding immediately on cert approval |
| Restaurant sees only lowest bid first | Selects cheap, unreliable worker; gets burned; churns | Default sort: AI-recommended (quality + price blend); price sort is secondary |
| Confirmation ping sent once, no follow-up | Worker misses notification; no-show occurs with no warning | Ping at T-2h, T-30min; require explicit confirm; trigger standby backfill if no response by T-90min |
| Worker payment breakdown opaque | Workers confused about deductions, reliability penalties | Itemized pay breakdown: gross hours x rate, platform fee, any penalties, net payout |
| Two-way rating presented as optional | Workers skip rating businesses; no data for worker decision-making | Lock payout until rating submitted (max 24 hours post-shift timeout to auto-close if no response) |
| Shared shift URL reveals too much personal data | Worker safety risk if shared publicly | Public profile shows name, photo, skills, ratings only — not NRIC, address, phone number |

---

## "Looks Done But Isn't" Checklist

- [ ] **SingPass MyInfo:** v5 confirmed (not v3/v4) — verify endpoint URLs before any integration work
- [ ] **Food hygiene cert:** FHD2H verification flow tested end-to-end in staging, not just self-report checkbox
- [ ] **GPS check-in:** Server-side geofence validation tested, not just client-side location ping
- [ ] **No-show backfill:** Standby pool query runs in under 5 minutes for populated test data — verify with load test
- [ ] **WIC insurance:** API integration or manual process defined and tested for first shift — not "TBD"
- [ ] **Poaching protection:** Lawyer has reviewed conversion fee clause before first restaurant signs up
- [ ] **Price floors:** MOM Progressive Wage Model rates checked and coded as hard minimums — not soft suggestions
- [ ] **Payment flow:** First payout tested end-to-end including correct platform fee deduction and worker net amount
- [ ] **Rating system:** Objective data signals (GPS, completion) wired into reliability score formula before launch — not post-launch addition
- [ ] **Worker data privacy:** NRIC not stored in plaintext — confirmed at database schema level

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Launched on MyInfo v3, migration to v5 required | HIGH | All worker logins broken during migration; re-verification flow required for every worker; 4-8 week effort |
| Rating inflation detected at 6 months | MEDIUM | Score recalibration announcement to community; reset methodology; expect 20-30% of workers to have scores drop (churn risk) |
| Worker misclassification challenge by MOM | VERY HIGH | Legal review, potential reclassification, retroactive CPF payments, product mechanic changes; may require platform pause |
| Geographic over-expansion before density | HIGH | Forced contraction back to core cluster; restaurants outside cluster must be told service is paused; reputational damage |
| No-show with no backfill system | MEDIUM | Manual ops scramble; comp credit to restaurant; but can only be solved with system changes; no quick recovery |
| Food hygiene cert violation (unverified worker placed) | HIGH | SFA enforcement against restaurant; legal liability for platform; insurance claim; must audit all previous placements |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Platform Workers Act misclassification | Phase 1 (legal/onboarding) | Employment lawyer sign-off on worker contract before any worker signs up |
| Geographic over-expansion | Phase 0 (go-to-market) + Phase 1 (onboarding gates) | Restaurant onboarding has district filter enforced; fill rate tracked per district |
| Reverse bidding race to bottom | Phase 2 (bidding mechanics) | Price floor rules coded and unit-tested; default sort is quality-weighted, not price |
| MyInfo v3/v4 usage | Phase 1 (identity verification) | API endpoint URLs audited against v5 docs before any integration code ships |
| AI cold-start | Phase 2 (matching), Phase 4+ (ML upgrade) | Launch matching is rule-based with defined ML activation threshold |
| Payment cycle churn | Phase 2 (payments) | Architecture supports per-shift payout; pay schedule clearly stated in worker onboarding |
| No-show backfill failure | Phase 2 (shift lifecycle) | Backfill SLA (<30 min) tested with simulated no-show in staging |
| Rating system gaming | Phase 2 (rating design) | Reliability score formula documented with objective data weighting; reviewed before launch |
| Food hygiene cert gaps | Phase 1 (worker verification) | FHD2H verification flow tested; cert expiry alerts firing in staging |
| Poaching protection unenforceable | Phase 1 (restaurant contracts) | Lawyer-reviewed clause; separate acknowledgment checkbox in onboarding; relationship tracking data model exists |

---

## Sources

- Singapore MOM Platform Workers Act: https://www.mom.gov.sg/employment-practices/platform-workers-act
- Platform Workers Act coverage detail: https://www.mom.gov.sg/employment-practices/platform-workers-act/what-it-covers
- SFA Food Handler requirements: https://www.sfa.gov.sg/food-handler-hygiene-officer/requirements-for-food-handler-hygiene-officer/requirements-for-food-handlers
- QuickHR Platform Workers Act HR guide: https://quickhr.co/resources/blog/platform-workers-act
- Singpass MyInfo v5 developer docs: https://docs.developer.singpass.gov.sg/docs
- MyInfo v3 decommission notice (Sep 2026): https://partnersupport.singpass.gov.sg/hc/en-sg/articles/46944126585753
- Instawork Colorado misclassification settlement: https://research.contrary.com/company/instawork
- WICA changes November 2025: https://www.mavenside.co/blog/wica-changes-november-2025-raise-cover-update-incident-playbook
- Marketplace liquidity and geographic density: https://rubygarage.org/blog/marketplace-liquidity
- Gig worker payment speed and churn: https://branchapp.com/blog/how-faster-payments-can-prevent-gig-worker-churn
- Marketplace cold start problem: https://meetmarkko.com/knowledge/how-to-avoid-the-marketplace-cold-start-trap/
- Gig economy identity fraud (Veriff 2025): https://www.veriff.com/identity-verification/mobility-and-gig-economy-fraud
- AI bias in gig marketplace matching: https://www.tandfonline.com/doi/full/10.1080/09585192.2024.2441448
- Singapore temp-to-perm conversion fees: https://www.corestaff.com.sg/temporary-staffing-singapore-how-it-works-costs/

---
*Pitfalls research for: Two-sided shift marketplace (F&B/retail, Singapore)*
*Researched: 2026-03-19*
