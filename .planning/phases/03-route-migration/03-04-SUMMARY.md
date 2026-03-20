---
phase: 03-route-migration
plan: 04
status: complete
started: "2026-03-20"
completed: "2026-03-20"
duration: "25min"
---

# Plan 03-04: Design System + React Login/Register

## What Was Built

### Design System Tokens
- `frontend/src/design-system/tokens.ts` — TypeScript token file with colors, spacing, typography, animation, elevation, and radius
- `frontend/src/design-system/index.css` — CSS custom properties with `--ds-*` prefix, extending existing `:root` variables

### React Pages
- `frontend/src/pages/LoginPage.tsx` — Porter-native login: P logo SVG, surface card, raised inputs, accent button, card shake on error, inline error text, noValidate (no browser popups)
- `frontend/src/pages/RegisterPage.tsx` — Matching register: email + password + confirm, same design language
- `frontend/src/main.tsx` — React Router with `/login`, `/register`, `/*` routes (base: `/v2/`)

### Porter.py Auth Fixes (from checkpoint iteration)
- Open registration: `/register` GET + POST without invite codes
- Forgot password: `/forgot-password` GET + POST self-service flow
- Login links: Create account → `/register`, Forgot password → `/forgot-password`
- "Ask Porter" → "Porter" across 12 UI labels
- Theme inheritance: all auth pages read `porter_theme` from localStorage

## Key Decisions
- React login pages match Porter's existing design language (not frosted glass)
- Error handling uses card shake + inline text, not big error boxes
- `noValidate` on all forms — Porter handles validation, never browser defaults
- Open registration (no invite code) — simplified for SaaS onboarding

## Deviations
- Original plan had 3 tasks; checkpoint iteration expanded scope to include porter.py auth flow fixes
- Registration simplified from invite-code model to open registration
- Forgot password flow added (not in original plan)

## key-files
created:
  - frontend/src/design-system/tokens.ts
  - frontend/src/design-system/index.css
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/RegisterPage.tsx
modified:
  - frontend/src/main.tsx
  - porter.py

## Self-Check: PASSED
- Design system token file exists with all definitions ✓
- React Router routes `/login` and `/register` ✓
- Playwright selectors preserved (#uname, #pw, .login-btn) ✓
- Porter.py auth flows functional ✓
