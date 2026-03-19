# Roadmap: ShiftSG

## Overview

ShiftSG is an AI-first shift marketplace for Singapore's F&B and retail industry. The build sequence is non-negotiable: verified identity and legal foundation first (SingPass MyInfo v5 is a 2-4 week approval blocker), then the core reverse-bidding marketplace loop, then shift lifecycle protection (backfill must ship before any restaurant goes live), then trust and quality signals, then gamification on both sides of the marketplace, then viral growth loops, then AI intelligence upgrades, and finally white-label enterprise. Ten phases. Every phase delivers a coherent, verifiable capability. Nothing is bolted on at the end.

## Phases

**Phase Numbering:**
- Integer phases (1-10): Planned milestone work in execution order
- Decimal phases (e.g., 2.1): Urgent insertions between milestones

- [ ] **Phase 1: Legal & Identity** - SingPass MyInfo v5, verified worker and restaurant accounts, employment contracts
- [ ] **Phase 2: Core Marketplace** - Shift posting, reverse bidding, direct booking, rule-based AI matching, GPS clock-in/out
- [ ] **Phase 3: Shift Lifecycle & Protection** - No-show detection, backfill cascade, late arrival handling, abandonment, cancellation policy
- [ ] **Phase 4: Trust & Quality** - Two-way ratings, skill-specific scores, reliability scoring, penalty system, dispute resolution
- [ ] **Phase 5: Worker Gamification** - Tiers, streaks, skill badges, weekly bonuses, crew system, venue loyalty
- [ ] **Phase 6: Restaurant Gamification & Revenue** - Restaurant tiers, paid boosts (Bump, Urgent Fill, Featured, Re-engage)
- [ ] **Phase 7: Acquisition & Launch Loops** - Waitlist referral, First Shift Guarantee, worker and restaurant referral programs
- [ ] **Phase 8: Viral Growth & Content** - Public worker profiles, shift cards, embeddable widget, AI summaries, Challenge Shifts, Open House
- [ ] **Phase 9: AI Intelligence** - Demand prediction, scheduling assistant, personalized feed, revenue correlation, historical pool, cross-training profiles
- [ ] **Phase 10: White-Label Enterprise** - Multi-tenant deployment, custom branding, enterprise SaaS pricing

## Phase Details

### Phase 1: Legal & Identity
**Goal**: Every worker and business (F&B or retail) on the platform is legally verified, contractually protected, and compliant before any shift is posted
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. A worker can sign up and have their NRIC, name, and address auto-filled via SingPass MyInfo v5 — no manual entry
  2. F&B workers: food hygiene certificate verified against FHD2H (not self-reported) and blocks F&B shift access if expired. Retail workers: SingPass verification sufficient — no additional certification required
  3. A foreign worker's MOM work permit is verified and their eligible shift types are automatically scoped
  4. A business (restaurant or retail store) can onboard with UEN verification, select their industry (F&B/retail), acknowledge the poaching protection clause, and is geofenced to the launch cluster
  5. Every active shift is automatically covered by work injury insurance baked into the platform markup — no manual enrollment
  6. A lawyer-reviewed independent contractor agreement is accepted by every worker before their first bid
**Plans**: TBD

### Phase 2: Core Marketplace
**Goal**: An F&B or retail business can post a shift and have a qualified, verified worker accepted and clocked in within 30 minutes
**Depends on**: Phase 1
**Requirements**: MRKT-01, MRKT-02, MRKT-03, MRKT-04, MRKT-05, MRKT-06
**Success Criteria** (what must be TRUE):
  1. A business can post a shift with role (F&B: waiter, cook, barista; Retail: cashier, merchandiser, stock room), date, time, location, and pay ceiling in under 2 minutes
  2. A worker can browse open shifts and submit a bid at their chosen rate — within the role floor and restaurant ceiling
  3. Price floors per role category (anchored to MOM Progressive Wage Model) are enforced hard — no bid below floor is accepted
  4. A restaurant can search available workers by skills, ratings, location, and availability, and send a direct booking offer
  5. AI matching surfaces the top-ranked eligible workers per shift based on experience, reliability, proximity, and past venue performance — with scores visible on each bid card
  6. A worker's GPS clock-in is validated server-side against the venue geofence — clock-in is rejected if outside the boundary, and the time record is immutable
**Plans**: TBD

### Phase 3: Shift Lifecycle & Protection
**Goal**: No restaurant ever loses a shift to an unrecovered no-show — and every edge case (late arrival, abandonment, cancellation) has a defined, automated response
**Depends on**: Phase 2
**Requirements**: MRKT-07, MRKT-08, MRKT-09, MRKT-10, MRKT-11
**Success Criteria** (what must be TRUE):
  1. Every booked worker receives automated confirmation pings at T-24h, T-2h, and T-30min — non-response at T-2h triggers auto-cancel and backfill
  2. When a no-show is detected at T+10min, the platform automatically offers the shift to the next-ranked standby worker with a 10-minute accept window — replacement is confirmed within 30 minutes or the restaurant receives a fee credit
  3. A late worker's pay starts from their verified GPS arrival time — not the shift start time — and their reliability score is updated automatically
  4. A worker who abandons mid-shift is paid for hours worked, receives a severe reliability score penalty, and backfill is triggered for remaining hours
  5. A restaurant that cancels with less than 4 hours notice automatically triggers a worker compensation payment (50-100% based on notice window)
**Plans**: TBD

### Phase 4: Trust & Quality
**Goal**: Every participant on the platform — worker and restaurant — has a transparent, credible quality signal that drives better matching and holds both sides accountable
**Depends on**: Phase 3
**Requirements**: TRST-01, TRST-02, TRST-03, TRST-04, TRST-05, TRST-06
**Success Criteria** (what must be TRUE):
  1. After every completed shift, both the worker and the restaurant receive a rating prompt — workers rate the business, businesses rate the worker — and both ratings are publicly visible
  2. Skill-specific ratings (food prep, customer service, speed, etc.) appear on each worker's profile alongside the aggregate star rating
  3. A worker's reliability score is calculated from GPS attendance data, punctuality, no-show history, and rating averages — with recent events weighted more than older ones
  4. Workers can see a restaurant's quality score (management, safety, payment reliability) before accepting a booking
  5. A worker who no-shows receives a 48-hour suspension on first offense and a permanent ban on the third offense — enforced automatically
  6. A worker can raise a dispute using GPS time records as locked evidence, and the platform mediates with an audit trail
**Plans**: TBD

### Phase 5: Worker Gamification
**Goal**: Workers are intrinsically motivated to accumulate shifts, maintain streaks, earn badges, and collaborate in crews — driving supply-side retention without cash incentives
**Depends on**: Phase 4
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04, GAME-05, GAME-06, GAME-07
**Success Criteria** (what must be TRUE):
  1. A worker's tier (Rookie → Regular → Pro → Elite → Legend) is visible on their profile and updates automatically based on shifts, ratings, and reliability
  2. Higher-tier workers see new shift postings earlier than lower-tier workers — Elite sees shifts 2 hours before Rookie
  3. A worker who completes 10 consecutive clean shifts earns a visible streak badge and a temporary tier boost
  4. Skill badges (e.g., "Barista 50+", "Kitchen Pro", "Retail 50+", "Cashier Pro") are earned automatically based on verified shift types and ratings — not self-claimed
  5. A crew of 3-5 workers can form a named group, earn crew bonuses when assigned to the same venue, and appear on the crew leaderboard
  6. A worker who completes 10+ shifts at the same venue earns a "Regular" badge visible to that employer specifically
**Plans**: TBD

### Phase 6: Restaurant Gamification & Revenue
**Goal**: Restaurants have tier-based incentives to be good employers, and paid tools to fill shifts faster — creating a secondary revenue stream beyond the shift markup
**Depends on**: Phase 4
**Requirements**: GAME-08, GAME-09, GAME-10, GAME-11, GAME-12, GAME-13
**Success Criteria** (what must be TRUE):
  1. A restaurant's tier (New → Active → Trusted → Premier) is visible to workers browsing shifts and updates based on posting history, worker ratings, and payment reliability
  2. A Premier-tier restaurant's shifts surface first in worker feeds and receive priority AI matching to top-rated workers
  3. A restaurant can pay $5-10 to bump a shift to the top of worker feeds for 2 hours — the boost activates immediately and expires automatically
  4. A restaurant can pay $15-20 to trigger a push notification blast to all eligible nearby workers for an urgent fill
  5. A restaurant can pay $99/month to appear as a Featured Employer in worker searches with a visible badge
  6. A restaurant can pay $3 to send a personal re-engagement notification to a specific past worker
**Plans**: TBD

### Phase 7: Acquisition & Launch Loops
**Goal**: The platform has self-reinforcing acquisition mechanics that grow both sides of the marketplace through referrals and guaranteed early matches — enabling a confident launch
**Depends on**: Phase 2
**Requirements**: GROW-03, GROW-04, GROW-05, GROW-12, GROW-13
**Success Criteria** (what must be TRUE):
  1. A worker can join the waitlist, refer a friend, and move up 10 spots for each successful referral — invite code tracked end-to-end
  2. A new worker who completes signup is matched to at least one shift within 48 hours by the AI — or receives an explanation of why no match was found
  3. A worker who refers another worker who completes their first shift receives a $25 bonus automatically — no manual processing
  4. A worker in the Scout program who refers a restaurant that posts its first shift receives a $50 bonus automatically
  5. A restaurant that refers another restaurant receives a reduced markup on their next 3 shifts automatically
**Plans**: TBD

### Phase 8: Viral Growth & Content
**Goal**: Every completed shift generates shareable content, and the platform's presence compounds organically through public profiles, restaurant embeds, and AI-generated summaries
**Depends on**: Phase 4, Phase 7
**Requirements**: GROW-01, GROW-02, GROW-06, GROW-07, GROW-08, GROW-09, GROW-10, GROW-11
**Success Criteria** (what must be TRUE):
  1. Every worker has a public profile URL (shiftsg.com/username) showing ratings, skills, verified credentials, and availability — shareable to WhatsApp or LinkedIn
  2. After every completed shift, the worker receives a shareable visual card with their earnings, rating, and shift type — one tap to share to Instagram or TikTok
  3. A restaurant can embed a "Now Hiring" widget on their own website that shows live open shifts with ShiftSG branding and a direct apply link
  4. Workers receive a weekly AI-generated summary of earnings, tier progress, and top skills — designed to be screenshotted and shared
  5. Restaurants receive a weekly AI-generated summary of fill times, top workers, and cost per filled shift
  6. Elite+ workers can access Challenge Shifts — premium high-pay shifts visible only to that tier — with results posted publicly to create visible FOMO for lower tiers
  7. A newcomer or student can join an Open House Shift — a discounted "try the industry" shift that doubles as a worker acquisition funnel
  8. A crew that recruits 3 new workers who all complete their first shift receives a multiplied bonus — tracked and paid automatically
**Plans**: TBD

### Phase 9: AI Intelligence
**Goal**: The platform uses accumulated shift data to predict demand, personalize feeds, surface forgotten workers, and build capability profiles — shifting from reactive fill to proactive staffing
**Depends on**: Phase 3, Phase 4
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, MRKT-12, MRKT-13
**Success Criteria** (what must be TRUE):
  1. The rule-based matching engine scores every eligible worker against a shift using weighted criteria (skills, reliability, proximity, venue familiarity, rating) and returns a ranked list in under 500ms
  2. A restaurant receives a proactive demand forecast ("Friday + Zouk nearby + rain = 2 extra staff recommended") based on historical patterns, weather, and event data
  3. A restaurant can click "Pre-fill staffing for next Friday" and the AI scheduling assistant books standby workers automatically based on the forecast
  4. A worker's shift feed is personalized — the platform learns their preferred times, locations, cuisines, and roles from shift history and surfaces matching shifts higher
  5. A restaurant sees ex-employees and frequent past workers surfaced as priority suggestions when posting a shift — historical reconnection without manual search
  6. AI builds a cross-training capability profile for each worker from their shift history across venues, roles, and cuisines — visible on their profile and used in matching
  7. Revenue correlation identifies which worker combinations at a venue correlate with higher sales — surfaced as an insight to the restaurant (requires POS data)
**Plans**: TBD

### Phase 10: White-Label Enterprise
**Goal**: A large F&B chain can run a fully branded internal shift marketplace powered by ShiftSG infrastructure — with outlet management, enterprise reporting, and a SaaS fee model
**Depends on**: Phase 9
**Requirements**: WL-01, WL-02, WL-03
**Success Criteria** (what must be TRUE):
  1. An enterprise chain can deploy a white-label instance with their own logo, brand colors, and domain — no ShiftSG branding visible to their workers
  2. A chain's outlet managers can post, fill, and manage shifts across multiple locations from a single admin panel
  3. An enterprise client is billed a monthly SaaS fee (not per-shift markup) and can view consolidated reporting across all outlets
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
Note: Phase 7 depends on Phase 2 (not Phase 6) — can begin parallel to Phases 5-6 after Phase 4 is complete.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Legal & Identity | 0/TBD | Not started | - |
| 2. Core Marketplace | 0/TBD | Not started | - |
| 3. Shift Lifecycle & Protection | 0/TBD | Not started | - |
| 4. Trust & Quality | 0/TBD | Not started | - |
| 5. Worker Gamification | 0/TBD | Not started | - |
| 6. Restaurant Gamification & Revenue | 0/TBD | Not started | - |
| 7. Acquisition & Launch Loops | 0/TBD | Not started | - |
| 8. Viral Growth & Content | 0/TBD | Not started | - |
| 9. AI Intelligence | 0/TBD | Not started | - |
| 10. White-Label Enterprise | 0/TBD | Not started | - |

---
*Roadmap created: 2026-03-19*
*Coverage: 59/59 v1 requirements mapped*
