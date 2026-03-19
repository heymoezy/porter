# Architecture Research

**Domain:** Two-sided shift marketplace (F&B / retail, Singapore)
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH (core patterns verified across multiple sources; AI revenue correlation is novel and has no direct precedent to validate against)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ Worker App   │  │Business App  │  │  Admin Panel │               │
│  │ (mobile PWA) │  │ (mobile PWA) │  │  (web)       │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
└─────────┼─────────────────┼─────────────────┼───────────────────────┘
          │  REST + WebSocket│                 │
┌─────────┼─────────────────┼─────────────────┼───────────────────────┐
│                        API GATEWAY                                   │
│  Auth middleware │ Rate limiting │ Role routing                      │
├──────────────────────────────────────────────────────────────────────┤
│                        CORE SERVICES                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │  Shift     │  │  Bidding   │  │  Matching  │  │  Identity  │     │
│  │  Service   │  │  Service   │  │  Engine    │  │  Service   │     │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │  GPS /     │  │  Ratings & │  │  Notif.    │  │  Payment   │     │
│  │  Clock     │  │  Trust     │  │  Service   │  │  Service   │     │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘    │
├──────────────────────────────────────────────────────────────────────┤
│                        AI LAYER                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │
│  │ Matching Score │  │ Demand Forecast│  │ Revenue Corr.  │         │
│  │ Model          │  │ Model          │  │ Model          │         │
│  └────────────────┘  └────────────────┘  └────────────────┘         │
├──────────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ PostgreSQL │  │   Redis    │  │  Object    │  │  Job Queue │     │
│  │ (primary)  │  │ (cache +   │  │  Storage   │  │ (BullMQ /  │     │
│  │            │  │  pub/sub)  │  │ (profiles, │  │  pg-boss)  │     │
│  │            │  │            │  │  media)    │  │            │     │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Boundary — What It Does NOT Own |
|-----------|---------------|--------------------------------|
| **Shift Service** | Shift CRUD, state machine (draft → open → filled → active → completed), cancellation policy enforcement, backfill trigger | Does not select the replacement worker — delegates to Matching Engine |
| **Bidding Service** | Accept / reject / expire bids, enforce bid window, track bid history, emit bid events | Does not rank bids — ranking is Matching Engine's job |
| **Matching Engine** | Score workers against open shifts, rank bids, trigger backfill recommendations, feed AI models with labelled data | Does not notify workers — emits events that Notification Service consumes |
| **Identity Service** | SingPass/MyInfo OAuth2.1 PKCE flow, NRIC verification, work permit checks, certificate upload/expiry tracking | Does not store raw NRIC in app DB — stores a hashed reference and MyInfo-confirmed verification flag |
| **GPS / Clock Service** | Geofence check-in/check-out, ETA tracking once shift starts, time record storage, late-arrival detection | Does not process payment — emits completed-shift event to Payment Service |
| **Ratings & Trust Service** | Two-way ratings storage, reliability score computation, no-show/abandon penalty application, score history | Does not gate shift access directly — exposes score; Matching Engine uses it |
| **Notification Service** | Push (FCM/APNs), SMS (Twilio), in-app WebSocket events, confirmation pings, backfill broadcasts | Does not decide who to notify — consumes events and routes to correct channel |
| **Payment Service** | Shift cost calculation (worker bid + markup), invoice generation, payout record, insurance deduction tracking | Does not move money at MVP — records what is owed; payout processed externally |
| **AI Layer** | Matching score model, demand forecast model, revenue correlation model | Separate inference jobs; not in the request path at MVP |

---

## Recommended Project Structure

```
src/
├── api/                    # HTTP handlers (thin — delegate to services)
│   ├── shifts/
│   ├── bids/
│   ├── workers/
│   ├── businesses/
│   └── admin/
├── services/               # Domain logic
│   ├── shift/
│   ├── bidding/
│   ├── matching/
│   ├── identity/
│   ├── gps/
│   ├── ratings/
│   ├── notifications/
│   └── payments/
├── ai/                     # ML models and inference
│   ├── matching-score/
│   ├── demand-forecast/
│   └── revenue-correlation/
├── workers/                # Background job handlers (queue consumers)
│   ├── backfill.ts
│   ├── confirmation-pings.ts
│   └── shift-expiry.ts
├── realtime/               # WebSocket server and event bus
│   └── events.ts
├── integrations/           # Third-party adapters
│   ├── singpass/
│   ├── twilio/
│   └── fcm/
├── db/
│   ├── schema/
│   └── migrations/
└── shared/                 # Types, errors, utils
```

### Structure Rationale

- **services/ separated from api/:** API handlers stay thin. This allows background workers and WebSocket handlers to call the same service logic without HTTP round-trips.
- **ai/ as a separate directory:** AI inference jobs run outside the request path. Separating them prevents blocking the API and makes model replacement easy.
- **workers/ for background jobs:** Backfill, confirmation pings, and shift expiry are time-sensitive but async. They consume from the job queue.
- **integrations/ isolated:** SingPass, Twilio, and FCM adapters are wrapped so they can be swapped or mocked without touching domain logic.

---

## Architectural Patterns

### Pattern 1: Event-Driven State Transitions

**What:** Shift lifecycle changes emit domain events. Other services subscribe and react rather than being called directly.

**When to use:** Any state transition that triggers work in multiple services (shift filled → notify worker + notify business + reserve insurance slot + start GPS tracking window).

**Trade-offs:** Decouples services cleanly. Adds observability overhead. At MVP scale, Redis pub/sub is sufficient; no need for Kafka.

**Example:**
```typescript
// Shift service emits
eventBus.emit('shift.filled', { shiftId, workerId, businessId, startTime })

// Notification service subscribes
eventBus.on('shift.filled', async ({ shiftId, workerId }) => {
  await notify(workerId, 'Your shift is confirmed')
  await notify(businessId, 'Shift filled')
})

// GPS service subscribes
eventBus.on('shift.filled', async ({ shiftId, startTime }) => {
  await scheduleCheckInWindow(shiftId, startTime)
})
```

### Pattern 2: Scoring Pipeline for Matching

**What:** When a shift is posted (or a backfill fires), the Matching Engine runs all eligible workers through a scoring pipeline and returns an ordered list.

**When to use:** Any time the platform needs to recommend, rank, or auto-assign workers.

**Trade-offs:** Synchronous scoring is simple at small scale. Beyond ~10k active workers, precomputed scores cached in Redis are necessary. Start synchronous, cache when slow.

**Score components (weighted, tunable):**
```
match_score = (
  skills_match       * 0.30  +  // exact cert/role match
  reliability_score  * 0.25  +  // attendance, completion rate, no-shows
  proximity          * 0.20  +  // distance from venue at shift start
  venue_familiarity  * 0.15  +  // prior shifts at this business
  rating_avg         * 0.10     // post-shift ratings received
)
```

### Pattern 3: Geofence Clock-In (GPS Boundary)

**What:** Worker must be within N metres of the venue to trigger a valid clock-in. Clock-out similarly verified. Time records are GPS-stamped and immutable.

**When to use:** Every shift. This is the indisputable time record and the dispute resolution mechanism.

**Trade-offs:** GPS can fail indoors (dense buildings in CBD). Fallback: manual clock-in with manager code, logged as "manual" and flagged for review. Do not silently accept manual clock-ins as equivalent.

### Pattern 4: Backfill Cascade

**What:** When a no-show is detected (worker does not clock in N minutes after shift start), the system automatically triggers a backfill sequence: notify next-ranked worker from the original bid list, then broadcast to eligible pool if they decline.

**When to use:** Automatically, triggered by GPS / Clock Service detecting a missed check-in.

**Trade-offs:** Speed vs. quality. Cascade through ranked candidates first (quality). If no accept within 10 minutes, broadcast to entire eligible pool (speed). Business can see real-time status of the backfill attempt.

---

## Data Flow

### Shift Post → Fill Flow

```
Business posts shift
    ↓
Shift Service: create shift record (state: open)
    ↓
Event: shift.posted → Notification Service broadcasts to eligible workers
    ↓
Workers submit bids → Bidding Service stores bids, emits bid.received events
    ↓
Business reviews bids (or AI recommends top pick)
    ↓
Business accepts bid → Bidding Service confirms
    ↓
Event: shift.filled → GPS Service arms check-in window
                    → Notification Service confirms to both parties
                    → Payment Service reserves payout record
```

### GPS Clock-In → Shift Active Flow

```
Worker arrives, app triggers clock-in attempt
    ↓
GPS Service: verify coordinates within geofence radius
    ↓
PASS → Shift state: active, timestamp recorded immutably
FAIL → Reject clock-in, send "move closer" prompt to worker
       After N minutes no valid clock-in → no-show trigger
    ↓
Shift active → Notification Service notifies business: "Worker clocked in"
```

### No-Show → Backfill Flow

```
GPS Service: no valid clock-in by [shift_start + 15min]
    ↓
Event: shift.no_show
    ↓
Ratings Service: flag pending reliability penalty (applied after shift window closes)
    ↓
Matching Engine: retrieve ranked bid list for this shift
    ↓
Notification Service: contact candidate #2 from bid list
    ↓
Accept within 10min → shift.filled (backfill)
Decline / no response → contact candidate #3 ... → broadcast to pool
    ↓
Business notified of backfill status throughout
```

### AI Matching Score Flow (MVP — offline batch)

```
Shift completed → ratings submitted
    ↓
Background job: write labelled training row
(worker_id, shift_id, score_components, outcome: showed/no-show/rated_X)
    ↓
Nightly batch: retrain or fine-tune weights
    ↓
Updated weights deployed to Matching Engine scoring pipeline
```

---

## Suggested Build Order (Dependency Chain)

Build order is driven by dependency: you cannot test matching without workers, cannot test bidding without shifts, cannot test backfill without GPS.

```
Phase 1 — Identity & Trust Foundation
  └─ Identity Service (SingPass/MyInfo)
  └─ Worker profiles + Business profiles
  └─ Skills and certification storage
  (Nothing works without verified identities)

Phase 2 — Shift Lifecycle Core
  └─ Shift Service (post, state machine)
  └─ Notification Service (push + SMS)
  └─ Basic bidding (workers submit bids)
  (Validate the core loop: post → bid → fill)

Phase 3 — GPS & Time Records
  └─ GPS / Clock Service (geofence check-in/out)
  └─ No-show detection
  └─ Shift completion and payout record
  (Required before any real shifts — legal and dispute basis)

Phase 4 — Trust & Reliability Layer
  └─ Two-way ratings
  └─ Reliability score computation
  └─ No-show and abandon penalties
  └─ Backfill cascade
  (Enables the platform to be trusted for critical fill situations)

Phase 5 — AI Matching Engine
  └─ Scoring pipeline (rules-based v1 — weighted formula)
  └─ AI ranking integrated into bid view
  └─ Demand forecasting (batch, uses historical shift data)
  (Requires labelled data from Phases 1-4 to train on)

Phase 6 — Growth & Differentiation
  └─ Revenue correlation model (requires POS integration data)
  └─ Worker public profiles + shareable shift cards
  └─ Embeddable widget
  └─ White-label variant
```

---

## Scaling Considerations

| Scale | Architecture Notes |
|-------|--------------------|
| 0–500 shifts/month | Modular monolith is fine. Single Postgres instance. Redis for pub/sub and caching. No queue needed initially. |
| 500–5k shifts/month | Add job queue (BullMQ or pg-boss) for backfill and notification workers. Cache matching scores in Redis. Read replicas for Postgres if query load spikes. |
| 5k–50k shifts/month | Extract Matching Engine as a separate service (CPU-intensive scoring). Add CDN for profile images and shift cards. Consider read-heavy replicas for AI model serving. |
| 50k+ shifts/month | GPS event stream may need dedicated time-series storage. Revenue correlation model needs data pipeline (not just batch). Split notification delivery by channel (push vs SMS). |

### Scaling Priorities

1. **First bottleneck:** Notification fanout when a popular shift is posted (100+ workers notified simultaneously). Use a job queue with concurrency limits from day one — do not send notifications synchronously.
2. **Second bottleneck:** Matching score computation. Precompute and cache scores per (worker, active shift) pairs in Redis. Invalidate on profile change or new bid.

---

## Anti-Patterns

### Anti-Pattern 1: Synchronous Notification in Request Path

**What people do:** Send push/SMS notifications inside the API handler that accepts a bid or posts a shift.

**Why it's wrong:** One slow SMS API call blocks the user's request. FCM/Twilio latency spikes cause timeouts. Under load, it brings down the API.

**Do this instead:** Emit a job to the notification queue. Return 200 immediately. The queue worker handles delivery with retries.

### Anti-Pattern 2: Mutable Time Records

**What people do:** Store GPS clock-in/clock-out in a normal updatable row so "corrections" can be made.

**Why it's wrong:** Workers and businesses will dispute pay. A mutable record gives either party ammunition to claim tampering.

**Do this instead:** Write time records as immutable append-only events. Any correction is a new "amendment" event with an audit trail, not an update.

### Anti-Pattern 3: GPS-Only No-Show Detection

**What people do:** Rely solely on GPS not pinging to declare a no-show.

**Why it's wrong:** Workers can be present but have GPS disabled, battery dead, or poor signal in basement restaurants. False no-shows destroy worker trust.

**Do this instead:** Multi-signal: GPS attempt + confirmation ping (in-app tap) + optional manager code override. Only penalise after all signals fail and a human can review.

### Anti-Pattern 4: Storing Raw NRIC

**What people do:** Pull NRIC from SingPass/MyInfo and store it in the application database.

**Why it's wrong:** NRIC is sensitive PII regulated under Singapore's PDPA. A database breach becomes a serious compliance incident.

**Do this instead:** Store only a hashed, salted reference and a `verified: true / false` flag with the verification timestamp. The actual NRIC stays in MyInfo.

### Anti-Pattern 5: Flat Reliability Score

**What people do:** Average all ratings and no-shows equally across time.

**Why it's wrong:** A worker who was unreliable 18 months ago and has been perfect for 3 months is penalised unfairly. Also, early scores are based on few data points and are noisy.

**Do this instead:** Decay-weighted reliability score (recent events weighted more heavily). Minimum data threshold before score affects matching (e.g., require 5+ completed shifts before score is used to penalise).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| SingPass / MyInfo v5 | OAuth 2.1 PKCE + DPoP, JWT client auth, server-to-server with X.509 cert | Requires Singpass developer portal registration. Sandbox available. Production approval takes weeks — start early. |
| FCM / APNs | Fire-and-forget via job queue | Use a unified push abstraction (e.g., node-pushnotifications) so iOS/Android are handled uniformly. |
| Twilio SMS | Job queue consumer with retry | Fallback channel when push fails. Rate-limit SMS sends — costs add up fast. |
| Maps / Geocoding | Google Maps Platform or OneMap (Singapore government, free) | OneMap is preferred for Singapore addresses and is free for public sector. For geofence validation, any geocoder works. |
| POS Integration (Phase 6) | Webhook or polling from Square / Lightspeed / Moka | Required for revenue correlation model. Each POS system is different. Plan for a thin adapter pattern. |
| Work Injury Insurance | Offline API or manual batch | No standard Singapore insurer API exists. At MVP, insurance is baked into pricing but tracked manually. Automate later. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Shift Service ↔ Matching Engine | Direct call (sync) at MVP; event-driven when extracted to service | Matching Engine is called to rank bids; it does not initiate — Shift Service calls it. |
| GPS Service ↔ Shift Service | Event-driven (GPS emits shift.checked_in / shift.no_show) | GPS Service should not know Shift business rules. It only reports location events. |
| Bidding Service ↔ Notification Service | Event-driven (bid.received, bid.accepted, bid.rejected) | Notifications are a side-effect, not part of the bid transaction. |
| AI Layer ↔ Matching Engine | Offline batch write of weights/model; Matching Engine reads on startup | AI models are not called inline per request at MVP. They update weights; Matching Engine uses weights. |
| Payment Service ↔ GPS Service | GPS emits shift.completed → Payment Service records payout entitlement | Payment Service should not poll GPS. It reacts to the completion event. |

---

## Sources

- [Indeavor Smart Backfill — auto-replacement system](https://www.indeavor.com/solution/smart-backfill/)
- [Singpass Developer Portal — MyInfo v5](https://developer.singpass.gov.sg/)
- [MyInfo — How It Works (GovTech)](https://www.developer.tech.gov.sg/products/categories/digital-identity/myinfo/how-it-works)
- [Instawork — How it works, GPS and matching](https://canvasbusinessmodel.com/blogs/how-it-works/instawork-how-it-works)
- [Online Bidding System Design — Medium](https://medium.com/@shiva.kutti.kumar/system-design-for-a-online-bidding-system-adf417f39f44)
- [Monolith vs Microservices for startups — DEV Community](https://dev.to/naveens16/monoliths-vs-microservices-why-startups-should-think-twice-before-going-distributed-17p2)
- [Geofencing Time Clock — Hubstaff](https://hubstaff.com/geofence-time-tracking)
- [Scaling a Shift Marketplace — Myshyft](https://www.myshyft.com/blog/scaling-shift-marketplace/)
- [Eightfold AI — talent matching pipeline](https://eightfold.ai/engineering-blog/ai-powered-talent-matching-the-tech-behind-smarter-and-fairer-hiring/)
- [Marketplace Software Architecture Trends 2025 — Ulan Software](https://ulansoftware.com/blog/marketplace-software-architecture-trends-2025)

---

*Architecture research for: ShiftSG — AI-first shift marketplace*
*Researched: 2026-03-19*
