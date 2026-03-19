# ShiftSG (working name)

## What This Is

An AI-first shift marketplace for Singapore's F&B and retail industry. Restaurants and retailers post last-minute shifts, qualified workers bid for them, and AI matches the best worker to each shift based on experience, reliability, proximity, and revenue impact. Businesses can also search and directly book available workers.

The platform solves the chronic staffing crisis in Singapore's F&B and retail sectors — where staff call in sick, don't show up, or quit with no notice — by maintaining a deep pool of verified, rated shift workers who can fill gaps within minutes.

## Core Value

A restaurant can fill any shift with a qualified, verified worker in under 30 minutes — and the AI ensures the right person, not just any person.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Businesses post shifts with role, time, location, and pay range
- [ ] Workers browse and bid on available shifts (reverse bidding — workers bid their price)
- [ ] Businesses search available workers by skills, ratings, location, and availability, and book directly
- [ ] AI matching recommends optimal workers based on experience, reliability, proximity, and past performance at that venue
- [ ] AI revenue correlation identifies which worker combinations drive higher revenue
- [ ] AI demand prediction forecasts staffing needs ("Friday + rain + nearby event = need 2 extra")
- [ ] Worker identity verification via SingPass MyInfo (NRIC, name, address)
- [ ] Skills and certification tracking (food hygiene cert, barista training, POS systems known)
- [ ] Reliability scoring based on attendance, punctuality, ratings, and shift completion
- [ ] Post-shift ratings — businesses rate workers, workers rate businesses (two-way)
- [ ] Historical worker pool — past employees remain in the system and can pick up ad-hoc shifts at former workplaces
- [ ] Cross-training tracking — AI builds capability profiles from shift history across different cuisines, roles, and venue types
- [ ] No-show protection — confirmation pings, GPS check-in, auto-backfill with next-best worker
- [ ] Late arrival handling — ETA tracking, pay from arrival time, score impact
- [ ] Abandonment handling — pay for hours worked, reliability score penalty, replacement activation
- [ ] Injury protocol — mandatory work injury insurance on every shift, incident reporting, WICA compliance
- [ ] Poaching protection — conversion fee (1 month salary) if restaurant hires worker within 6 months. Framed as "temp-to-perm" feature
- [ ] Restaurant cancellation policy — late cancellations compensate the worker (50-100% based on notice)
- [ ] Shift completion tracking — GPS clock-in/clock-out, indisputable time records
- [ ] Worker public profiles — shareable URL (shifts.sg/amy) with ratings, skills, availability
- [ ] Shareable shift completion cards — visual post-shift summary designed for social media sharing
- [ ] Referral system — workers refer workers (both earn bonus after completed shift), workers refer restaurants, restaurants refer restaurants
- [ ] "Now Hiring" embeddable widget for restaurant websites showing open shifts
- [ ] AI-generated monthly summaries for workers (earnings, ratings, growth) and restaurants (fill times, top workers, revenue impact)
- [ ] White-label option for large chains to run internally across their outlets
- [ ] Geographic clustering launch strategy — saturate one F&B district before expanding

### Out of Scope

- Instant pay / same-day pay — requires float capital we don't have at launch
- Free first shift — too expensive for bootstrapping
- Full payroll / HR management — we're a marketplace, not an HR platform
- International expansion — Singapore first, ASEAN later
- Card payment / financial services — not a fintech play
- Background checks / police clearance — optional future add-on, not core

## Context

**Market:** Singapore's F&B sector has chronic staffing shortages. Over 1.2 million gig workers (15.4% of labour force). 50% month-on-month increase in gig job applications in 2023. Hourly rates up to S$22/hr.

**Competitors:**
- **Staffie** (SG) — basic F&B shift app, no AI, no bidding
- **FastGig** (SG) — simple gig job board, multi-industry
- **Anytime AnyWork** (SG) — flexible F&B staffing, partners with StaffAny
- **Instawork** (US) — the benchmark. 5M+ workers, ML matching, 35% markup, $100M+ revenue. Not in Singapore.

**Differentiators vs all competitors:**
1. Reverse bidding (market-driven pricing, not fixed)
2. AI revenue correlation (which staff combos drive more sales)
3. Historical worker reconnection (ex-employees pick up shifts)
4. Two-way ratings (workers rate businesses too)
5. White-label for chains

**Regulatory:** MOM (Ministry of Manpower) rules on gig worker classification. Workers are independent contractors. Platform must structure carefully to maintain this classification. Food hygiene certification required for F&B workers. Work permit verification for foreign workers.

**Revenue model:** Percentage markup on shift cost (20-25%). Worker bids $16/hr → restaurant pays $19.20-$20/hr. White-label: monthly SaaS fee for enterprise chains.

**Growth strategy:** Product-led. Shareable profiles, shift cards for social media, two-way referrals (workers bring workers AND restaurants), embeddable widgets, geographic clustering (launch in one dense F&B district, expand block by block).

## Constraints

- **Budget**: Bootstrapped — no venture funding assumed. Must be lean.
- **Tech stack**: TBD — should be fast to build, mobile-first, real-time capable
- **Regulation**: Must comply with MOM gig worker classification rules
- **Insurance**: Must carry work injury insurance for every active shift — baked into markup
- **Identity**: SingPass MyInfo integration required for worker verification

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reverse bidding model | Market-driven pricing prevents overpaying. Novel vs competitors. | — Pending |
| No instant pay at launch | Requires float capital we don't have | — Pending |
| 20-25% markup (vs Instawork's 35%) | Undercut the global benchmark while maintaining margins | — Pending |
| Geographic clustering launch | Density drives fill speed which drives retention | — Pending |
| White-label as separate product | Enterprise chains want their own branded version | — Pending |
| Workers rate businesses too | Attracts quality workers, punishes bad employers. Differentiator | — Pending |

---
*Last updated: 2026-03-19 after initialization*
