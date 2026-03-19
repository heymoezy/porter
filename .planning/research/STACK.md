# Stack Research

**Domain:** AI-first two-sided shift marketplace (F&B / retail, Singapore)
**Researched:** 2026-03-19
**Confidence:** HIGH for core framework choices; MEDIUM for AI/ML tooling (ecosystem is moving fast)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Expo + React Native** | SDK 52 (latest) | Mobile apps (worker + business) | Single codebase for iOS and Android. EAS Build handles App Store / Play Store distribution. Expo Router v4 gives file-based routing. NativeWind v4 brings Tailwind styling to native. GPS, push notifications, background location all available via Expo SDK. Production-ready in 2026. |
| **Next.js** | 15 (App Router) | Web admin panel + business web portal | SSR for SEO on public-facing pages (business landing, worker profiles). API Routes replace a separate Express server. App Router + Server Actions reduce client/server boilerplate. Vercel deploy is zero-config. |
| **Supabase** | hosted (latest) | Database, auth, realtime, storage | PostgreSQL as the primary store (relational data model fits shifts, bids, ratings well). Row-Level Security means auth is in the DB, not duplicated in app code. Supabase Realtime via Elixir Phoenix WebSockets handles bid feed and shift status updates. pgvector extension available for AI matching embeddings. Auth supports OTP and magic links (no password required for workers — reduces friction). Open source, self-hostable if needed. |
| **PostgreSQL + pgvector** | 15+ (via Supabase) | Primary data store + vector similarity for AI matching | pgvector stores worker skill embeddings alongside relational data — no separate vector DB needed at MVP scale. Hybrid queries (filter by location, then rank by embedding distance) are a single SQL call. |
| **Upstash Redis** | serverless (latest) | Rate limiting, caching, job coordination | HTTP-based Redis — works from Supabase Edge Functions and Next.js API routes without a persistent connection. Free tier is 500K commands/month. Used for: bid broadcast caching, matching score cache, session data, rate limiting on SingPass callbacks. |
| **Inngest** | v3 (latest) | Background jobs and durable workflows | No Redis infra to manage. Durable step-functions survive failures — critical for backfill cascade (multi-step, time-sensitive). Runs as HTTP functions inside Next.js on Vercel. Automatic retries, observable from dashboard. Better fit than BullMQ for a serverless-first deployment. Self-host if cost becomes issue (Trigger.dev as fallback). |
| **Stripe Connect** | latest | Marketplace payments and worker payouts | Only production-grade marketplace payment solution with full Singapore support. Connect handles the two-sided payout model: business pays platform, platform pays workers, platform retains markup. Supports PayNow and GrabPay for Singapore. |
| **OneSignal** | latest | Push notifications (mobile) | Wraps FCM (Android) and APNs (iOS) with a unified SDK. Has an Expo config plugin. Free tier: 10K monthly active users — sufficient for MVP. More reliable than direct FCM (OneSignal insulates against FCM API instability). Supports in-app messages for bid confirmations. |
| **Resend** | latest | Transactional email | Developer-first email API. React Email for templates. Free tier: 3,000 emails/month. Used for: booking confirmations, payout summaries, business invoices. Not the primary notification channel — push and SMS dominate — but required for receipts. |
| **Twilio** | latest | SMS fallback | Push fails when worker's app is uninstalled or notifications are disabled. SMS is the fallback for: backfill broadcasts, check-in reminders, no-show alerts. Pay-per-message — keep volume low by only using after push fails. |

---

### Mobile App — Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **NativeWind** | v4 | Tailwind CSS styling for React Native | All styling. Industry standard in 2026. Zero-runtime (compiles to StyleSheet.create at build time). Works with Expo Router. |
| **Expo Location** | SDK 52 | GPS coordinates + background tracking | GPS clock-in/clock-out, ETA tracking when shift is active. Requires background location permission (foreground must be granted first). |
| **Expo Task Manager** | SDK 52 | Background GPS tasks | Keep GPS polling alive when app is backgrounded during an active shift. Pair with expo-location. |
| **react-native-maps** | 1.x | Map display | Show venue location on shift detail screen. Worker proximity indicator. Use Google Maps (iOS + Android consistent). |
| **Expo Notifications** | SDK 52 | Push notification token registration | Register device token with OneSignal. Handle notification tap routing. |
| **@tanstack/react-query** | v5 | Server state management | All API calls and caching. Works with Supabase client. Handles loading/error/success states. No Redux needed. |
| **react-hook-form + zod** | latest | Form validation | Worker profile setup, shift posting, bid submission. Zod schemas shared with backend. |
| **@supabase/supabase-js** | v2 | Supabase client | Database queries, auth, realtime subscriptions, storage uploads. |
| **date-fns** | v3 | Date/time utilities | Shift time display, duration calculation, bid window expiry. Lighter than moment.js. |

---

### Web (Admin + Business Portal) — Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Tailwind CSS** | v4 | Styling | Shared utility-first approach with mobile (NativeWind). |
| **shadcn/ui** | latest | Component primitives | Business portal forms, data tables, dialogs. Unstyled + accessible + Tailwind-compatible. Do not use for mobile. |
| **@tanstack/react-query** | v5 | Server state | Same as mobile — consistent pattern across web and mobile. |
| **@tanstack/react-table** | v8 | Data tables | Worker roster management, shift history, payout records for admin panel. |
| **recharts** | v2 | Charts | Admin analytics: fill rates, revenue correlation, demand forecasts. Lightweight. |
| **react-hook-form + zod** | latest | Form validation | Same Zod schemas as mobile — no duplication. |
| **tRPC** | v11 | Internal API type safety | Use for Admin panel to backend communication where both are TypeScript. Not for the mobile app (REST is simpler there). Not for public APIs (SingPass callbacks, webhooks). |

---

### AI / Matching Layer

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **OpenAI text-embedding-3-small** | API (latest) | Worker skill and shift requirement embeddings | Generate 1536-dim embeddings for worker profiles (skills, past roles, certifications) and shift requirements. Store in pgvector. Cost: $0.02/1M tokens — very cheap. Run on profile creation/update, not per request. |
| **pgvector** | 0.7+ (via Supabase) | Vector similarity search in Postgres | `<=>` cosine distance operator for skill matching queries. No separate vector DB needed at MVP. Combine with SQL filters (location, availability, reliability score). |
| **Supabase Edge Functions** | Deno 2.1 | AI inference + scoring pipeline | Run matching score computation close to the Supabase DB to minimise latency. Call OpenAI embeddings API, query pgvector, return ranked candidate list. |

---

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vercel** | latest | Next.js hosting + Inngest function runtime | Zero-config Next.js deployment. Inngest runs on Vercel serverless functions. Auto-scaling. Edge network. Hobby tier is free; Pro is $20/mo. Predictable cost at MVP scale. |
| **Supabase Cloud** | hosted | DB + Auth + Realtime + Storage | Free tier: 500MB DB, 1GB storage, 50k monthly active users. Sufficient for MVP. Upgrade to Pro ($25/mo) when approaching limits. |
| **Upstash Redis** | serverless | Caching + rate limiting | Free tier: 500K commands/month. HTTP-based — no connection pooling issues on serverless. |
| **Cloudflare Images** | latest | Profile photos + shift completion cards | Cheap ($5/mo for up to 100K images). On-the-fly resizing for different display contexts. Alternative: Supabase Storage (included in plan). |

---

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **TypeScript** | 5.x | Type safety across full stack | Strict mode. Shared types package between mobile and web. Zod schemas as the source of truth. |
| **Drizzle ORM** | 0.30+ | SQL query builder + migrations | Type-safe SQL without the overhead of Prisma. Works well with Supabase direct connection. Generates SQL migrations. Better than Prisma for complex joins (shift + bid + worker + score). |
| **ESLint + Prettier** | latest | Code style | Consistent formatting. Use @expo/eslint-config for mobile, next ESLint config for web. |
| **Vitest** | v2 | Unit testing | Fast. Works for both Next.js and shared service logic. |
| **Playwright** | v1.4x | E2E testing | Business portal critical flows: post shift, review bids, accept bid. |
| **EAS (Expo Application Services)** | latest | Mobile CI/CD | EAS Build for App Store / Play Store binaries. EAS Update for OTA JS updates (no store review for non-native changes). |

---

## Installation

```bash
# Mobile app (Expo)
npx create-expo-app@latest shiftsg-mobile --template expo-template-blank-typescript
cd shiftsg-mobile
npx expo install expo-location expo-task-manager expo-notifications
npm install nativewind@^4 tailwindcss
npm install @supabase/supabase-js @tanstack/react-query
npm install react-hook-form zod @hookform/resolvers
npm install react-native-maps date-fns

# Web (Next.js)
npx create-next-app@latest shiftsg-web --typescript --tailwind --app
cd shiftsg-web
npm install @supabase/supabase-js @supabase/ssr
npm install @tanstack/react-query
npm install react-hook-form zod @hookform/resolvers
npm install drizzle-orm drizzle-kit
npm install inngest
npm install resend

# Dev dependencies
npm install -D vitest @vitest/coverage-v8 @playwright/test
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| **Expo + React Native** | Flutter | Expo wins for a JS-first team. Flutter requires Dart — separate codebase. Expo shares code with Next.js (Zod, React Query, types). Flutter has no equivalent code sharing with a Next.js web app. |
| **Expo + React Native** | React Native Web + Next.js (single codebase) | Universal apps with one codebase sound appealing but cause constant platform-specific hacks. Separate codebases (Expo mobile + Next.js web) are simpler and faster to build well for each platform. |
| **Supabase** | Firebase | Firebase Firestore is NoSQL — complex to query for "shifts near me, sorted by fill rate, where worker is available". Postgres is the right data model. Firebase is 3-5x more expensive at scale for read-heavy workloads. Supabase is open source and self-hostable. |
| **Supabase** | Neon + custom auth | More pieces to manage. Supabase bundles Postgres + Auth + Realtime + Storage. At bootstrapped scale, fewer managed services = fewer bills = fewer failure points. |
| **Inngest** | BullMQ | BullMQ requires a Redis instance and persistent worker processes. Inngest runs on existing Vercel serverless functions — no infrastructure. For a bootstrapped project, no extra infra to manage is worth the trade. BullMQ is better if you go self-hosted server later. |
| **Inngest** | Temporal | Temporal is enterprise-grade but requires self-hosted Temporal server. Overkill for MVP. Revisit if workflow complexity grows significantly. |
| **Stripe Connect** | Adyen | Adyen is enterprise-grade (minimum ~$5K/month volume requirements). Stripe Connect works from day one. Both support PayNow in Singapore. |
| **OneSignal** | Direct FCM + APNs | OneSignal adds reliability and a management layer. Direct FCM had 25% annual uptime issues in 2022. OneSignal buffers against FCM instability. Expo SDK integrates cleanly with OneSignal. |
| **Drizzle ORM** | Prisma | Prisma's query engine adds latency overhead on serverless cold starts. Drizzle is lighter and generates plain SQL. Better for complex join-heavy queries (shift matching). Prisma is fine if team prefers it. |
| **OpenAI text-embedding-3-small** | Local embedding model | Local model would run on Supabase Edge Function with ONNX — possible but adds complexity. text-embedding-3-small costs <$0.01/day for MVP scale. Use local embeddings only if data must not leave Singapore infrastructure (PDPA concern — check if this applies). |
| **Vercel** | Fly.io | Fly.io is more cost-effective at scale (no per-request pricing). Vercel wins at MVP speed: zero-config deploys, automatic preview URLs, Inngest integration. Move to Fly.io if Vercel costs become significant (typically at 1M+ monthly page views). |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Redux / Zustand** | Over-engineered for a data-fetching problem. 90% of "state management" in a marketplace app is just server state. | React Query handles server state. React Context handles simple UI state (theme, auth user). |
| **GraphQL** | Adds a schema layer and code generation overhead. REST + tRPC is sufficient and faster to build. GraphQL shines for public APIs with many consumers — ShiftSG has two clients (mobile + admin web). | REST endpoints from Next.js API routes + tRPC for admin-only internal calls. |
| **MongoDB / NoSQL** | The relational model (shifts ↔ bids ↔ workers ↔ businesses ↔ ratings) needs joins. Postgres is the right tool. NoSQL would require denormalization that creates inconsistencies. | PostgreSQL via Supabase. |
| **Socket.io** | Supabase Realtime already provides WebSocket-based DB change subscriptions with RLS. Adding Socket.io duplicates this. Custom WebSocket servers add infra to manage. | Supabase Realtime channels for bid feeds and shift status updates. |
| **Expo Go for production testing** | Expo Go does not support native modules (background location, custom push configs). Switch to EAS builds from the start for GPS features. | EAS Development Build (`eas build --profile development`). |
| **Sending notifications synchronously in API handlers** | One slow FCM call blocks the user's request. Under load, it brings down the API. | Enqueue notification jobs via Inngest. Return 200 immediately. |
| **Storing NRIC in the application DB** | NRIC is sensitive PII under Singapore PDPA. A breach becomes a serious compliance incident. | Store only a salted hash reference and a `verified: boolean` flag. The actual NRIC stays in MyInfo. |
| **MyInfo v3** | Being decommissioned September 2026. Already deprecated. | MyInfo v5 with FAPI 2.0. All new integrations must use v5. |

---

## Stack Patterns by Context

**For the worker mobile app (high-frequency, low data):**
- Expo + React Native + NativeWind
- Supabase Realtime for live shift feed
- Expo Location + Task Manager for GPS
- Heavy use of React Query with aggressive cache invalidation on WebSocket updates
- OneSignal for push, Twilio SMS as fallback

**For the business mobile app (lower frequency, richer forms):**
- Same Expo stack
- More react-hook-form usage (shift posting is form-heavy)
- Charts via Victory Native (lighter than recharts for mobile)

**For the admin web panel:**
- Next.js 15 App Router
- shadcn/ui components
- tRPC for internal typed API calls
- Drizzle for direct DB queries where tRPC overhead is not needed
- recharts for dashboards

**For the AI matching pipeline:**
- Supabase Edge Function calls OpenAI embeddings API on profile create/update
- Stores vector in pgvector alongside worker row
- Matching query: SQL filter (location radius, availability, certifications) then vector cosine sort
- Start with rules-based weighted score (Phase 5); add embedding-based semantic matching after data accumulates

**For SingPass / MyInfo integration:**
- Server-side only — never expose client secret to mobile
- OAuth 2.1 PKCE flow with DPoP
- Redirect flow via Next.js API route (not mobile deep link direct — too fragile)
- Store verification result in Supabase, not MyInfo data itself

---

## Version Compatibility Notes

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| NativeWind v4 | Expo SDK 52, React Native 0.76+ | v4 requires Expo SDK 50+. Do not use v2 (incompatible with new architecture). |
| Expo SDK 52 | React Native 0.76 | New Architecture (Fabric) enabled by default. Some third-party libraries still have issues — check before adding. |
| Supabase JS v2 | Next.js 15 App Router | Use `@supabase/ssr` package for App Router (replaces `@supabase/auth-helpers-nextjs`). |
| Drizzle ORM | Supabase Postgres | Use `drizzle-orm/postgres-js` driver with `postgres` package for direct connections, or `drizzle-orm/pg-core` with `pg` driver. |
| tRPC v11 | Next.js 15 App Router | Use `@trpc/next` adapter with App Router server components. |
| Inngest v3 | Next.js 15 | Use `serve()` in an App Router API route (`/api/inngest`). |

---

## Singapore-Specific Notes

**SingPass / MyInfo v5:**
- Registration at `developer.singpass.gov.sg` — Singapore-registered companies only
- Sandbox available immediately; production approval takes 2-4 weeks — start early
- FAPI 2.0 compliance required by 31 December 2026
- Use X.509 certificate for server-to-server JWT client authentication
- Never integrate MyInfo directly from the mobile app — always proxy through your Next.js API

**OneMap (Singapore Government, Free):**
- For Singapore addresses and geocoding, OneMap is preferred over Google Maps (free, government-maintained, more accurate for HDB/MRT addresses)
- API: `https://www.onemap.gov.sg/api/`
- Use for: venue address lookup, worker location display on shift cards
- Use Google Maps only for the interactive map render (react-native-maps defaults to Google Maps on Android)

**PayNow:**
- Supported by Stripe (via bank transfer in SGD) — businesses can pay shifts via PayNow
- Workers are paid via Stripe Connect standard payout to their bank account (SGD)

---

## Sources

- [Expo SDK 52 Documentation](https://docs.expo.dev/) — EAS Build, Location, Notifications confirmed
- [NativeWind v4 — nativewind.dev](https://www.nativewind.dev/docs/getting-started/installation) — v4 installation and Expo SDK 52 compatibility
- [Supabase Realtime + RLS](https://supabase.com/docs/guides/realtime/authorization) — RLS-aware WebSocket channels confirmed
- [pgvector — Supabase Docs](https://supabase.com/docs/guides/database/extensions/pgvector) — vector similarity in Postgres confirmed
- [Singpass Developer Docs — MyInfo v5](https://docs.developer.singpass.gov.sg/docs/products/singpass-myinfo) — v5 API and FAPI 2.0 requirement
- [Singpass MyInfo v3 Decommission Notice](https://partnersupport.singpass.gov.sg/hc/en-sg/articles/46944126585753) — decommissioned September 2026
- [Inngest — Background Jobs](https://www.inngest.com/docs/guides/background-jobs) — serverless-first durable workflows
- [Stripe Connect Singapore Pricing](https://stripe.com/en-sg/connect/pricing) — marketplace payout model
- [OneSignal vs Firebase FCM — Courier 2026](https://www.courier.com/integrations/compare/expo-vs-firebase-fcm) — OneSignal reliability advantage
- [OpenAI text-embedding-3-small pricing](https://platform.openai.com/docs/pricing) — $0.02/1M tokens confirmed
- [Supabase vs Firebase 2026 — Zignuts](https://www.zignuts.com/blog/firebase-vs-supabase) — Postgres advantage for relational data
- [Vercel vs Fly.io cost comparison — Ritza](https://ritza.co/articles/gen-articles/cloud-hosting-providers/fly-io-vs-vercel/) — Vercel for MVP speed, Fly.io for scale
- WebSearch (MEDIUM confidence): Inngest vs BullMQ serverless trade-offs, Drizzle vs Prisma on serverless, NativeWind v4 adoption patterns

---

*Stack research for: ShiftSG — AI-first shift marketplace (Singapore, F&B + retail)*
*Researched: 2026-03-19*
