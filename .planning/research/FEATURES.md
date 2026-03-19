# Feature Research

**Domain:** AI-first shift marketplace — F&B and retail, Singapore
**Researched:** 2026-03-19
**Confidence:** HIGH (core competitive analysis), MEDIUM (AI differentiation details)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features both workers and businesses assume exist. Missing these = product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Shift posting (business side) | Core action — post role, time, location, pay | LOW | Role, date/time, location, pay rate minimum |
| Browse and apply to shifts (worker side) | Core action — workers find work | LOW | Filter by date, location, role type |
| Worker profile with skills + experience | Businesses need to evaluate before booking | MEDIUM | Skills list, certifications, work history, photo |
| GPS clock-in / clock-out | Indisputable time records for pay disputes | MEDIUM | Geofencing preferred; prevents buddy-punching |
| Post-shift ratings — business rates worker | Every competitor does this; workers expect accountability | LOW | Star + text; surface on worker profile |
| Worker reliability/performance score | Businesses need to trust that booked workers show up | MEDIUM | Composite of attendance, punctuality, ratings |
| Automated reminders pre-shift | Reduces no-shows; every mature platform uses this | LOW | Push notification 24h and 2h before shift |
| Real-time shift status for businesses | Businesses need to know if their shift is filled | LOW | Confirmed / en route / arrived / completed |
| In-app messaging (worker ↔ business) | Pre-shift questions, directions, updates | LOW | Staffie has this; expected in SG market |
| Weekly pay to bank account | Workers won't use platform that delays pay | MEDIUM | Direct bank transfer; Staffie pays every Monday |
| Identity verification (NRIC / SingPass) | SG regulatory requirement; trust signal for businesses | HIGH | SingPass MyInfo integration required |
| Shift history and earnings dashboard | Workers track income; businesses audit costs | LOW | Basic reporting for both sides |
| Cancellation handling (both directions) | Late cancellations are the #1 friction point in the market | MEDIUM | Policy enforcement, automated notifications, compensation |
| Food hygiene certificate validation | Required by MOM for F&B workers | MEDIUM | Manual upload + expiry tracking at minimum |
| Work injury insurance per shift | Singapore Platform Workers Act (Jan 2025) — legally mandatory | HIGH | Must be baked into platform markup, WICA-compliant |
| Block / favourite workers | Businesses need to manage their preferred pool | LOW | Block = never show again; Favourite = priority matching |
| No-show handling | Every operator in the market faces this; needs a response | MEDIUM | Replacement activation; score penalty; partial pay |

### Differentiators (Competitive Advantage)

Features that set ShiftSG apart. None of the Singapore competitors have these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Reverse bidding — workers set their price | Market-driven pricing vs fixed-rate. Workers compete on value not just availability. Novel in SG. | HIGH | Businesses set ceiling; workers bid at or below. Matching considers bid + reliability score. |
| AI matching engine | Right worker, not just any worker. Considers experience, reliability, proximity, shift history. | HIGH | Instawork does this at scale (9M workers); needs ML pipeline from day 1 even if simple |
| Two-way ratings — workers rate businesses | Attracts quality workers who choose good employers. Punishes bad actors. | MEDIUM | Instawork does this; SG competitors don't. Strong worker acquisition signal. |
| Historical worker reconnection | Ex-employees can pick up shifts at former workplaces. Huge F&B value — they know the venue. | MEDIUM | Link worker history to specific venues; auto-surface "worked here before" during matching |
| AI demand prediction | "Friday + rain + concert at MBS = need 3 extra by 6pm." Proactive vs reactive. | HIGH | Requires training data; starts useful after 6-12 months of platform data |
| AI revenue correlation | Which worker combos drive higher covers/revenue. Premium insight for serious operators. | VERY HIGH | Requires POS integration or proxy data; Phase 2+ feature. Highest differentiation but needs data. |
| Cross-training capability profiles | AI builds skill graph from shift history across venues and cuisines. Workers gain credibility automatically. | MEDIUM | Passive profile enrichment — no worker effort required |
| Shareable worker profile URL | workers.sg/amy — workers share their own profile as a credential. Drives organic acquisition. | LOW | Static public URL with ratings, skills, availability signal |
| Shareable shift completion cards | Post-shift social cards. Workers share earnings milestones. Viral organic growth loop. | LOW | Designed for Instagram/TikTok. "Completed 50 shifts" milestone cards |
| "Now Hiring" embeddable widget | Restaurant website shows live open shifts. Drives direct worker acquisition at zero cost. | MEDIUM | iframe or JS snippet; branded with restaurant name; deep links to app |
| AI-generated monthly summaries | Workers: earnings + growth report. Businesses: fill rates + top performers + cost trends. | MEDIUM | Automated LLM-generated insights from raw platform data; high perceived value, low marginal cost |
| White-label for chains | Enterprise F&B groups (McDonald's, BreadTalk, etc.) run ShiftSG internally under their brand | HIGH | Separate branding layer, consolidated reporting, outlet management. SaaS fee model. |
| Temp-to-perm conversion (framed positively) | Structured pathway for businesses to permanently hire workers they love. Platform earns placement fee. | MEDIUM | Conversion fee (~1 month salary equivalent). Framed as "Hire this person full-time" not penalty. |
| Geographic clustering launch | Launch in one F&B district (e.g. Tanjong Pagar). High density = fast fill = viral word-of-mouth. | LOW (ops strategy) | Not a feature per se but shapes how features roll out; proximity matching only works in density |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem obvious to request but create structural problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Instant / same-day pay | Workers want money now; huge marketing appeal | Requires float capital (bridge funding gap between when business pays and when worker gets paid). Bootstrapped = can't do this. Even Instawork does weekly pay. | Weekly guaranteed pay with zero delay. Make reliability the pitch, not speed. |
| Free trial shifts / subsidised first booking | Lower barrier for businesses to try platform | Subsidies burn cash at bootstrapped scale. Creates the wrong customer (those who only come for free things). | Geographic clustering + strong referral incentives are a better acquisition mechanism |
| Full payroll / HR management | Natural upsell — businesses want one tool | Regulatory complexity (IR8A, CPF for full-time, leave management). Scope creep that competes with StaffAny, Talenox. Platform focus is shifts, not HR. | Partner with StaffAny or Talenox for businesses that want this — referral revenue |
| Background / police clearance checks | Security-conscious businesses (events, hotels) want this | Expensive, slow (days not minutes), creates false safety signal, not required by MOM for F&B gig. | Food hygiene cert + SingPass identity + ratings + shift history is sufficient trust stack for F&B |
| Subscription pricing for workers | "Netflix for shifts" — predictable revenue | Workers avoid fixed costs for variable income. Wrong psychology for this user. | Transaction-based is correct model for workers. Businesses pay the markup. |
| Chat / social feed / community features | Feels like value-add, workers "connect" | Moderation overhead, legal liability for content, dilutes product focus. No shift marketplace has successfully built community. | Worker profiles + ratings + completion cards capture social signal without community overhead |
| Bidding wars (unlimited upward bidding) | Maximum market efficiency signal | Price discovery is good, but if bids escalate to unusual levels it creates hostility, makes budgeting impossible for small F&B. | Cap bids at business-set ceiling. Reverse bidding with a floor and ceiling. |
| AI chatbot for shift support | Feels modern, low-cost support | For shift workers in time-critical moments (I'm lost, I can't get in), chatbot creates friction not relief. | Human on-call for active shifts. AI summaries for everything else. |

---

## Feature Dependencies

```
SingPass Identity Verification
    └──enables──> Worker Profile (trusted)
                      └──enables──> AI Matching
                                        └──enables──> Reverse Bidding (bids weighted by reliability)
                                        └──enables──> Historical Worker Reconnection

GPS Clock-in / Clock-out
    └──enables──> Shift Completion Tracking (indisputable)
                      └──enables──> Reliability Score (objective)
                                        └──feeds──> AI Matching
                                        └──feeds──> Post-Shift Summary Cards

Post-Shift Ratings (business rates worker)
    └──enables──> Worker Reliability Score
    └──enables──> Two-Way Ratings (worker rates business)
                      └──differentiates──> Worker acquisition quality

AI Matching Engine
    └──requires──> Worker Profile data (skills, history, location)
    └──requires──> Reliability Score history
    └──enhances──> Reverse Bidding (bid is one input, not the only input)
    └──matures into──> AI Demand Prediction (with 6+ months platform data)
                           └──matures into──> AI Revenue Correlation (requires POS data or proxy)

Shift Posting
    └──enables──> Worker Browse + Apply
    └──enables──> Embeddable "Now Hiring" Widget

Worker Profile (public URL)
    └──enables──> Shareable Profile URL
    └──enables──> Shift Completion Cards

Referral System
    └──requires──> Worker Profile (identity for tracking)
    └──enhances──> Shareable Profile URL (referral link embedded)

White-Label
    └──requires──> All core features stable and battle-tested
    └──requires──> Multi-tenant architecture
    └──conflicts with──> Early-stage speed (adds complexity)
```

### Dependency Notes

- **SingPass required before any worker can work:** No shortcut — MOM compliance and business trust require verified identity. This is Phase 1 infrastructure.
- **Reliability score requires GPS clock-in + ratings:** Cannot be computed without objective attendance data and subjective quality signal. Both needed.
- **AI matching improves with data:** A simple rule-based matcher is acceptable at launch. Upgrade to ML when platform has 1,000+ completed shifts for training.
- **AI demand prediction / revenue correlation are Phase 2+:** These require 6-12 months of platform history. Building them Day 1 means building on no data.
- **White-label conflicts with speed:** Multi-tenant adds complexity to every feature. Defer until core marketplace is proven.
- **Two-way ratings enhance worker acquisition:** Workers pick platforms that protect them from bad employers. This feature has outsized impact on supply-side quality at low implementation cost.

---

## MVP Definition

### Launch With (v1)

Minimum viable to validate that businesses will pay and workers will show up.

- [ ] Shift posting — role, time, location, pay ceiling
- [ ] Worker profile with SingPass identity, food hygiene cert, skills
- [ ] Browse and bid on shifts (reverse bidding)
- [ ] Businesses search available workers and direct-book
- [ ] AI matching (rule-based v1: experience + reliability + proximity)
- [ ] GPS clock-in / clock-out
- [ ] Automated pre-shift reminders
- [ ] Post-shift ratings (business rates worker only — two-way in v1.1)
- [ ] Reliability score (computed from attendance + ratings)
- [ ] No-show protocol (confirmation ping → GPS trigger → score penalty)
- [ ] Work injury insurance baked into markup (Platform Workers Act compliance)
- [ ] Weekly pay to bank account
- [ ] In-app messaging (worker ↔ business pre-shift)
- [ ] Block / favourite workers

### Add After Validation (v1.x)

Features to add once first 100 shifts are completed and patterns emerge.

- [ ] Two-way ratings (workers rate businesses) — adds once businesses are proven; builds worker trust
- [ ] Shareable worker profile URL — viral acquisition loop; add when workers want to share
- [ ] Shift completion cards — social sharing; add when milestone data exists
- [ ] Referral system — worker refers worker, worker refers restaurant; add when network density needs a boost
- [ ] Historical worker reconnection — surfaces ex-employee availability to former venues
- [ ] Embeddable "Now Hiring" widget — for restaurants with websites; drives passive worker acquisition
- [ ] AI-generated monthly summaries — easy win once data exists; LLM-generated from platform metrics
- [ ] Temp-to-perm conversion pathway — formalise once organic conversions start happening

### Future Consideration (v2+)

Defer until product-market fit is established and platform has meaningful data.

- [ ] AI demand prediction — needs 6-12 months of shift + outcome data per venue
- [ ] AI revenue correlation — needs POS integration or proxy sales data; very high value but high complexity
- [ ] Cross-training capability profiles — passive enrichment; valuable once workers have multi-venue history
- [ ] White-label for enterprise chains — separate product; needs stable core + multi-tenant architecture
- [ ] ML-upgraded matching engine — rule-based is fine for first 10,000 shifts; upgrade when patterns are clear

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shift posting | HIGH | LOW | P1 |
| Worker profile + SingPass | HIGH | HIGH | P1 |
| Browse + reverse bidding | HIGH | MEDIUM | P1 |
| Direct booking (business searches workers) | HIGH | LOW | P1 |
| GPS clock-in / clock-out | HIGH | MEDIUM | P1 |
| Work injury insurance | HIGH (legal) | HIGH | P1 |
| Post-shift ratings | HIGH | LOW | P1 |
| Reliability score | HIGH | MEDIUM | P1 |
| No-show protocol | HIGH | MEDIUM | P1 |
| Weekly pay | HIGH | MEDIUM | P1 |
| Pre-shift reminders | MEDIUM | LOW | P1 |
| In-app messaging | MEDIUM | LOW | P1 |
| Block / favourite | MEDIUM | LOW | P1 |
| AI matching (rule-based v1) | HIGH | MEDIUM | P1 |
| Two-way ratings | HIGH | LOW | P2 |
| Shareable worker profile URL | MEDIUM | LOW | P2 |
| Shift completion social cards | MEDIUM | LOW | P2 |
| Referral system | HIGH | MEDIUM | P2 |
| Historical worker reconnection | HIGH | MEDIUM | P2 |
| Embeddable hiring widget | MEDIUM | MEDIUM | P2 |
| AI monthly summaries | MEDIUM | LOW | P2 |
| Temp-to-perm conversion | MEDIUM | LOW | P2 |
| AI demand prediction | HIGH | HIGH | P3 |
| AI revenue correlation | HIGH | VERY HIGH | P3 |
| Cross-training profiles | MEDIUM | MEDIUM | P3 |
| White-label enterprise | HIGH | VERY HIGH | P3 |
| ML-upgraded matching | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — platform cannot function without this
- P2: Should have — adds significant value, unlocks growth loops
- P3: Future — deferred until PMF established or data exists

---

## Competitor Feature Analysis

| Feature | Staffie (SG) | FastGig (SG) | Anytime AnyWork (SG) | Instawork (US) | ShiftSG (us) |
|---------|--------------|--------------|----------------------|----------------|--------------|
| Shift posting | Yes | Yes | Yes | Yes | Yes |
| Worker browse + apply | Yes | Yes | Yes | Yes | Yes |
| Reverse bidding | No | No | No | No | **Yes — differentiator** |
| AI matching | No | No | No | Yes (ML, 9M workers) | Yes (rule-based v1, ML later) |
| Two-way ratings | No (workers not rated by biz publicly) | No | No | Yes | Yes |
| Workers rate businesses | No | No | No | Yes | Yes |
| GPS clock-in/out | Yes | Yes | Unknown | Yes | Yes |
| SingPass identity | No (manual) | No (manual) | Unknown | N/A (US) | Yes |
| Food hygiene cert tracking | Unknown | No | Unknown | N/A | Yes |
| Reliability score | Basic (cancellation tracking) | No | No | Yes (tiered access) | Yes |
| No-show backup workers | No | No | No | Yes (paid backup) | Yes (AI-triggered) |
| Historical worker reconnection | No | No | No | Partial (roster) | Yes — differentiator |
| Demand prediction | No | No | No | Partial | Yes (v2) |
| Revenue correlation | No | No | No | No | Yes (v2) — **unique** |
| Shareable profile URL | No | No | No | No | Yes — differentiator |
| Social completion cards | No | No | No | No | Yes — differentiator |
| Referral system | No | No | No | Yes (basic) | Yes (two-sided) |
| Embeddable widget | No | No | No | No | Yes — differentiator |
| White-label | No | No | No | No | Yes (v2) |
| Work injury insurance | No (worker arranges) | No | Unknown | Yes (included) | Yes (baked in) — Platform Workers Act |
| Instant pay | No | No | No | No | No (weekly) |
| Weekly pay | Yes (Monday) | Yes | Yes | No | Yes |

**Gap summary:** SG competitors are basic job boards. No AI, no bidding, no two-way accountability, no predictive capability. Instawork is the benchmark but is US-only and has no Singapore presence.

---

## Sources

- [Instawork — How It Works](https://www.instawork.com/how-it-works) — MEDIUM confidence (marketing page)
- [Instawork Help Center — Reliability](https://help.instawork.com/en/articles/6449818-understand-your-performance-score) — HIGH confidence
- [Instawork Help Center — Ratings](https://help.instawork.com/en/articles/9676201-ratings) — HIGH confidence
- [Instawork Help Center — No-Show / GPS](https://www.instawork.com/blog/how-instawork-built-repeatable-reliability) — HIGH confidence
- [Upshift — For People](https://upshift.work/for-people/) — MEDIUM confidence
- [Staffie — Business](https://www.staffie.app/business/) — MEDIUM confidence
- [Staffie — App Store reviews / PanelPlace](https://www.panelplace.com/products/staffie/4323) — LOW confidence (aggregate reviews)
- [FastGig — Employer page](https://www.fastgig.sg/employer-hire-part-time-workers) — MEDIUM confidence
- [FastGig — Platform growth 2025](https://www.fastgig.sg/blog/fastgig-singapore-your-one-stop-platform-for-gigs-flexible-jobs) — MEDIUM confidence
- [Anytime AnyWork + StaffAny partnership](https://anytimeanywork.com/blog/why-fb-employers-in-singapore-should-use-anytime-work-staffany-for-staffing-success/) — MEDIUM confidence
- [Singapore Platform Workers Act 2025 — QuickHR](https://quickhr.co/resources/blog/platform-workers-act) — HIGH confidence
- [Platform Workers Act — CPF and insurance details](https://www.corestaff.com.sg/platform-workers-bill-singapore-cpf-obligations/) — HIGH confidence
- [WOLF — White-label staffing platform](https://www.wolf.xyz/white-label-temp-staffing-platform) — MEDIUM confidence
- [Temp-to-perm fee structure](https://www.activatedscale.com/blog/temp-to-perm-fee-structure-staffing-transition) — MEDIUM confidence
- [AI demand forecasting in restaurants — TimeFORGE](https://timeforge.com/industry-news/ai-driven-labor-forecasting-transforms-restaurant-operations/) — MEDIUM confidence
- [HyperTrack shift work marketplace](https://hypertrack.com/shift-work-marketplace) — MEDIUM confidence
- [Two-sided referral programs in gig economy](https://goboon.co/post/employee-referral-programs-in-the-gig-economy-adapting-to-the-changing-workforce-landscape/) — MEDIUM confidence
- [AnyShift referral program example](https://www.anyshift.com/business-referral-shifter) — LOW confidence (single example)

---
*Feature research for: AI-first F&B/retail shift marketplace (Singapore)*
*Researched: 2026-03-19*
