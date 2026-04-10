## v0.2.6 (2026-03-24)

- fix: remove redundant page titles, add /tools + catch-all 404 (v0.2.5)


## v0.2.4 (2026-03-24)

- feat: auto-generate CHANGELOG.md from git history
- fix: changelog reads from CHANGELOG.md at build time (permanent fix)
- fix: changelog page missing v0.2.1-v0.2.3 releases


## v0.2.3 (2026-03-24)

**Full Product Pass — Agents, Files, Systemwide Chat, Design System**

AI Agents:
- Agents + Templates tabs with grayed-out uninstantiated templates
- Queue Master card (grayed — not born yet)
- Born date on all agent cards (Calendar icon)
- Full `/agents/:id` detail page (hero, skills, group, back nav)
- Removed redundant "AI Agents" header

Files:
- Flat toolbar with breadcrumb (no secondary nav, no root selector)
- File preview panel with expand/minimize (full-width mode)
- Rename (inline input) + Delete (inline confirm) via context menu
- Drag-and-drop upload with visual overlay
- Compact/comfortable density toggle (Rows3, saved to localStorage)

Systemwide Chat:
- Chat moved to AppShell — every page gets Porter portrait sidebar strip
- Three states: minimized (8px) → open (300px) → expanded (full-screen)
- Model picker: inline pills (Auto | Ollama | GPT-5.4) with live status dots
- History button toggles (press again = back)
- Removed per-page chat from dashboard + files

Design System (7 new patterns):
- Porter Chat Sidebar (AppShell Pattern)
- Chat Model Picker (Inline Pills)
- Chat Session List toggle behavior
- File Preview Panel (Expandable)
- File Row Density (Compact / Comfortable)
- File Row Actions (Context Menu)
- Agent cards with born date

Other:
- Dashboard icon: LayoutDashboard in sidebar + top-bar
- Vite proxy: unified all /api routes to :3001

## v0.1.6 (2026-03-22)

**Dashboard Overhaul — Agent Supervisors + Viral Hero**

- Hero: $5/mo AI team vs $16k/mo humans comparison with impact metrics (tasks, hours saved, cost saved, ROI)
- Hero: askporter.app branding, Share button for X screenshots
- Agent supervisors on all dashboard sections (Project Manager, Operations, Strategy, AI Router)
- Agent supervisors: PixelPortrait avatars, colored borders/gradients, live activity lines
- Projects + Activity sections wrapped in colored bordered containers
- Bottom section: clean bordered card (replaces clumsy border-t line)
- LLMTerminal: theme-aware (follows light/dark mode), fills container height
- AreaChart: new design system component (SVG, gradient fill, glow, smooth curves)

## v0.1.5 (2026-03-22)

- Version alignment (missed changelog entry)

## v0.1.4 (2026-03-22)

- Dashboard: chat panel restored — right column (340px), full-height, streaming via `/api/v1/chat/stream`
- Chat: design system spec (message bubbles, thinking dots, gradient composer, send button)
- Chat: token-by-token SSE streaming, auto-scroll, Enter to send
- LLM Terminal: forced dark background (#0d1117) — always looks like a terminal regardless of theme
- Settings: billing tab removed (not built yet, don't expose)
- Settings: tab nav padding tightened (140px width, px-2, text-xs)
- Settings: avatar loads from session (persisted in DB), saves on profile save
- Settings: errors shown in red next to Save button (was silently swallowing failures)
- Sidebar: avatar reads from session context (was hardcoded DEFAULT_USER)
- Auth: Brain login rejects platform_admin/admin roles — admin accounts can never create product sessions
- Auth guard: rejects platform_admin/admin sessions — redirects to login
- Profile persistence fix: `/me` now returns `fullName` + `avatarUrl`
- Profile persistence fix: save only updates fullName/email if non-empty (prevents Zod default wipe)
- Profile persistence fix: email uniqueness check before update, returns EMAIL_EXISTS error
- Profile persistence fix: settings form loads first/last name from `fullName` (was initializing empty)
- Session types: added `fullName`, `avatarUrl` to SessionData and Session interfaces

## v0.1.3 (2026-03-22)

- SSE: profile:updated event emitted from Brain on profile save
- Auth: trackLogin writes last_ip, async IP→country resolution via api.country.is
- Auth: country written to users.country + customer_events.country

## v0.1.2 (2026-03-22)

- Standalone Porter UI repo — remove dev pages, clean routes

## v0.1.1 (2026-03-22)

- Live dashboard, notifications, design system cleanup

## v0.1.0 (2026-03-21)

**Initial release — Product Frontend**

- React 19, React Router 7 (SPA), Tailwind CSS 4, shadcn/ui, TanStack Query
- Dashboard: hero stats, stat tiles, project list, activity feed, LLM activity terminal
- Settings: profile (avatar editor, name, email), account (password change)
- Auth: login, register, verify email, forgot/reset password
- Design system: full component catalog
