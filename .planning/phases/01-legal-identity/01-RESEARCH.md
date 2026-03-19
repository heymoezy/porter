# Phase 1: Legal & Identity - Research

**Researched:** 2026-03-19
**Domain:** Singapore regulatory compliance, SingPass MyInfo v5, WICA insurance, UEN verification, independent contractor law
**Confidence:** HIGH for SingPass v5 specs and regulatory landscape; MEDIUM for UEN API access, MOM work permit API (no public dev docs found); LOW for per-shift insurance API (no confirmed product exists)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- SingPass MyInfo v5 only — standard OAuth redirect flow (not in-app webview)
- Data pulled: NRIC, full name, date of birth, residential address, nationality, work pass status
- Failed verification blocks signup entirely — no fallback, no manual identity entry
- SingPass is Step 1 — nothing else until identity verified
- Worker onboarding is a 7-step sequential gate: SingPass → profile → industry → F&B cert (conditional) → work permit (foreign workers) → contract → done
- F&B requires FHD2H cert upload + manual review at launch (automated API TBD)
- FHD2H cert expiry tracked — 30-day warning, auto-block on expiry
- Work permit: verify permit exists and is valid via MOM FIN check; restrict shifts to permitted categories
- Full contract text with scrollable view, key terms highlighted, explicit checkbox
- Contract updates require re-acceptance before next shift
- Poaching clause: separate acknowledgment screen, highlighted conversion fee (1 month salary within 6 months)
- Business onboarding: UEN verification → profile → geographic cluster check → poaching clause → payment setup
- Geographic cluster: hard gate — only businesses within active cluster can complete signup
- Businesses outside cluster: waitlist landing page, area recorded, notified on expansion
- First launch cluster: researcher to identify densest F&B + retail cluster (likely Tanjong Pagar, Orchard, or CBD)
- Work injury insurance: mandatory per shift, automatic activation at shift confirmation, baked into markup

### Claude's Discretion

- Exact SingPass sandbox vs production configuration
- Database schema for identity and verification records
- Error handling UX details (retry flows, timeout handling)
- Insurance integration specifics (manual batch vs API — depends on insurer capabilities)
- Mobile-responsive layout for onboarding screens

### Deferred Ideas (OUT OF SCOPE)

- Background checks / police clearance
- Multi-language onboarding (Mandarin, Malay, Tamil)
- Automated FHD2H API verification
- Insurance claims processing workflow (Phase 3)

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Worker identity verification via SingPass MyInfo v5 (NRIC, name, address auto-filled) | MyInfo v5 FAPI 2.0 OAuth 2.1 PKCE + DPoP + JWKS flow documented. MockPass for local testing. v5 is the only viable path — v3/v4 sunset Sep 2026. |
| AUTH-02 | Food hygiene certificate (FHD2H) verification for F&B workers (retail exempt) | FHD2H is a government portal workers log into with SingPass. No public API — manual photo upload at launch is confirmed correct approach. Cert expiry must be tracked in DB. |
| AUTH-03 | Work permit verification for foreign workers via MOM records | MOM has a public web service to check work pass status, but no documented third-party API for programmatic integration. Practical MVP approach: collect FIN + permit number, attempt MOM web portal cross-check, store result. |
| AUTH-04 | Work injury insurance coverage activated per shift, baked into markup | WICA covers platform workers from Jan 2025. ShiftSG as a shift marketplace (not delivery/ride-hail) may not be legally required under Platform Workers Act, but should provide WICA-equivalent insurance voluntarily for risk management. No per-shift API product confirmed — aggregate policy approach at MVP. |
| AUTH-05 | Restaurant/retail onboarding with UEN verification and business profile | ACRA Business Profile API launched Nov 2025 at bizfile.gov.sg/apimarketplace. Access requires formal onboarding. Third-party alternative: Kyckr API for UEN lookup. Free public check available on bizfile.gov.sg for manual verification. |
| AUTH-06 | Lawyer-reviewed worker contracts (independent contractor classification) | ShiftSG falls outside Platform Workers Act (covers ride-hail/delivery only). Independent contractor tests under common law: control, tools, financial risk. Contract must be reviewed before any worker signs up. Poaching clause enforceability requires explicit separate acknowledgment, not just ToS. |

</phase_requirements>

---

## Summary

Phase 1 is the legal and trust foundation for ShiftSG. Every subsequent phase depends on verified identities, compliant businesses, and enforceable contracts being in place before a single shift is posted. This phase has no user-facing features — it is entirely prerequisite infrastructure.

The dominant technical challenge is SingPass MyInfo v5 integration. MyInfo v5 uses FAPI 2.0 — a security profile layering OAuth 2.1, mandatory PKCE, DPoP proof-of-possession, and JWKS-based client authentication. This is meaningfully more complex than a standard OAuth flow. The official Singpass GitHub organization provides a v4 connector library (`myinfo-connector-v4-nodejs`) and the GovTech team publishes a helper (`@govtechsg/singpass-myinfo-oidc-helper`). A v5-specific connector is not yet published as a standalone npm package; the v4 library is the closest ready-made option. The integration MUST be server-side only — a Next.js API route handles all SingPass callbacks and MyInfo person data fetches; the mobile app never touches SingPass credentials directly.

The regulatory picture is clearer than it might appear. ShiftSG is a shift marketplace, not a food delivery or ride-hailing platform. The Platform Workers Act 2025 explicitly covers only ride-hailing and delivery services. ShiftSG's workers are independent contractors in the traditional sense — they set their own rates, choose shifts freely, and work for multiple businesses. This means the mandatory CPF contribution and Platform Workers Act obligations do NOT currently apply. However, WICA-equivalent work injury insurance should be provided voluntarily (and commercially, it is the right product to offer). The independent contractor classification must be reviewed by a Singapore employment lawyer before any worker signs the contract — this is a hard dependency, not optional.

Food hygiene certificate verification at launch is manual: workers upload a photo of their cert, and a human (or a simple admin queue) reviews it. The FHD2H system is a government portal, not a public API. SFA plans to integrate it more deeply with GoBusiness/SingPass over time but no developer API exists today. This is the expected approach for MVP and is not a gap — it is the designed approach per CONTEXT.md.

**Primary recommendation:** Register on the SingPass Developer Portal immediately (2–4 week approval window). Build the MyInfo v5 server-side integration in Next.js using the PAR → PKCE + DPoP → token exchange → person data fetch pattern. Build the Supabase identity schema with verification status fields — never store raw NRIC. Use the ACRA BizFile API (or Kyckr as fallback) for UEN verification. Secure a Singapore employment lawyer for contract review before writing a single line of contract UI.

---

## Standard Stack

### Core (Identity & Compliance Layer)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `myinfo-connector-v4-nodejs` | latest | SingPass MyInfo OAuth flow helper | Official Singpass GitHub library. v4 supports PKCE + DPoP. No standalone v5 npm package yet — use with v5 endpoints from the developer portal docs. |
| `@govtechsg/singpass-myinfo-oidc-helper` | 9.0.1 | OIDC helper for Singpass/MyInfo relying party | GovTech-maintained. Updated 2 months ago (active). Handles JWT client assertion, JWKS setup, OIDC flows. |
| `@opengovsg/mockpass` | latest | Local mock SingPass/MyInfo server for dev | Official OpenGov mock server. Supports SingPass v2/v3, CorpPass v2, MyInfo v3, sgID v2. Run with `npx mockpass`. |
| `jose` | 5.x | JWT signing, JWKS key generation, DPoP proofs | Industry-standard JWT library for Node.js. Used to generate PKCE verifiers, DPoP proofs, and parse MyInfo JWEs. |
| `drizzle-orm` | 0.30+ | Database schema and migrations | Already established in stack research. Use `pgEnum` for verification status columns. |
| `zod` | 3.x | Validate MyInfo person data shape | Shared across mobile + web. Validate the MyInfo JSON payload before writing to Supabase. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `uuid` | 9.x | Generate `state` and `nonce` for OAuth flows | FAPI 2.0 requires cryptographically secure state/nonce ≥30 chars. UUID v4 satisfies this. |
| `@supabase/supabase-js` | v2 | Store verification results, worker profiles | Already in stack. RLS policies gate access to verification records. |
| `@supabase/ssr` | latest | Server-side Supabase client in Next.js API routes | Required for App Router. Replaces auth-helpers-nextjs. |
| `sharp` | 0.33 | Process FHD2H cert photo uploads | Resize and compress cert images before storing in Supabase Storage. |
| `inngest` | v3 | Cert expiry background jobs | Schedule 30-day / 7-day expiry warning jobs. Already in stack. |

### Version Verification

```bash
npm view myinfo-connector-v4-nodejs version
npm view @govtechsg/singpass-myinfo-oidc-helper version
npm view @opengovsg/mockpass version
npm view jose version
```

### Installation

```bash
# In shiftsg-web (Next.js)
npm install myinfo-connector-v4-nodejs @govtechsg/singpass-myinfo-oidc-helper jose uuid

# Dev dependency for local SingPass mock
npm install -D @opengovsg/mockpass

# In shiftsg-mobile (Expo) — no SingPass libs; mobile just opens a URL
# The entire OAuth flow lives in the Next.js API routes
```

---

## Architecture Patterns

### Recommended Project Structure (Identity Service)

```
src/
├── services/
│   └── identity/
│       ├── singpass.ts          # MyInfo v5 OAuth flow (PAR, PKCE, DPoP, token exchange)
│       ├── myinfo-parser.ts     # Parse + validate MyInfo JSON payload with Zod
│       ├── uen-verifier.ts      # ACRA BizFile API or Kyckr lookup
│       ├── work-permit.ts       # MOM work pass status check
│       ├── cert-tracker.ts      # FHD2H cert upload, expiry tracking, auto-block
│       └── contract.ts          # Contract version management, acceptance records
├── api/
│   └── auth/
│       ├── singpass/
│       │   ├── route.ts         # GET: initiate SingPass redirect (PAR → authorize)
│       │   └── callback/
│       │       └── route.ts     # GET: handle redirect_uri callback
│       ├── worker-onboarding/
│       │   └── route.ts         # POST: progress through onboarding steps
│       └── business-onboarding/
│           └── route.ts         # POST: UEN verify, cluster gate, contract
├── db/
│   └── schema/
│       ├── workers.ts           # worker_profiles table
│       ├── businesses.ts        # business_profiles table
│       ├── verifications.ts     # identity_verifications, cert_records tables
│       └── contracts.ts         # contract_versions, contract_acceptances tables
└── integrations/
    └── singpass/
        ├── client.ts            # Configured MyInfo connector instance
        └── jwks.ts              # JWKS key pair generation and hosting endpoint
```

### Pattern 1: MyInfo v5 PAR + PKCE + DPoP Flow

**What:** The FAPI 2.0 authorization flow has two steps before the user sees SingPass. First, push the authorization request to the PAR endpoint to get a `request_uri`. Then redirect the user to the SingPass authorization endpoint with that URI. On callback, exchange the code for tokens using a DPoP-bound access token.

**When to use:** Exclusively. This is the only supported flow for MyInfo v5.

**Key implementation notes:**
- The `request_uri` from PAR expires in 60 seconds — generate it immediately before redirecting, not on page load
- `state` and `nonce` must be ≥30 characters, cryptographically random — use UUID v4
- DPoP binds the authorization code and access token to a key pair held server-side — generate once per session
- JWKS must be hosted at a publicly accessible HTTPS URL — use a Next.js API route `/api/auth/jwks`
- `code_challenge_method` must be `S256` — the only supported method

**Environments:**
- Sandbox/staging: `stg-id.singpass.gov.sg`
- Production: `id.singpass.gov.sg`
- Local dev: MockPass on `localhost:5156`

**Example flow:**

```typescript
// Source: docs.developer.singpass.gov.sg — Authorization Request guide
// src/services/identity/singpass.ts

export async function initiateSingPassAuth(sessionId: string) {
  const { codeVerifier, codeChallenge } = await generatePKCEPair()
  const dpopKeyPair = await generateDpopKeyPair()
  const state = randomUUID() // ≥30 chars — UUID is 36
  const nonce = randomUUID()

  // Step 1: Push Authorization Request
  const parResponse = await fetch(PAR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SINGPASS_CLIENT_ID!,
      scope: 'openid name dob residentialaddress nationality passtype',
      redirect_uri: process.env.SINGPASS_REDIRECT_URI!,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      dpop_jkt: await getDpopJkt(dpopKeyPair),
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: await generateClientAssertion(),
    }),
  })

  const { request_uri } = await parResponse.json()

  // Store session state for callback validation
  await storeOAuthSession(sessionId, { codeVerifier, dpopKeyPair, state, nonce })

  // Step 2: Redirect user to SingPass
  return `${AUTHORIZE_ENDPOINT}?client_id=${CLIENT_ID}&request_uri=${request_uri}`
}
```

### Pattern 2: Never Store Raw NRIC

**What:** After MyInfo returns person data, extract only what is needed and store a verification record — not the raw NRIC.

**When to use:** Universally. PDPA requires this. A DB breach must not expose national identity numbers.

**Example schema (Drizzle):**

```typescript
// Source: PITFALLS.md Anti-Pattern 4 + ARCHITECTURE.md Identity Service boundary
// src/db/schema/verifications.ts

import { pgTable, uuid, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending',
  'verified',
  'failed',
  'expired',
])

export const workerIdentityVerifications = pgTable('worker_identity_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  workerId: uuid('worker_id').notNull(), // FK to worker_profiles
  // NEVER store raw NRIC — store only the hashed reference
  nricHash: text('nric_hash').notNull(), // SHA-256(NRIC + salt) — for dedup only
  singpassVerifiedAt: timestamp('singpass_verified_at'),
  nationality: text('nationality'),        // e.g., "SINGAPOREAN", "PR", "FOREIGNER"
  passType: text('pass_type'),             // e.g., "S_PASS", "EP", "WP", null for citizens
  // All fields below come from MyInfo — truthy means SingPass confirmed them
  nameVerified: boolean('name_verified').default(false),
  dobVerified: boolean('dob_verified').default(false),
  addressVerified: boolean('address_verified').default(false),
  status: verificationStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const foodHygieneCerts = pgTable('food_hygiene_certs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workerId: uuid('worker_id').notNull(),
  certImagePath: text('cert_image_path').notNull(), // Supabase Storage path
  expiryDate: timestamp('expiry_date').notNull(),
  verificationStatus: verificationStatusEnum('verification_status').default('pending').notNull(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: uuid('reviewed_by'),       // admin user who approved/rejected
  autoBlockedAt: timestamp('auto_blocked_at'), // set when cert expires
  createdAt: timestamp('created_at').defaultNow(),
})
```

### Pattern 3: Onboarding State Machine

**What:** Worker onboarding is a 7-step sequential gate. Each step must complete before the next unlocks. Store current step in DB so the user can resume after app kill.

**When to use:** Worker onboarding flow only.

```typescript
// src/db/schema/workers.ts (partial)

export const onboardingStepEnum = pgEnum('onboarding_step', [
  'singpass_pending',      // Step 1: Not yet verified
  'singpass_complete',     // Step 1: SingPass verified
  'profile_complete',      // Step 2: Photo + contact + preferred name set
  'industry_selected',     // Step 3: F&B, retail, or both chosen
  'cert_pending',          // Step 4: F&B selected, cert uploaded, awaiting review
  'cert_verified',         // Step 4: Cert approved (or retail-only, skipped)
  'permit_verified',       // Step 5: Work permit verified (or citizen/PR, skipped)
  'contract_accepted',     // Step 6: IC agreement accepted
  'complete',              // Step 7: Full access — can browse shifts
])
```

### Pattern 4: UEN Verification via ACRA API

**What:** On business onboarding, call ACRA BizFile Business Profile API to confirm the UEN is valid, active, and matches the business name provided. This happens server-side before any shift-posting access is granted.

**Practical approach at launch:** ACRA Business Profile API launched Nov 2025 at `bizfile.gov.sg/apimarketplace`. Registration requires CorpPass and formal onboarding. As fallback if API access is delayed: use the free public `data.gov.sg` ACRA dataset (monthly update) to pre-load a local UEN lookup table. Not real-time but sufficient for MVP.

**Alternative:** Kyckr API — third-party that wraps ACRA. Faster onboarding, paid per-lookup.

```typescript
// src/services/identity/uen-verifier.ts
export async function verifyUEN(uen: string): Promise<UENVerificationResult> {
  // Option A: ACRA BizFile Business Profile API (preferred when onboarded)
  const response = await fetch(
    `${ACRA_API_BASE}/business-profile/${uen}`,
    { headers: { Authorization: `Bearer ${ACRA_API_TOKEN}` } }
  )
  if (!response.ok) return { valid: false, reason: 'uen_not_found' }

  const profile = await response.json()
  return {
    valid: profile.status === 'Active' || profile.status === 'Live',
    entityName: profile.entity_name,
    registrationDate: profile.reg_date,
    businessActivity: profile.primary_ssic_description,
  }
}
```

### Pattern 5: Geographic Cluster Hard Gate

**What:** During business onboarding, check if the business postal code falls within the defined launch cluster. If not, present a waitlist page and store their area for future notification. This check happens at Step 3 (after UEN is verified).

```typescript
// src/services/identity/cluster-gate.ts
const LAUNCH_CLUSTERS: ClusterDefinition[] = [
  {
    name: 'Tanjong Pagar / CBD',
    postalPrefixes: ['01', '02', '03', '04', '05', '06', '07', '08'],
  },
  // Add additional clusters when expanding
]

export function isWithinLaunchCluster(postalCode: string): boolean {
  const prefix = postalCode.substring(0, 2)
  return LAUNCH_CLUSTERS.some(c => c.postalPrefixes.includes(prefix))
}
```

**Note on cluster selection:** CONTEXT.md flags this as needing data-backed decision. Singapore postal codes are two-digit prefixed. Tanjong Pagar / CBD districts use prefixes 01–08. Orchard uses 22–23. Robertson Quay uses 23–24. The planner should include a task to confirm the exact cluster with a restaurant density data source before implementing the gate.

### Anti-Patterns to Avoid

- **Storing NRIC in plaintext:** PDPA violation. A breach becomes a serious compliance incident. Store only `nricHash` and `singpassVerifiedAt`.
- **Integrating MyInfo from the mobile app directly:** Never expose client credentials to the device. All SingPass auth lives in Next.js API routes. The mobile app opens a browser URL and receives results via deep link callback.
- **Using MyInfo v3 or v4 endpoints:** v3 decommissions September 30, 2026. Build only against v5 endpoints from day one.
- **Treating the onboarding state as client-only state:** If the user closes the app mid-onboarding, the step must be resumable. Store `onboarding_step` in Supabase worker profile — not in device storage.
- **Skipping the poaching clause acknowledgment in ToS:** Not enforceable. Requires an explicit separate checkbox screen for the restaurant, not a buried clause.
- **Self-reporting food hygiene certs:** Any checkbox-only approach is an SFA compliance liability. Cert photo upload + manual review is the minimum viable verification approach.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth 2.1 PKCE + DPoP flow | Custom auth state machine | `myinfo-connector-v4-nodejs` + `jose` | DPoP is subtle — key binding, nonce handling, replay prevention are all footguns |
| JWT client assertion signing | Manual JWT construction | `jose` `SignJWT` | FAPI 2.0 requires specific `alg`, `aud`, `exp`, `jti` claims — easy to get wrong |
| JWKS key pair hosting | Custom key store | `jose` `exportJWK` + a Next.js API route | JWKS must be HTTPS, return correct content-type, be publicly accessible — not a 5-minute task |
| Local SingPass testing | Test with real SingPass each time | `@opengovsg/mockpass` | MockPass simulates the full flow locally without hitting government servers |
| UEN lookup | Scraping BizFile website | ACRA BizFile API or Kyckr | Scraping is fragile and violates ToS; official API available since Nov 2025 |
| Cert expiry notifications | Cron job checking every row | Inngest scheduled functions | Durable, observable, retryable — cron jobs silently fail |

**Key insight:** SingPass MyInfo v5 (FAPI 2.0) is the most complex OAuth flow in the Singapore ecosystem. The PAR + PKCE + DPoP + JWKS combination has multiple correctness requirements that must all be satisfied simultaneously. Use the official connector library as the base and build on top of it — do not implement the protocol from scratch.

---

## Common Pitfalls

### Pitfall 1: MyInfo v3/v4 Endpoint Confusion

**What goes wrong:** Developer finds sample code online using `/com/v3/` or `/com/v4/` endpoint paths and builds against them. v3 decommissions September 30, 2026 — shortly after a mid-2026 launch, the integration breaks.

**Why it happens:** v3/v4 have more community sample code. v5 docs are on the Singpass Developer Portal and less indexed by Google.

**How to avoid:** Audit every API URL before integration. v5 uses the new `id.singpass.gov.sg` authorization endpoint with PAR. Any code using `/com/v3/` or `/com/v4/` in the path is wrong.

**Warning signs:** Endpoint URLs contain `/com/v3/` or `/com/v4/`. Code parses access token contents directly (forbidden in v5). Code uses X.509 certificates instead of JWKS.

### Pitfall 2: SingPass Production Approval Delay

**What goes wrong:** The team starts building the MyInfo integration, completes it, then realizes production approval takes 2–4 weeks. The launch timeline slips because production keys aren't available.

**Why it happens:** Developers treat "sandbox works" as "done." Production onboarding is a separate process with manual review.

**How to avoid:** Register on the Singpass Developer Portal (`developer.singpass.gov.sg`) on Day 1 of Phase 1. Use sandbox while the application is processed. The sandbox (`stg-id.singpass.gov.sg`) and MockPass (local) are fully usable during development.

**Warning signs:** Team has not registered on the developer portal by end of Week 1.

### Pitfall 3: Platform Workers Act Misclassification Risk

**What goes wrong:** ShiftSG builds control mechanisms (minimum acceptance rates, fixed pricing tiers, mandatory availability windows) that erode the independent contractor classification. MOM could reclassify workers or a future expansion of the Platform Workers Act could bring ShiftSG in scope.

**Why it happens:** Product decisions are made without understanding the legal tests for independent contractor status. The platform gradually accumulates control mechanisms that look like employment.

**How to avoid:** Engage a Singapore employment lawyer before any worker signs a contract. Workers must: set their own rates (reverse bidding satisfies this), choose which shifts to accept freely, work for multiple businesses. Do NOT build: minimum acceptance rate requirements, penalties for declining shifts, or mandatory availability windows.

**Note:** ShiftSG is currently outside the Platform Workers Act scope (ride-hail and delivery only). This could change if the Act expands.

### Pitfall 4: Poaching Clause Unenforceability

**What goes wrong:** The conversion fee clause is buried in ToS with a blanket "I agree" checkbox. When a restaurant hires a worker directly, ShiftSG has no legal recourse because a standard ToS acceptance is weaker than explicit line-item acknowledgment under Singapore contract law.

**Why it happens:** Legal requirements for specific clause enforceability are not well-known among non-legal founders.

**How to avoid:** Present the poaching/conversion fee clause as a SEPARATE screen during restaurant onboarding with its own explicit checkbox. Define the calculation unambiguously: "1 month salary = (agreed hourly rate × 160 hours)." Get this exact language reviewed by a lawyer before any restaurant signs up.

### Pitfall 5: FHD2H Cert Expiry Silent Failure

**What goes wrong:** A worker's food hygiene cert expires. They continue to appear in F&B shift matches. A restaurant books them. An SFA inspection finds an unqualified food handler. ShiftSG is cited as the placement platform.

**Why it happens:** Expiry is stored but no background process enforces the block. Or expiry dates are not validated at shift match time.

**How to avoid:** Two-layer defense: (1) Inngest scheduled job runs daily, finds certs expiring in 30 days and 7 days, sends push notifications. On expiry date, updates `cert_status` to `expired`. (2) The shift matching query includes a filter: `cert_status = 'verified' AND expiry_date > NOW()`. Workers with expired certs never appear in F&B shift results.

### Pitfall 6: WICA Insurance with No Activation Mechanism

**What goes wrong:** Insurance is "baked into markup" as a concept but never actually activated per shift. In the event of a workplace injury, the platform has no insurance to claim and faces direct liability.

**Why it happens:** "We'll figure out insurance later" — it gets treated as a business development task, not a technical task.

**How to avoid:** At MVP, the approach is an aggregate policy with a Singapore insurer (NTUC Income, Chubb, AXA, or Sompo — all offer WICA). The policy covers all workers active on the platform. Activation is not per-shift via API (no such product exists); instead, the shift record stores `insurance_covered: true` for all confirmed shifts. The aggregate policy is renewed periodically. Track shift volume for premium calculation. Do not launch without a signed insurance agreement.

---

## Code Examples

### MyInfo v5 — Initialize Client (using v4 connector with v5 endpoints)

```typescript
// Source: github.com/singpass/myinfo-connector-v4-nodejs
// src/integrations/singpass/client.ts

import MyInfoConnector from 'myinfo-connector-v4-nodejs'

export const myInfoClient = new MyInfoConnector({
  CLIENT_ID: process.env.SINGPASS_CLIENT_ID!,
  REDIRECT_URL: process.env.SINGPASS_REDIRECT_URI!,
  SCOPE: 'openid name dob residentialaddress nationality passtype workpassstatus',
  AUTHORIZE_JWKS_URL: process.env.SINGPASS_JWKS_URL!, // Your hosted JWKS endpoint
  MYINFO_JWKS_URL: process.env.SINGPASS_MYINFO_JWKS_URL!, // SingPass public JWKS
  TOKEN_URL: process.env.SINGPASS_TOKEN_URL!,   // v5 token endpoint
  PERSON_URL: process.env.SINGPASS_PERSON_URL!, // v5 person endpoint
  ENVIRONMENT: process.env.NODE_ENV === 'production' ? 'PROD' : 'TEST',
})
```

### Drizzle + pgEnum — Verification Status Column

```typescript
// Source: medium.com/@lior_amsalem/enum-with-typescript-zod-and-drizzle-orm
// src/db/schema/verifications.ts

import { pgTable, pgEnum, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending', 'verified', 'failed', 'expired'
])

export const onboardingStepEnum = pgEnum('onboarding_step', [
  'singpass_pending', 'singpass_complete', 'profile_complete',
  'industry_selected', 'cert_pending', 'cert_verified',
  'permit_verified', 'contract_accepted', 'complete'
])
```

### RLS Policy — Workers see only their own verification records

```sql
-- Source: supabase.com/docs/guides/database/postgres/row-level-security
-- Run via Supabase SQL editor or Drizzle migration

ALTER TABLE worker_identity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers read own verification"
  ON worker_identity_verifications
  FOR SELECT
  USING (worker_id = auth.uid());

CREATE POLICY "Service role can write verifications"
  ON worker_identity_verifications
  FOR ALL
  USING (auth.role() = 'service_role');
```

### Inngest — Cert Expiry Warning Job

```typescript
// Source: inngest.com/docs/guides/background-jobs
// src/workers/cert-expiry-check.ts

import { inngest } from '@/inngest/client'

export const certExpiryCheck = inngest.createFunction(
  { id: 'cert-expiry-check' },
  { cron: '0 9 * * *' }, // 9am SGT daily
  async ({ step }) => {
    const expiring30 = await step.run('find-certs-expiring-30d', async () => {
      return db.query.foodHygieneCerts.findMany({
        where: and(
          eq(foodHygieneCerts.verificationStatus, 'verified'),
          lte(foodHygieneCerts.expiryDate, addDays(new Date(), 30)),
          gte(foodHygieneCerts.expiryDate, addDays(new Date(), 1)),
        ),
      })
    })

    await step.run('notify-expiring-workers', async () => {
      for (const cert of expiring30) {
        await sendPushNotification(cert.workerId, 'cert_expiry_warning', {
          daysLeft: differenceInDays(cert.expiryDate, new Date()),
        })
      }
    })
  }
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MyInfo v3 OAuth with X.509 certs | MyInfo v5 FAPI 2.0 with JWKS + PKCE + DPoP + PAR | Finalized FAPI 2.0 specs released Oct 2025 | Significantly more complex auth flow; v3 sunsets Sep 2026 |
| Manual ACRA BizFile website lookup | ACRA Business Profile API | Launched Nov 2025 | Programmatic UEN verification now possible without screen-scraping |
| WICA for employees only | WICA-equivalent mandatory for platform delivery/ride-hail workers | Jan 2025 | Platform Workers Act introduces new insurance category; shift marketplace still outside scope |
| MyInfo v4 connector library | v4 library is latest official npm; v5-specific library not yet published | Mar 2026 | v4 connector can be used with v5 endpoints — verify endpoint URLs from developer portal |

**Deprecated/outdated:**
- MyInfo v3 endpoints: `/com/v3/` — sunset September 30, 2026
- MyInfo v4 endpoints: `/com/v4/` — same sunset deadline as v3
- X.509 certificates for MyInfo client auth: replaced by JWKS in v5
- `myinfo-connector-nodejs` (original, v3 only): do not use; use `myinfo-connector-v4-nodejs`

---

## Open Questions

1. **Which Singapore insurer will provide per-shift WICA aggregate coverage?**
   - What we know: NTUC Income, Chubb, AXA, Sompo all offer WICA insurance. Platform Workers Act mandates it for delivery/ride-hail.
   - What's unclear: Which insurer offers aggregate coverage suitable for a shift marketplace? What's the premium structure? Is there any API to report shift completions for accurate premiums?
   - Recommendation: Commercial/business development task — contact NTUC Income first (most accessible for new entities). Target resolution before Phase 1 tasks begin.

2. **MOM work permit verification API — does one exist for third-party platforms?**
   - What we know: MOM has a public web service for work pass status checks at `service2.mom.gov.sg/workpass/enquiry`. No documented third-party developer API found.
   - What's unclear: Whether MOM offers an API for platforms to verify FIN + permit number programmatically. The web service accepts public queries.
   - Recommendation: At MVP, collect FIN and permit number from worker, display MOM's own check page in a webview or ask worker to self-verify. Track verification status manually. Follow up with MOM GovTech for API access — may require application similar to SingPass developer onboarding.
   - Confidence: LOW — this needs direct investigation with MOM.

3. **Exact launch cluster postal codes**
   - What we know: Candidates are Tanjong Pagar (01–08), Orchard (22–23), Robertson Quay (23–24).
   - What's unclear: Which cluster has the densest F&B + retail establishment concentration suitable for a hyperlocal launch.
   - Recommendation: Founders should validate with SFA licensed food establishment data (publicly available on data.gov.sg) or Grab/Deliveroo heatmaps before hardcoding cluster postal prefixes.
   - Confidence: LOW — this is a business decision requiring data validation.

4. **ACRA BizFile API onboarding timeline and cost**
   - What we know: API launched Nov 2025, requires CorpPass onboarding, bizfile.gov.sg/apimarketplace.
   - What's unclear: Exact cost per lookup, onboarding timeline, whether a Singapore-registered company is required (ShiftSG must be incorporated before applying).
   - Recommendation: Start API access application immediately after company incorporation. Kyckr as paid alternative if ACRA onboarding is slow.

---

## Validation Architecture

`nyquist_validation: true` in `.planning/config.json` — this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest v2 (unit) + Playwright v1.4x (E2E) |
| Config file | `vitest.config.ts` — does not exist yet (Wave 0 gap) |
| Quick run command | `npx vitest run --reporter=verbose src/services/identity/` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | MyInfo v5 OAuth state machine: PAR → callback → token exchange → person data extraction | Unit | `npx vitest run src/services/identity/singpass.test.ts` | ❌ Wave 0 |
| AUTH-01 | NRIC never stored in plain text — only hash in DB | Unit | `npx vitest run src/db/schema/verifications.test.ts` | ❌ Wave 0 |
| AUTH-01 | Full SingPass redirect → callback → onboarding_step update | E2E (MockPass) | `npx playwright test tests/auth/singpass-flow.spec.ts` | ❌ Wave 0 |
| AUTH-02 | FHD2H cert upload saves to Supabase Storage + creates cert record | Unit | `npx vitest run src/services/identity/cert-tracker.test.ts` | ❌ Wave 0 |
| AUTH-02 | Worker with expired cert excluded from F&B shift matches | Unit | `npx vitest run src/services/identity/cert-expiry.test.ts` | ❌ Wave 0 |
| AUTH-02 | Inngest cert expiry job sends notification at 30-day and 7-day marks | Unit | `npx vitest run src/workers/cert-expiry-check.test.ts` | ❌ Wave 0 |
| AUTH-03 | Work permit field validation (FIN format) | Unit | `npx vitest run src/services/identity/work-permit.test.ts` | ❌ Wave 0 |
| AUTH-04 | Shift confirmation sets `insurance_covered: true` | Unit | `npx vitest run src/services/identity/insurance.test.ts` | ❌ Wave 0 |
| AUTH-05 | UEN verifier returns valid/invalid based on ACRA API mock | Unit | `npx vitest run src/services/identity/uen-verifier.test.ts` | ❌ Wave 0 |
| AUTH-05 | Business outside launch cluster blocked at onboarding | Unit | `npx vitest run src/services/identity/cluster-gate.test.ts` | ❌ Wave 0 |
| AUTH-05 | Full business onboarding flow: UEN → cluster → contract | E2E | `npx playwright test tests/auth/business-onboarding.spec.ts` | ❌ Wave 0 |
| AUTH-06 | Contract acceptance writes record with version + timestamp | Unit | `npx vitest run src/services/identity/contract.test.ts` | ❌ Wave 0 |
| AUTH-06 | Poaching clause checkbox must be separately checked | E2E | `npx playwright test tests/auth/poaching-clause.spec.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/services/identity/ --reporter=verbose`
- **Per wave merge:** `npx vitest run && npx playwright test --project=auth`
- **Phase gate:** Full Vitest + Playwright suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — configure Vitest for the Next.js project: `npm install -D vitest @vitest/coverage-v8`
- [ ] `tests/auth/singpass-flow.spec.ts` — E2E test using MockPass: `npm install -D @opengovsg/mockpass`
- [ ] `tests/auth/business-onboarding.spec.ts` — business onboarding E2E
- [ ] `tests/auth/poaching-clause.spec.ts` — explicit poaching acknowledgment UI test
- [ ] `src/services/identity/singpass.test.ts` — unit tests for OAuth state machine
- [ ] `src/services/identity/cert-tracker.test.ts` — cert upload and expiry
- [ ] `src/services/identity/uen-verifier.test.ts` — UEN verification with mocked ACRA API
- [ ] `src/services/identity/cluster-gate.test.ts` — postal code cluster gate
- [ ] `src/services/identity/contract.test.ts` — contract acceptance recording
- [ ] `src/db/schema/verifications.test.ts` — schema shape and NRIC non-storage assertion
- [ ] MockPass setup script for local dev environment

---

## Sources

### Primary (HIGH confidence)

- [Singpass Developer Portal — MyInfo v5 Authorization Request](https://docs.developer.singpass.gov.sg/docs/technical-specifications/integration-guide/1.-authorization-request) — PAR, PKCE S256, DPoP, state/nonce requirements, 60s request_uri expiry
- [Singpass Developer Portal — Client JWK Requirements](https://docs.developer.singpass.gov.sg/docs/technical-specifications/singpass-authentication-api/2.-token-endpoint/client-jwk-requirements) — JWKS over HTTPS requirement, signing + encryption keys
- [Singpass Partner Support — MyInfo v3 Decommission Notice](https://partnersupport.singpass.gov.sg/hc/en-sg/articles/46944126585753) — September 30, 2026 sunset confirmed
- [Singpass Partner Support — FAPI 2.0 Specs Finalized](https://partnersupport.singpass.gov.sg/hc/en-sg/articles/51191816306841) — October 2025 finalization confirmed
- [GitHub — singpass/myinfo-connector-v4-nodejs](https://github.com/singpass/myinfo-connector-v4-nodejs) — Official v4 connector (closest to v5, use with v5 endpoints)
- [GitHub — opengovsg/mockpass](https://github.com/opengovsg/mockpass) — Local SingPass mock, `npx mockpass` confirmed
- [MOM — Platform Workers Act: What It Covers](https://www.mom.gov.sg/employment-practices/platform-workers-act/what-it-covers) — ride-hail and delivery only; shift marketplace excluded
- [Singapore Legal Advice — Platform Workers Act FAQs](https://singaporelegaladvice.com/law-articles/singapore-laws-platform-workers/) — confirmed: F&B shift marketplace not covered
- [MOM — WICA for Platform Workers](https://www.mom.gov.sg/employment-practices/platform-workers-act/work-injury-compensation-for-platform-workers) — insurance obligations for platform operators (delivery/ride-hail scope)
- [SFA — FHD2Hub Overview](https://www.sfa.gov.sg/food-for-thought/article/detail/fhd2hub-advancing-food-safety-compliance-through-digital-innovation) — FHD2H is a government portal, not a public API; launched April 2023
- [Supabase Docs — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS policy pattern for verification records
- [ACRA News — Business Profile API Nov 2025](https://beta.acra.gov.sg/news-events/news-announcements/905/) — API launch confirmed; bizfile.gov.sg/apimarketplace

### Secondary (MEDIUM confidence)

- [Kyckr — ACRA Guide 2025](https://www.kyckr.com/blog/singapore-corporate-register-acra-guide) — ACRA API Marketplace confirmed, third-party option described
- [npm — @govtechsg/singpass-myinfo-oidc-helper v9.0.1](https://www.npmjs.com/package/@govtechsg/singpass-myinfo-oidc-helper/v/5.2.0) — GovTech helper, updated 2 months ago
- [NTUC — Platform Worker WIC Guide](https://www.ntuc.org.sg/uportal/news/Work-Injury-Compensation-for-Platform-Workers-Complete-Guide-to-Singapores-New-Protection-System/) — coverage amounts, insurer list not specified
- [Mavenside — WICA Changes Nov 2025](https://www.mavenside.co/blog/wica-changes-november-2025-raise-cover-update-incident-playbook) — updated compensation limits ($53K medical, $91-269K fatality)
- [QuickHR — Platform Workers Act Guide](https://quickhr.co/resources/blog/platform-workers-act) — independent contractor classification tests

### Tertiary (LOW confidence — mark for validation)

- MOM work permit verification API: No documented third-party API found. MOM web service exists publicly but no developer API spec confirmed. Needs direct investigation.
- Per-shift insurance API products: No confirmed product from NTUC Income, Chubb, Sompo, or AXA for per-shift micro-coverage via API. Aggregate policy is the only confirmed approach.
- ACRA BizFile API cost and onboarding timeline: JavaScript-gated page prevented direct inspection. Needs CorpPass access to view.

---

## Metadata

**Confidence breakdown:**

- SingPass MyInfo v5 flow: HIGH — official docs, finalized FAPI 2.0 specs, official GitHub connector
- Regulatory classification (Platform Workers Act): HIGH — official MOM + legal analysis confirm shift marketplace excluded
- FHD2H verification: HIGH — confirmed manual upload approach, no public API
- UEN verification (ACRA): MEDIUM — API confirmed launched Nov 2025, access details unclear without CorpPass
- MOM work permit API: LOW — no documented third-party API found; needs direct MOM engagement
- WICA insurance API: LOW — no per-shift API product confirmed; aggregate policy approach inferred

**Research date:** 2026-03-19
**Valid until:** 2026-07-01 (SingPass FAPI 2.0 specs finalized Oct 2025; stable for ~6 months. WICA amounts and Platform Workers Act scope may update.)
