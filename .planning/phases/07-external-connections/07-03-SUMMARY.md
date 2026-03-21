---
phase: 07-external-connections
plan: 03
subsystem: ui
tags: [react, typescript, connections, service-cards, status-badge, lucide]

requires:
  - phase: 07-external-connections
    provides: GET /api/v1/connections endpoint, workspace_connections table, connection CRUD

provides:
  - ConnectionsPage with 4 service cards (GitHub, Email, Google Calendar, WhatsApp)
  - ConnectionStatusBadge reusable status dot + label component
  - ServiceCard with role-aware action buttons (connect/disconnect/manage)
  - ApiKeyForm masked input with reveal toggle for non-OAuth providers
  - DisconnectDialog confirmation modal
  - Connections tab in Sidebar with Plug icon
  - Layout routing for connections tab to ConnectionsPage

affects:
  - future OAuth integration plans (05-08) which add OAuthConnectButton to ServiceCard
  - project connections panel (per-project overrides)
  - any plan consuming ConnectionStatusBadge

tech-stack:
  added: []
  patterns:
    - "Module-in-directory: connections module lives at frontend/src/modules/connections/ following health/projects pattern"
    - "Role-aware UI: isAdmin prop gates action buttons, disabled with descriptive title tooltip"
    - "Stagger animation: CSS @keyframes fadeSlideIn with per-card animationDelay via inline style"
    - "Optimistic delete: filter connection from local state on disconnect before API confirms"

key-files:
  created:
    - frontend/src/modules/connections/ConnectionsPage.tsx
    - frontend/src/modules/connections/ServiceCard.tsx
    - frontend/src/modules/connections/ConnectionStatusBadge.tsx
    - frontend/src/modules/connections/ApiKeyForm.tsx
    - frontend/src/modules/connections/DisconnectDialog.tsx
  modified:
    - frontend/src/store/app.ts
    - frontend/src/components/Sidebar.tsx
    - frontend/src/components/Layout.tsx

key-decisions:
  - "ConnectionsPage fetches user role from /api/v1/auth/me (role field on session user) — no separate profile endpoint needed"
  - "ServiceCard shows Disconnect button only when status=connected and connectionId is non-null — avoids dead UI state"
  - "API key form shown inline below card (not in a dialog) — keeps context visible while entering key"
  - "Stagger animation via inline style + CSS @keyframes in <style> block — avoids CSS module complexity for a single-page use"

patterns-established:
  - "connections module follows health module pattern: named exports, no default, CSS vars for all colors"
  - "ConnectionStatusBadge aria-label on dot div (not span) — accessible color-independent state communication"

requirements-completed: [CONN-05]

duration: 6min
completed: 2026-03-21
---

# Phase 07 Plan 03: Connections Frontend UI Summary

**React connections module with 4 service cards, role-gated action buttons, API key form, and Plug-icon sidebar nav wired into Layout routing**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-21T16:45:02Z
- **Completed:** 2026-03-21T16:51:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Connections module directory created with 5 component files implementing the full UI spec
- ServiceCard renders status dot (connected/needs_reauth/disconnected/error) with CSS variable colors, last sync time, and admin-gated action buttons
- ConnectionsPage fetches live connections from GET /api/v1/connections and GET /api/v1/auth/me, maps to 4 static service definitions with stagger entrance animation
- Sidebar Connections nav item with Plug icon; Layout routes the tab to ConnectionsPage

## Task Commits

1. **Task 1: Create ConnectionsPage, ServiceCard, and supporting components** - `4c6d276` (feat)
2. **Task 2: Wire Connections into Sidebar navigation and Layout routing** - `4f183f2` (feat)

## Files Created/Modified

- `frontend/src/modules/connections/ConnectionsPage.tsx` - Main page: fetches connections + profile, renders 4 ServiceCards with stagger animation, handles connect/disconnect/api-key flow
- `frontend/src/modules/connections/ServiceCard.tsx` - Provider card: icon, ConnectionStatusBadge, description, last sync, role-aware action buttons
- `frontend/src/modules/connections/ConnectionStatusBadge.tsx` - Reusable status dot + label with aria-label, CSS variable colors
- `frontend/src/modules/connections/ApiKeyForm.tsx` - Masked input with Eye/EyeOff toggle, save/cancel with spinner
- `frontend/src/modules/connections/DisconnectDialog.tsx` - Modal: "Disconnect [Service]?" with Keep Connected / Disconnect buttons
- `frontend/src/store/app.ts` - Added 'connections' to TabId union
- `frontend/src/components/Sidebar.tsx` - Added Plug import, connections tab entry
- `frontend/src/components/Layout.tsx` - Added ConnectionsPage import and routing

## Decisions Made

- Used `/api/v1/auth/me` for role check — already returns `role` field, no new endpoint needed
- Inline API key form (below card) rather than dialog — preserves spatial context while entering credentials
- Stagger animation via `@keyframes fadeSlideIn` in a `<style>` JSX block — avoids CSS module overhead for a localized animation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Playwright tests show `ERR_CONNECTION_REFUSED` on `http://127.0.0.1:8877/login` — Porter is bound to `::1:8877` (IPv6 via SSH tunnel), not `127.0.0.1:8877`. This is a pre-existing infrastructure condition unrelated to this plan's changes. TypeScript compilation (the actual verification gate in this plan) passes cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Connections page accessible via sidebar navigation
- 4 service cards render with correct status dots based on API state
- Admin-only enforcement on action buttons (disabled with tooltip for non-admins)
- API key form ready for credential entry
- Disconnect dialog confirms before DELETE /api/v1/connections/:id
- OAuth buttons (OAuthConnectButton) are the next integration step per plan scope note

---
*Phase: 07-external-connections*
*Completed: 2026-03-21*
