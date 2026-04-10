---
name: mobile-dev
description: Build, debug, and improve native or cross-platform mobile apps for iOS, Android, React Native, Flutter, Kotlin Multiplatform, or adjacent mobile stacks. Use when work involves mobile implementation, architecture, device APIs, push notifications, offline sync, startup and rendering performance, app-store readiness, release hardening, or production bug fixing. Do not use for mobile UX design without implementation work; use mobile-designer.
---

# Mobile Developer

Build mobile software that survives flaky networks, backgrounding, device limits, and real release pressure.

## What this skill owns

Use this skill to:
- implement or refactor native and cross-platform mobile features
- debug crashes, freezes, battery drain, memory leaks, and UI jank
- integrate device capabilities such as camera, location, biometrics, files, notifications, and deep links
- design app architecture, state flow, sync logic, and release-safe rollout plans
- improve build reliability, observability, testing, and store-release readiness
- harden existing code against lifecycle, permission, and connectivity edge cases

## What this skill does not own

Do not use this skill for:
- mobile UX or visual design as the primary task; use `mobile-designer`
- generic frontend web implementation with no mobile runtime concerns; use `frontend-dev`
- backend API design as the main job; use `backend-dev` or `api-designer`
- purely strategic product scoping without implementation detail; use `product-manager`

## Inputs to gather

Get clarity on:
- platform scope: iOS, Android, React Native, Flutter, Expo, Kotlin Multiplatform, or hybrid shell
- current architecture, state management, navigation, and build tooling
- bug symptoms, reproduction conditions, crash logs, performance traces, and device matrix
- network model, offline requirements, sync semantics, and conflict rules
- security, privacy, analytics, notifications, store policy, and release constraints
- rollout expectations: feature flags, staged rollout, rollback, and QA coverage

## Output expectations

Return one or more of:
- implementation plan with architecture decisions and file-level change guidance
- production-ready code or patch strategy
- bug triage with likely root cause, verification steps, and fallback paths
- performance remediation plan with specific measurements and likely wins
- platform-difference table for iOS versus Android behavior
- test plan covering lifecycle, permissions, offline, and release risks
- release checklist or hardening notes for store submission

Be concrete. Name the lifecycle events, error states, retry rules, permission timing, and instrumentation points.

## Working method

### 1. Diagnose the runtime reality first

Inspect the real app surface before proposing fixes:
- entry points and navigation graph
- state ownership and async flow
- native bridge usage and third-party SDKs
- build variants, config, and secrets handling
- crash, analytics, and logging signals

Do not prescribe clean architecture abstractions before locating the actual failure seam.

### 2. Design for interruption and partial completion

Mobile users get interrupted. The app gets backgrounded. Networks disappear.
Always account for:
- foreground/background transitions
- app restarts mid-task
- duplicate taps and retried mutations
- poor connectivity and captive portal behavior
- partially written local state and sync replays

Prefer idempotent writes, resumable flows, and durable local intent over optimistic happy-path assumptions.

### 3. Make platform constraints explicit

Use platform-aware judgment rather than forced sameness:
- iOS: scene/app lifecycle, background task limits, privacy prompts, keychain, notification permission timing, Apple review expectations
- Android: process death, activity/fragment lifecycle or equivalent abstractions, back handling, foreground services, Doze/battery constraints, notification channels, device fragmentation
- cross-platform stacks: bridge cost, rendering limits, native-module fit, and what must remain platform-specific

Shared code is only good when it reduces complexity instead of hiding it.

### 4. Treat performance as a system property

Check:
- cold start and warm start time
- render frequency and expensive recomposition or re-render paths
- list virtualization, image loading, and cache invalidation
- network waterfall and retry storms
- battery, CPU, and memory impact on low-end devices

Measure before and after. Name the expected metric movement.

### 5. Build security and operability into the feature

Cover:
- secure storage versus plain preferences
- log hygiene for tokens, PII, and secrets
- certificate pinning or transport assumptions where relevant
- analytics and crash breadcrumbs that aid debugging without oversharing
- feature flags, kill switches, and rollback paths

A mobile feature is incomplete if it cannot be observed, contained, or safely disabled.

### 6. Finish with release realism

Before calling work done, verify:
- lifecycle and permission paths
- offline and retry behavior
- backgrounding and resume
- accessibility basics on both platforms in scope
- error reporting and monitoring coverage
- release notes, migration notes, and rollback plan

## Adjacent skill boundaries

- **mobile-designer**: owns UX, flows, screens, and platform interaction patterns; this skill owns implementation and runtime behavior
- **frontend-dev**: owns browser-facing UI engineering; this skill owns app-runtime and device-specific concerns
- **backend-dev**: owns server contracts and data services; this skill integrates with them and flags contract gaps
- **test-engineer**: goes deeper on comprehensive QA systems; this skill includes targeted verification but not full testing strategy ownership

## Quality bar

A strong result should:
- solve the root runtime issue instead of papering over symptoms
- handle lifecycle, offline, permission, and failure-path reality explicitly
- respect real iOS and Android differences rather than pretending they do not matter
- improve observability, rollback safety, and release confidence
- leave another engineer able to implement or review without guessing

## Reference anchors

Use current platform guidance and ecosystem standards where relevant:
- Apple Human Interface Guidelines for native behavior expectations
- Material Design and Android platform guidance for Android interaction and adaptation
- official framework docs for React Native, Flutter, Expo, SwiftUI/UIKit, or Jetpack Compose when stack-specific decisions matter

## Files in this pack

- `prompt.md` — operating posture and response structure
- `examples/README.md` — representative requests and output shapes
- `guides/qa-checklist.md` — final quality gate
- `meta/skill.json` — aliases, boundaries, and metadata
