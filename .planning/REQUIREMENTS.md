# Requirements: ShiftSG

**Defined:** 2026-03-19
**Core Value:** A restaurant can fill any shift with a qualified, verified worker in under 30 minutes — and the AI ensures the right person, not just any person.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Identity & Compliance

- [ ] **AUTH-01**: Worker identity verification via SingPass MyInfo v5 (NRIC, name, address auto-filled)
- [ ] **AUTH-02**: Food hygiene certificate (FHD2H) verification at signup for F&B workers (conditional — retail workers exempt)
- [ ] **AUTH-03**: Work permit verification for foreign workers via MOM records
- [ ] **AUTH-04**: Work injury insurance coverage activated per shift, baked into markup
- [ ] **AUTH-05**: Restaurant onboarding with UEN verification and business profile
- [ ] **AUTH-06**: Lawyer-reviewed worker contracts (independent contractor classification)

### Core Marketplace

- [ ] **MRKT-01**: Businesses (F&B or retail) post shifts with industry, role (waiter, cook, barista, cashier, merchandiser, stock room), time, location, and pay ceiling
- [ ] **MRKT-02**: Workers browse and bid on shifts (reverse bidding — workers set their price within range)
- [ ] **MRKT-03**: Price floors per role category anchored to MOM Progressive Wage Model rates
- [ ] **MRKT-04**: Restaurants search available workers by skills, ratings, location, availability and book directly
- [ ] **MRKT-05**: AI matching recommends optimal workers based on experience, reliability, proximity, and past performance at venue
- [ ] **MRKT-06**: GPS geofenced clock-in and clock-out with indisputable time records
- [ ] **MRKT-07**: No-show protection: confirmation ping 2 hours before, auto-cancel on no response
- [ ] **MRKT-08**: Auto-backfill: when no-show detected, AI immediately offers shift to next-best standby worker
- [ ] **MRKT-09**: Late arrival handling: ETA tracking, pay from arrival time, reliability score impact
- [ ] **MRKT-10**: Abandonment handling: pay for hours worked, severe score penalty, replacement activation
- [ ] **MRKT-11**: Restaurant cancellation policy: late cancellations compensate worker (50-100% based on notice)
- [ ] **MRKT-12**: Historical worker pool: ex-employees remain in system for ad-hoc shifts at former workplaces
- [ ] **MRKT-13**: Cross-training tracking: AI builds capability profiles from shift history across cuisines, roles, venues

### Trust & Quality

- [ ] **TRST-01**: Two-way post-shift ratings (workers rate businesses, businesses rate workers, 1-5 stars + comments)
- [ ] **TRST-02**: Skill-specific ratings (e.g., food prep: 4.5, customer service: 3.8)
- [ ] **TRST-03**: Reliability scoring based on attendance, punctuality, ratings, shift completion rate
- [ ] **TRST-04**: Restaurant quality score visible to workers (safety, management, payment reliability)
- [ ] **TRST-05**: Penalty system: no-show warning → 48hr suspension → permanent ban on third offense
- [ ] **TRST-06**: Worker dispute resolution: locked terms, GPS time records, platform mediation

### Gamification — Workers

- [ ] **GAME-01**: Worker tier system: Rookie → Regular → Pro → Elite → Legend (based on shifts, rating, reliability)
- [ ] **GAME-02**: Tier perks: higher tiers see shifts earlier (30min → 2hr advantage), priority backfill offers, featured profiles
- [ ] **GAME-03**: Streak bonuses: 10 consecutive clean shifts = badge + temporary tier boost
- [ ] **GAME-04**: Skill badges: "Barista 50+", "Kitchen Pro", "Service Star" earned through shift type + ratings
- [ ] **GAME-05**: Weekly active bonus: 3+ shifts in a week = tier points bonus
- [ ] **GAME-06**: Crew system: form groups of 3-5, crew bonuses when working same venue, crew leaderboards
- [ ] **GAME-07**: Restaurant loyalty badge: 10+ shifts at same venue = "Regular" badge visible to that employer

### Gamification — Restaurants

- [ ] **GAME-08**: Restaurant tier system: New → Active → Trusted → Premier (based on shifts posted, worker ratings, payment history)
- [ ] **GAME-09**: Tier perks: higher tiers get faster fills, AI recommends top workers first, "Trusted" badge visible to workers
- [ ] **GAME-10**: Paid Shift Bump: $5-10 to push shift to top of worker feeds for 2 hours
- [ ] **GAME-11**: Paid Urgent Fill: $15-20 for top placement + push notification blast to all eligible nearby workers
- [ ] **GAME-12**: Paid Featured Employer: $99/mo for premium placement in worker search + "Featured" badge
- [ ] **GAME-13**: Paid Re-engage Worker: $3 to send personal "we'd love you back" notification to specific past worker

### Growth & Viral (AARRR)

- [ ] **GROW-01**: Shareable worker profiles with public URL (shiftsg.com/username) — ratings, skills, availability
- [ ] **GROW-02**: Shareable shift completion cards — visual post-shift summary designed for Instagram/WhatsApp/TikTok
- [ ] **GROW-03**: Worker → Worker referral: both earn $25 after first completed shift
- [ ] **GROW-04**: Worker → Restaurant referral (Scout program): $50 when restaurant posts first shift
- [ ] **GROW-05**: Restaurant → Restaurant referral: 3 shifts at reduced markup
- [ ] **GROW-06**: Embeddable "Now Hiring" widget for restaurant websites showing open shifts (with ShiftSG branding)
- [ ] **GROW-07**: AI weekly summary (workers): earnings, ratings, tier progress — designed to be screenshotted and shared
- [ ] **GROW-08**: AI weekly summary (restaurants): fill times, top workers, cost stats
- [ ] **GROW-09**: Crew referral multiplier: recruit 3 friends who complete shifts → crew bonus + tier boost for all
- [ ] **GROW-10**: Challenge Shifts: premium high-pay shifts for Elite+ workers only — results posted publicly to create FOMO
- [ ] **GROW-11**: Open House Shifts: discounted "try the industry" shifts for curious newcomers, students, career changers
- [ ] **GROW-12**: Waitlist with referral boost at launch: "Refer a friend → move up 10 spots"
- [ ] **GROW-13**: First Shift Guarantee: AI matches new workers to a shift within 48 hours of signup

### AI Intelligence

- [ ] **AI-01**: Rule-based matching engine: proximity + experience + reliability + past venue performance scoring
- [ ] **AI-02**: AI demand prediction: weather + events + historical patterns → proactive staffing recommendations
- [ ] **AI-03**: AI scheduling assistant: "Based on last 4 weeks, you'll need 3 extra staff this Friday. Pre-fill?"
- [ ] **AI-04**: Personalized shift feed: AI learns worker preferences (time, location, cuisine, role) and curates recommendations
- [ ] **AI-05**: Revenue correlation: identify which worker combinations drive higher sales (requires POS integration)

### White-Label

- [ ] **WL-01**: White-label deployment option for enterprise chains to run internally across outlets
- [ ] **WL-02**: Custom branding (logo, colors) on white-label instance
- [ ] **WL-03**: Separate SaaS pricing model for white-label (monthly fee, not per-shift markup)

## v2 Requirements

Deferred to future release.

### Payments & Financial

- **PAY-01**: Instant pay (shift ends → money hits account immediately). Requires float capital.
- **PAY-02**: Worker premium subscription ($9.99/mo): advanced analytics, tax helper, priority access
- **PAY-03**: Restaurant analytics subscription ($49/mo): deep insights, forecasting, revenue correlation

### Advanced AI

- **AI-06**: ML-based matching (upgrade from rules to embeddings after 500+ shifts per category)
- **AI-07**: pgvector semantic skill matching for nuanced role fit
- **AI-08**: Automated demand-based pricing suggestions for restaurants

### Expansion

- **EXP-01**: Multi-cluster expansion beyond launch geography
- **EXP-02**: Additional industry verticals (events, logistics, healthcare)
- **EXP-03**: ASEAN expansion (Malaysia, Thailand)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full payroll/HR management | We're a marketplace, not an HR platform |
| Background checks / police clearance | Future add-on, not core MVP |
| International expansion | Singapore first |
| POS integration for revenue correlation | Phase 2+ feasibility spike needed |
| Card payments / fintech features | Not a payments company |
| Worker training / certification platform | Out of scope; verify certs, don't issue them |
| Free first shift for restaurants | Too expensive bootstrapped |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 — Legal & Identity | Pending |
| AUTH-02 | Phase 1 — Legal & Identity | Pending |
| AUTH-03 | Phase 1 — Legal & Identity | Pending |
| AUTH-04 | Phase 1 — Legal & Identity | Pending |
| AUTH-05 | Phase 1 — Legal & Identity | Pending |
| AUTH-06 | Phase 1 — Legal & Identity | Pending |
| MRKT-01 | Phase 2 — Core Marketplace | Pending |
| MRKT-02 | Phase 2 — Core Marketplace | Pending |
| MRKT-03 | Phase 2 — Core Marketplace | Pending |
| MRKT-04 | Phase 2 — Core Marketplace | Pending |
| MRKT-05 | Phase 2 — Core Marketplace | Pending |
| MRKT-06 | Phase 2 — Core Marketplace | Pending |
| MRKT-07 | Phase 3 — Shift Lifecycle & Protection | Pending |
| MRKT-08 | Phase 3 — Shift Lifecycle & Protection | Pending |
| MRKT-09 | Phase 3 — Shift Lifecycle & Protection | Pending |
| MRKT-10 | Phase 3 — Shift Lifecycle & Protection | Pending |
| MRKT-11 | Phase 3 — Shift Lifecycle & Protection | Pending |
| TRST-01 | Phase 4 — Trust & Quality | Pending |
| TRST-02 | Phase 4 — Trust & Quality | Pending |
| TRST-03 | Phase 4 — Trust & Quality | Pending |
| TRST-04 | Phase 4 — Trust & Quality | Pending |
| TRST-05 | Phase 4 — Trust & Quality | Pending |
| TRST-06 | Phase 4 — Trust & Quality | Pending |
| GAME-01 | Phase 5 — Worker Gamification | Pending |
| GAME-02 | Phase 5 — Worker Gamification | Pending |
| GAME-03 | Phase 5 — Worker Gamification | Pending |
| GAME-04 | Phase 5 — Worker Gamification | Pending |
| GAME-05 | Phase 5 — Worker Gamification | Pending |
| GAME-06 | Phase 5 — Worker Gamification | Pending |
| GAME-07 | Phase 5 — Worker Gamification | Pending |
| GAME-08 | Phase 6 — Restaurant Gamification & Revenue | Pending |
| GAME-09 | Phase 6 — Restaurant Gamification & Revenue | Pending |
| GAME-10 | Phase 6 — Restaurant Gamification & Revenue | Pending |
| GAME-11 | Phase 6 — Restaurant Gamification & Revenue | Pending |
| GAME-12 | Phase 6 — Restaurant Gamification & Revenue | Pending |
| GAME-13 | Phase 6 — Restaurant Gamification & Revenue | Pending |
| GROW-03 | Phase 7 — Acquisition & Launch Loops | Pending |
| GROW-04 | Phase 7 — Acquisition & Launch Loops | Pending |
| GROW-05 | Phase 7 — Acquisition & Launch Loops | Pending |
| GROW-12 | Phase 7 — Acquisition & Launch Loops | Pending |
| GROW-13 | Phase 7 — Acquisition & Launch Loops | Pending |
| GROW-01 | Phase 8 — Viral Growth & Content | Pending |
| GROW-02 | Phase 8 — Viral Growth & Content | Pending |
| GROW-06 | Phase 8 — Viral Growth & Content | Pending |
| GROW-07 | Phase 8 — Viral Growth & Content | Pending |
| GROW-08 | Phase 8 — Viral Growth & Content | Pending |
| GROW-09 | Phase 8 — Viral Growth & Content | Pending |
| GROW-10 | Phase 8 — Viral Growth & Content | Pending |
| GROW-11 | Phase 8 — Viral Growth & Content | Pending |
| AI-01 | Phase 9 — AI Intelligence | Pending |
| AI-02 | Phase 9 — AI Intelligence | Pending |
| AI-03 | Phase 9 — AI Intelligence | Pending |
| AI-04 | Phase 9 — AI Intelligence | Pending |
| AI-05 | Phase 9 — AI Intelligence | Pending |
| MRKT-12 | Phase 9 — AI Intelligence | Pending |
| MRKT-13 | Phase 9 — AI Intelligence | Pending |
| WL-01 | Phase 10 — White-Label Enterprise | Pending |
| WL-02 | Phase 10 — White-Label Enterprise | Pending |
| WL-03 | Phase 10 — White-Label Enterprise | Pending |

**Coverage:**
- v1 requirements: 59 total (note: REQUIREMENTS.md initially estimated 50; actual count is 59 after full enumeration)
- Mapped to phases: 59
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability populated after roadmap creation*
