# Phase 1: Legal & Identity - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Every worker and business (F&B or retail) on the platform is legally verified, contractually protected, and compliant before any shift is posted. This phase covers SingPass MyInfo v5 integration, food hygiene cert verification (conditional on F&B), work permit checks, work injury insurance setup, restaurant/retail onboarding with UEN, and independent contractor agreements. No marketplace features — purely identity, compliance, and legal foundation.

</domain>

<decisions>
## Implementation Decisions

### SingPass MyInfo v5 Integration
- Standard OAuth redirect flow to SingPass website (not in-app webview) — most reliable, no platform-specific issues
- Data pulled from MyInfo: NRIC, full name, date of birth, residential address, nationality, work pass status
- Failed verification blocks signup entirely — clear error message with retry option. Cannot accept unverified workers.
- SingPass is the FIRST step in onboarding. Nothing else until identity is verified.

### Worker Onboarding Flow
- Step 1: SingPass MyInfo verification (identity gate)
- Step 2: Profile details (photo, contact, preferred name)
- Step 3: Industry selection (F&B, retail, or both)
- Step 4: If F&B selected → food hygiene cert upload (FHD2H)
- Step 5: If foreign worker → work permit details auto-verified
- Step 6: Independent contractor agreement acceptance
- Step 7: Onboarding complete → can browse shifts

### Certification Verification Model
- Workers select all industries they want to work in. F&B requires FHD2H cert. Retail does not.
- Workers who select both can do retail shifts immediately, F&B shifts only after cert is verified
- FHD2H verification at launch: upload cert photo + manual review. Automated API check when SFA API becomes available.
- Cert expiry tracked. Warning notification 30 days before expiry. Auto-block from F&B shifts on expiry.
- Work permit verification: verify permit exists and is valid via MOM FIN check. Restrict shift types to permitted categories.

### Contract Acceptance Flow
- Full contract text displayed in scrollable view with key terms highlighted (especially: independent contractor classification, conversion fee clause, insurance coverage, dispute resolution)
- Explicit checkbox "I have read and agree to the terms" — cannot proceed without acceptance
- Contract updates: worker notified of changes, must re-accept before their next shift
- Poaching clause for restaurants: separate acknowledgment screen, highlighted conversion fee (1 month salary within 6 months), explicit checkbox — must be unambiguous for enforceability

### Business Onboarding Flow
- Step 1: UEN (Unique Entity Number) verification
- Step 2: Business profile (name, industry: F&B/retail, location, contact)
- Step 3: Geographic cluster check — must be within active launch cluster
- Step 4: Poaching protection clause acknowledgment (separate screen)
- Step 5: Payment setup (for paying shift workers)
- Step 6: Onboarding complete → can post shifts

### Geographic Cluster Gating
- Hard gate on business onboarding — only businesses within the active launch cluster can complete signup
- Workers can live anywhere, but available shifts only appear within the active cluster
- Businesses outside the cluster see a landing page with waitlist signup. Their area is recorded. Notified when cluster expands to them.
- First launch cluster: researcher should identify the densest F&B + retail cluster in Singapore (likely Tanjong Pagar, Orchard, or CBD area — needs data)

### Work Injury Insurance
- Mandatory on every shift — baked into the platform markup, not a separate line item
- Activation is automatic at shift confirmation, deactivation at shift completion
- Insurance partner selection: researcher should investigate Singapore insurers offering per-shift micro-coverage (NTUC Income, Sompo, AXA)
- WICA (Work Injury Compensation Act) compliance required

### Claude's Discretion
- Exact SingPass sandbox vs production configuration
- Database schema for identity and verification records
- Error handling UX details (retry flows, timeout handling)
- Insurance integration specifics (manual batch vs API — depends on insurer capabilities)
- Mobile-responsive layout for onboarding screens

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SingPass MyInfo
- SingPass Developer Portal (developer.singpass.gov.sg) — MyInfo v5 with FAPI 2.0, OAuth 2.1 PKCE + DPoP + X.509. v3 sunsets September 2026.
- `.planning/research/STACK.md` — SingPass integration details, approval timeline (2-4 weeks)
- `.planning/research/PITFALLS.md` — MyInfo v5 migration risks, sunset deadline

### Regulatory Compliance
- `.planning/research/PITFALLS.md` — Platform Workers Act 2025, worker classification risks, FHD2H verification requirements
- `.planning/research/FEATURES.md` — Compliance features analysis, SG regulatory requirements
- `.planning/research/ARCHITECTURE.md` — Identity service architecture, verification flow

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-06 requirements
- `.planning/ROADMAP.md` — Phase 1 success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a greenfield project — no existing code to reuse
- Expo + React Native recommended by stack research for mobile
- Supabase + Next.js recommended for backend

### Established Patterns
- No established patterns yet — this is Phase 1
- Stack research recommends: Supabase Auth for session management, RLS for multi-tenant data isolation

### Integration Points
- SingPass MyInfo v5 API (external — requires production registration)
- MOM work permit verification (external — needs API research)
- SFA FHD2H (external — manual at launch, API TBD)
- Insurance provider (external — needs commercial research)

</code_context>

<specifics>
## Specific Ideas

- SingPass is the single gate — no manual identity entry allowed. If SingPass is down, onboarding is blocked (acceptable tradeoff for security).
- The conversion fee clause must be legally enforceable — lawyer review is a hard dependency before launch.
- Insurance must be invisible to the worker — they shouldn't need to think about it or opt in. It just exists on every shift.
- Geographic cluster is a business decision, not a technical limitation — the platform CAN serve anywhere, but CHOOSES to focus.

</specifics>

<deferred>
## Deferred Ideas

- Background checks / police clearance — future add-on, not v1
- Multi-language onboarding (Mandarin, Malay, Tamil) — important for Singapore but not Phase 1
- Automated FHD2H API verification — depends on SFA API availability
- Insurance claims processing workflow — Phase 3 (Shift Lifecycle) handles injury protocol

</deferred>

---

*Phase: 01-legal-identity*
*Context gathered: 2026-03-19*
