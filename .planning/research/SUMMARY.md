# Project Research Summary

**Project:** ShiftSG — AI-First Shift Marketplace
**Domain:** Two-sided gig marketplace, F&B / retail, Singapore
**Researched:** 2026-03-19
**Confidence:** HIGH (regulatory, stack core); MEDIUM (AI/matching specifics)

## Executive Summary

ShiftSG is a two-sided labor marketplace connecting F&B and retail businesses with on-demand shift workers in Singapore. The product sits between a simple job board and an intelligent workforce platform — the technical pattern is well-understood (Supabase + Expo + Next.js), but the business mechanics require Singapore-specific compliance work that most developers underestimate. The correct build sequence is: verified identity and legal foundation first, shift lifecycle second, GPS and time records third, trust and reliability layer fourth, AI matching fifth — in that strict order, because each phase feeds the next. Skipping or deferring any compliance layer (SingPass v5, food hygiene cert verification, WIC insurance, poaching contract clauses) creates legal exposure that is expensive to unwind post-launch.

The primary competitive differentiation is reverse bidding (workers set price within a business ceiling) combined with quality-weighted AI matching and two-way ratings — none of which Singapore competitors (Staffie, FastGig, Anytime AnyWork) have implemented. The benchmark is Instawork (US), which has validated that AI matching, two-way accountability, and worker reliability scoring are the features that drive platform retention on both sides of the marketplace. The AI matching engine should launch as a rule-based weighted formula (not ML), with a defined upgrade trigger at 500+ completed shifts per role category — the cold-start problem is critical and the ML variant genuinely cannot function without training data.

The single largest risk is geographic over-expansion before achieving density in one F&B cluster. Shift marketplaces require hyperlocal liquidity: workers need to be reachable within 30 minutes of the venue. Launching city-wide produces the illusion of supply without the substance of fill rate. The go-to-market strategy is to pick one cluster (Tanjong Pagar, Robertson Quay, or equivalent), achieve greater than 80% fill rate within 4 hours, and only then expand. This operational discipline is not optional — it is architecture for the product.

## Key Findings

### Recommended Stack

The recommended stack is Expo + React Native (SDK 52) for mobile, Next.js 15 (App Router) for the admin/business web panel, and Supabase as the unified backend (PostgreSQL, Auth, Realtime, Storage). This combination allows a single TypeScript codebase to share Zod schemas, React Query patterns, and Drizzle ORM types across all surfaces. Supabase's Row-Level Security handles authorization in the database layer, and pgvector (included via Supabase) handles AI matching embeddings without a separate vector database. Inngest on Vercel handles durable background workflows (backfill cascade, notification queuing, shift expiry) without requiring a persistent Redis worker process.

**Core technologies:**
- **Expo SDK 52 + NativeWind v4**: iOS/Android worker and business apps — single React Native codebase, NativeWind v4 required (v2 incompatible with new Expo architecture)
- **Next.js 15 App Router**: web admin panel and business portal — SSR, API Routes, zero-config Vercel deploy
- **Supabase (Postgres + pgvector + Realtime + Auth)**: primary data store, real-time shift feed, OTP/magic link auth, vector similarity for AI matching
- **Drizzle ORM**: type-safe SQL with complex joins (shift + bid + worker + score) — lighter than Prisma on serverless cold starts
- **Inngest v3**: durable serverless background jobs — backfill cascade, notification queuing, payout scheduling
- **Stripe Connect**: marketplace payments with Singapore PayNow/GrabPay support; only production-grade two-sided payout option for SG
- **OneSignal + Twilio**: push notifications (primary) with SMS fallback — OneSignal unifies FCM/APNs; Twilio SMS for backfill alerts when push fails
- **OpenAI text-embedding-3-small + pgvector**: worker skill embeddings at $0.02/1M tokens; stored alongside relational data, no separate vector DB needed at MVP scale
- **MyInfo v5 (FAPI 2.0)**: SingPass identity verification — v3/v4 decommissioned September 2026; v5 is non-negotiable for any integration started now

**Critical version constraints:**
- NativeWind must be v4 (requires Expo SDK 50+; v2 is incompatible with New Architecture)
- MyInfo must be v5 — v3/v4 break in September 2026
- Supabase JS must use `@supabase/ssr` (not legacy auth-helpers) for Next.js App Router

### Expected Features

The Singapore market has no platform offering AI matching, reverse bidding, or two-way ratings. The table-stakes bar is low (Staffie and FastGig are essentially job boards), which means there is clear runway to differentiate — but the compliance features are non-negotiable and more complex than they appear.

**Must have at launch (v1):**
- Shift posting (role, time, location, pay ceiling) — core business action
- Worker profile with SingPass identity, food hygiene cert, skills — regulatory and trust requirement
- Browse and reverse bid on shifts — key differentiator; workers set their price within ceiling
- AI matching (rule-based v1: experience + reliability + proximity) — "smart filtering" not "ML"
- GPS geofence clock-in / clock-out — indisputable time record; legal and dispute basis
- Post-shift ratings (business rates worker at launch, two-way in v1.1) — trust foundation
- Reliability score (composite: GPS attendance + ratings + no-shows) — feeds matching engine
- No-show protocol with backfill cascade — required from day one; failure destroys restaurant trust
- Work injury insurance baked into markup — Platform Workers Act (Jan 2025) compliance; mandatory
- Weekly pay to bank account — communicated clearly; architecture must support faster cycles later
- Pre-shift automated reminders (T-24h, T-2h, T-30min) — reduces no-shows
- In-app messaging (worker to business pre-shift) — market expectation

**Should have after first 100 shifts (v1.x):**
- Two-way ratings (workers rate businesses) — strong worker acquisition signal; Instawork does this
- Shareable worker profile URL (workers.sg/amy) — viral acquisition loop
- Shift completion social cards — Instagram/TikTok organic growth
- Referral system (worker refers worker and restaurant)
- Historical worker reconnection (ex-employees surface for former venues)
- Embeddable "Now Hiring" widget for restaurant websites
- AI-generated monthly summaries for workers and businesses

**Defer to v2+ (requires data or separate architecture):**
- AI demand prediction — needs 6-12 months of shift outcome data per venue
- AI revenue correlation — needs POS integration; highest differentiation, longest runway
- ML-upgraded matching engine — rule-based is sufficient for first 10,000 shifts
- White-label for enterprise F&B chains — multi-tenant complexity conflicts with early-stage speed

**Anti-features to explicitly avoid:**
- Instant/same-day pay — requires float capital; bootstrapped cannot do this
- Full payroll/HR management — regulatory scope creep; partner with StaffAny/Talenox instead
- Background police clearance checks — slow, expensive, creates false safety signal
- Chat/social community features — moderation overhead with no shift marketplace precedent for success
- AI chatbot for shift support — wrong for time-critical workers in active shifts

### Architecture Approach

The recommended pattern is a modular monolith at launch with clearly bounded domain services (Shift, Bidding, Matching, Identity, GPS/Clock, Ratings, Notifications, Payments, AI Layer). Services communicate via an internal event bus (Redis pub/sub at MVP) rather than direct cross-service calls, enabling clean decoupling without microservice deployment overhead. Background jobs (backfill cascade, confirmation pings, shift expiry) run as Inngest functions inside Vercel serverless. The AI layer operates entirely offline — it updates model weights in batch, which the Matching Engine reads at runtime. AI inference is never in the synchronous request path at MVP.

**Major components:**
1. **Identity Service** — SingPass/MyInfo v5 OAuth PKCE flow; NRIC never stored raw; hashed reference + verified flag only
2. **Shift Service** — state machine (draft → open → filled → active → completed); cancellation enforcement; backfill trigger
3. **Bidding Service** — accept/expire/rank bids; enforces price floors per role category; emits bid events
4. **Matching Engine** — scores workers against shifts using weighted formula (skills 30%, reliability 25%, proximity 20%, venue familiarity 15%, rating avg 10%); ML upgrade defined at 500+ shifts/category
5. **GPS/Clock Service** — server-side geofence validation (not client-only, which is spoofable); immutable append-only time records; multi-signal no-show detection (GPS + confirmation ping + manager code)
6. **Ratings and Trust Service** — decay-weighted reliability score (recent events weighted more); minimum 5 completed shifts before score penalizes; objective GPS data weighted above subjective stars
7. **Notification Service** — event-consumer only; never called inline in request path; push via OneSignal, SMS via Twilio
8. **Payment Service** — records payout entitlement on shift completion event; does not move money at MVP; architecture must support per-shift payout for future acceleration

**Key patterns:**
- Event-driven state transitions: shift.filled → GPS, Notifications, Payments all react independently
- Backfill cascade: no-show detected at T+10min → ranked bid list → next candidate notified → 10-minute accept window → broadcast to pool
- Matching score pipeline: SQL filter first (geospatial index, role, availability, cert validity) then quality rank — never scan all workers city-wide
- AI offline: weights updated nightly batch; Matching Engine reads weights, never calls ML model inline

### Critical Pitfalls

1. **Worker misclassification under Platform Workers Act** — Build worker autonomy into the product mechanics from day one: reverse bidding (workers set rates), voluntary shift acceptance (no acceptance rate minimums), multi-client capability. Get employment lawyer to review before any worker signs up. Recovery cost if reclassified: VERY HIGH (retroactive CPF, potential platform pause).

2. **Geographic over-expansion before density** — Enforce a cluster gate in the restaurant onboarding flow; track fill rate per district, not platform-wide. Do not accept restaurants outside the launch cluster for the first 6 months. A city-wide thin market kills the platform faster than no supply at all.

3. **Reverse bidding race to the bottom** — Price floors per role category (based on MOM Progressive Wage Model) must be hard limits in v1 of the bidding service. Default restaurant view sorts by AI-recommended quality blend, not price. Reliability score must appear on every bid card.

4. **MyInfo v3/v4 usage** — MyInfo v3 is decommissioned September 2026. Any integration started now must use v5 with PKCE and FAPI 2.0. Recovery from a live v3 integration: HIGH cost (all worker logins break during migration, full re-verification required).

5. **AI cold-start: launching ML matching with no data** — Launch with rule-based weighted scoring labeled as "smart filtering." Collect structured training data from day one (completions, ratings, GPS accuracy, bid prices). Define and enforce a hard threshold (500+ completed shifts per role category) before switching to ML. Never promise AI matching to early customers as ML-grade.

6. **No-show backfill failure** — Backfill must be v1 behavior, not a later feature. Pre-confirmation ping at T-2h and T-30min; standby pool queried immediately on no-show detection; SLA of replacement confirmed within 30 minutes or restaurant receives fee credit. Restaurant trust is destroyed by a single unrecovered no-show.

7. **Food hygiene cert verification gaps** — SFA requires valid WSQ Food Safety Course Level 1 for all food handlers. Must verify via FHD2H (Singapore government database) via SingPass, not self-reported checkbox. Automate expiry alerts at 60/30/7 days. Exclude workers from food-handling matches on expired cert. A single unverified placement creates SFA enforcement liability.

## Implications for Roadmap

Based on the dependency chain in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md:

### Phase 1: Legal and Identity Foundation

**Rationale:** Nothing works without verified identities. Worker onboarding contracts must be reviewed by an employment lawyer before any worker signs up. SingPass v5 takes 2-4 weeks for production approval — start the registration process before writing any feature code. Food hygiene cert verification via FHD2H is legally required for F&B placement. Restaurant onboarding must include the conversion fee clause as a separately acknowledged item and a geographic cluster gate. This phase has no optional items.

**Delivers:** Verified worker profiles; verified restaurant accounts (identity + payment method before any shift goes live); SingPass MyInfo v5 integration (v5 only); food hygiene cert verification flow against FHD2H; work injury insurance structure defined; employment lawyer sign-off on worker and restaurant contracts; geographic cluster gate in restaurant onboarding.

**Features from FEATURES.md:** Worker profile (SingPass identity, food hygiene cert, skills), identity verification, food hygiene cert tracking, block/favourite data model, poaching protection data model (6-month relationship clock starts here).

**Pitfalls to avoid:** MyInfo v3/v4 usage (use v5 only), worker misclassification (lawyer review before first signup), food hygiene cert gaps (FHD2H verification not self-report), poaching protection unenforceable (separate acknowledgment checkbox).

**Research flag:** Needs phase-level research — SingPass developer portal registration, FHD2H API access, MOM work permit verification, work injury insurance API options (NTUC Income, Sompo).

---

### Phase 2: Core Marketplace Loop

**Rationale:** Validate the fundamental value exchange: business posts shift → workers bid → business accepts → shift happens. Backfill must ship in this phase, not later — a no-show with no recovery destroys the restaurant relationship immediately. Payment architecture must support faster cycles even if only weekly at launch. Rating system must be objective-data-first from day one — retrofitting this is expensive and requires score recalibration.

**Delivers:** Shift posting (role, time, location, pay ceiling); reverse bidding with price floors; direct booking (business searches workers); rule-based AI matching v1 (weighted formula, not ML); GPS geofence clock-in/clock-out with server-side validation; pre-shift reminders (T-24h, T-2h, T-30min); post-shift ratings (business rates worker); reliability score (GPS + ratings, decay-weighted); no-show detection with backfill cascade; work injury insurance baked into markup; weekly pay to bank account; in-app messaging.

**Features from FEATURES.md:** All P1 features.

**Pitfalls to avoid:** Reverse bidding race to bottom (price floors required, quality-weighted default sort), no-show backfill failure (backfill SLA in v1), rating system gaming (objective data in formula from day one), payment cycle architecture (design for fast payouts even if weekly at launch), synchronous notifications (always queue via Inngest, never inline in request path), mutable time records (append-only GPS events).

**Stack used:** Supabase Realtime for live shift feed; Expo Location + Task Manager for GPS; OneSignal push + Twilio SMS; Inngest for backfill cascade and notification queuing; Stripe Connect for payment records; Drizzle for complex bid + matching queries.

**Research flag:** Standard patterns — shift marketplace mechanics are well-documented; bid flow, GPS clock-in, and Stripe Connect integration all have clear implementation patterns.

---

### Phase 3: Trust and Reliability Layer

**Rationale:** After the first 100 shifts, patterns emerge in worker behavior and rating dynamics. Phase 3 closes the feedback loops: two-way ratings (workers rate businesses), reliability score tuning based on real data, no-show penalty calibration. Historical worker reconnection requires shift history to exist before it can surface anything useful.

**Delivers:** Two-way ratings (workers rate businesses); shareable worker profile URLs; historical worker reconnection (ex-employees surface for former venues); reliability score refinement based on observed distribution; referral system (worker-to-worker, worker-to-restaurant); shift completion social cards.

**Features from FEATURES.md:** All P2 features.

**Pitfalls to avoid:** Rating system gaming (monitor rating distribution; flag anomalous patterns; anchor to objective GPS signals). Two-way ratings increase collusion surface — structured micro-ratings ("was worker on time?") resist uniform gaming better than single star count.

**Research flag:** Low research need — two-way rating systems are well-documented; referral mechanics are standard.

---

### Phase 4: Growth and Acquisition Layer

**Rationale:** Once the marketplace is operating reliably in the launch cluster, shift focus to organic acquisition loops. The embeddable "Now Hiring" widget drives passive worker acquisition from restaurant websites. AI-generated monthly summaries create perceived value from data that already exists. Geographic expansion to a second cluster should only begin after achieving greater than 80% fill rate within 4 hours in cluster 1.

**Delivers:** Embeddable "Now Hiring" widget; AI-generated monthly summaries (LLM-generated from platform metrics); temp-to-perm conversion pathway (formalizes what is already happening organically); geographic cluster expansion; admin analytics dashboard (fill rates, revenue correlation proxies, demand patterns).

**Features from FEATURES.md:** Remaining P2 features; early P3 groundwork.

**Research flag:** AI-generated summaries need LLM prompt design research; embeddable widget needs CORS and iframe security research.

---

### Phase 5: AI Intelligence Layer

**Rationale:** By Phase 5, the platform has 500+ completed shifts per role category in the launch cluster — the ML activation threshold. This is when rule-based matching gets upgraded to embedding-based semantic matching using pgvector. Demand forecasting becomes viable with 6+ months of shift + outcome data. Revenue correlation (which staff combinations drive higher sales) requires POS integration data and is the highest-differentiation but longest-runway feature.

**Delivers:** ML-upgraded matching engine (pgvector cosine similarity on skill embeddings); demand forecasting (batch model, historical shift data per venue); POS integration adapter layer (Square, Lightspeed, Moka); revenue correlation model (alpha, premium/enterprise tier); cross-training capability profiles (passive enrichment from multi-venue shift history).

**Features from FEATURES.md:** All P3 features.

**Stack used:** OpenAI text-embedding-3-small for worker and shift embeddings; pgvector for cosine similarity search; Supabase Edge Functions for inference pipeline; nightly batch weight update cycle.

**Pitfalls to avoid:** AI cold-start (do not upgrade to ML until threshold is confirmed met); revenue correlation without POS data (this feature is non-functional without restaurant sales data integration — position as premium/enterprise only).

**Research flag:** Needs deep research — ML matching pipeline design, pgvector query optimization at scale, POS API adapter patterns (each POS system is different).

---

### Phase 6: Enterprise and White-Label

**Rationale:** White-label for enterprise F&B chains (McDonald's, BreadTalk equivalents) requires a stable, battle-tested core and multi-tenant architecture. This conflicts with early-stage speed and should not be touched until PMF is established. Temp-to-perm conversion at scale requires formal placement fee infrastructure and legal templates per jurisdiction.

**Delivers:** Multi-tenant white-label architecture; consolidated enterprise reporting; outlet management for F&B groups; enterprise SaaS fee model; placement fee infrastructure for temp-to-perm conversions at scale.

**Features from FEATURES.md:** White-label (P3).

**Research flag:** Needs architecture research — multi-tenancy patterns in Supabase (RLS per tenant vs schema-per-tenant), enterprise billing models, Singapore employment law for placement agency licensing.

---

### Phase Ordering Rationale

- **Legal before features:** The Platform Workers Act misclassification risk and MyInfo v5 migration deadline mean legal and identity work must precede all feature development. There is no safe way to launch workers on the platform before the employment structure is reviewed.
- **Backfill in Phase 2, not later:** A no-show with no recovery is the single fastest way to lose a restaurant customer. It cannot be deferred to a later phase.
- **Rule-based AI before ML AI:** The cold-start problem is real and the ML system literally cannot function without training data. Launching with rule-based matching and collecting structured data is the only viable approach.
- **Density before expansion:** Geographic expansion must be gated on demonstrated fill rate in the first cluster. This is an operational rule that must be enforced, not a soft recommendation.
- **Two-way ratings in Phase 3:** Ratings require shift history to exist and patterns to observe. Phase 2 establishes the objective data foundation (GPS, completion rates); Phase 3 closes the loop with two-way subjective ratings.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1:** SingPass developer portal registration process (2-4 week approval timeline), FHD2H API access and authentication, MOM work permit verification options, work injury insurance API availability (NTUC Income, Sompo)
- **Phase 5:** pgvector query optimization at scale, ML matching pipeline design, POS adapter patterns per system (Square, Lightspeed, Moka), training data pipeline architecture
- **Phase 6:** Supabase multi-tenancy patterns (RLS-per-tenant vs schema-per-tenant trade-offs), Singapore placement agency licensing requirements

Phases with standard, well-documented patterns (skip or minimize research):
- **Phase 2:** Shift marketplace mechanics, GPS geofence implementation, Stripe Connect marketplace setup, Inngest background jobs — all have clear documentation and established patterns
- **Phase 3:** Two-way rating systems, referral mechanics, social sharing card generation — standard patterns
- **Phase 4:** Embeddable widget (iframe / JS snippet pattern), LLM-generated summaries

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core framework choices (Expo, Next.js, Supabase) are well-documented with current version compatibility confirmed. MyInfo v5 decommission timeline is from official Singpass documentation. Inngest vs BullMQ trade-off is MEDIUM (web search inference, not official benchmarks). |
| Features | HIGH (core), MEDIUM (AI) | Competitive analysis is grounded in live competitor pages and Instawork help center docs. AI demand prediction and revenue correlation have no direct Singapore precedent — estimates are based on Instawork analogies and general ML literature. |
| Architecture | MEDIUM-HIGH | Core marketplace patterns (event-driven state machine, GPS geofence, backfill cascade) are validated across multiple sources. Matching score weights (skills 30%, reliability 25%, etc.) are reasonable starting points but should be tuned against real data. Revenue correlation model has no direct precedent to validate against. |
| Pitfalls | HIGH (regulatory), MEDIUM (operational) | Singapore Platform Workers Act coverage is sourced directly from MOM. SFA food handler requirements are from official SFA documentation. MyInfo decommission is confirmed. Operational pitfalls (rating gaming, geographic density, payment churn) are based on gig economy research and Instawork case studies — directionally sound but specific thresholds (e.g., "80% fill rate" expansion trigger) are judgment calls. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Work injury insurance API:** No standard Singapore insurer API confirmed to exist. Research NTUC Income and Sompo for digital integration options before Phase 1 begins; may require manual process at MVP with automation deferred.
- **FHD2H integration specifics:** The food hygiene certificate database (FHD2H) integration via SingPass is described in regulatory requirements but specific API documentation was not retrieved — needs developer portal investigation before Phase 1 implementation.
- **Matching score weights:** The weighted formula (skills 30%, reliability 25%, proximity 20%, venue familiarity 15%, rating avg 10%) is a reasonable starting point but should be validated against operator feedback in the first cluster before being treated as stable.
- **Price floors per role category:** The research recommends MOM Progressive Wage Model floors as the baseline minimum. Specific SGD values per role category (service crew, barista, experienced chef) need to be confirmed against current MOM published rates before the bidding service is built.
- **POS integration landscape for Singapore F&B:** The research identifies Square, Lightspeed, and Moka as targets for Phase 5 revenue correlation, but the Singapore market penetration of each system in F&B venues needs validation before architecture decisions are made.

## Sources

### Primary (HIGH confidence)
- Singapore MOM — Platform Workers Act (https://www.mom.gov.sg/employment-practices/platform-workers-act)
- SFA — Food Handler requirements (https://www.sfa.gov.sg/food-handler-hygiene-officer)
- Singpass Developer Portal — MyInfo v5 (https://docs.developer.singpass.gov.sg/docs)
- Singpass MyInfo v3 decommission notice (https://partnersupport.singpass.gov.sg/hc/en-sg/articles/46944126585753)
- Instawork Help Center — Reliability, Ratings, No-Show handling
- Expo SDK 52 Documentation (https://docs.expo.dev/)
- Supabase Realtime + RLS Documentation
- pgvector via Supabase Documentation
- WICA changes November 2025 (https://www.mavenside.co/blog/wica-changes-november-2025)

### Secondary (MEDIUM confidence)
- Supabase vs Firebase 2026 comparison — Postgres advantage for relational marketplace data
- Instawork Colorado misclassification case — independent contractor structure risks
- Gig worker payment speed and churn research (branchapp.com)
- Marketplace liquidity and geographic density research (rubygarage.org)
- AI bias in gig marketplace matching (Tandfonline 2024)
- Staffie, FastGig, Anytime AnyWork — competitor product pages
- Singapore Platform Workers Act HR guide (QuickHR)
- Vercel vs Fly.io cost comparison (Ritza)

### Tertiary (LOW confidence)
- Inngest vs BullMQ serverless trade-offs — web search inference, no official benchmark
- NativeWind v4 adoption patterns — community reports
- Temp-to-perm fee structure analogies — US staffing industry applied to Singapore context

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
