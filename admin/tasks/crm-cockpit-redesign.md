# CRM Customer Cockpit Redesign — Plan

**Date:** 2026-03-22
**Scope:** customer detail page (user-detail.tsx) + customer list filters (users.tsx)
**Principle:** This screen is the agent intelligence dashboard. Every metric is an agent input. The action carousel is the agent output. Admin sees what agents see.

---

## Design Decisions (locked)

### Page Layout
- **Hero strip + grid below** — dense hero at top, responsive grid of cards below
- **Above the fold:** identity + scores + stage, next action + agent tasks, revenue metrics, activity feed
- **Account info inside hero strip** — email, country, company as inline chips. Social icons as small links. No separate card
- **Projects + Agents as grid cards** alongside activity — same visual weight as other sections
- **Remove login history** — duplicates activity log
- **Remove billing events** — belongs in billing page, not customer cockpit

### Action Carousel
- **Keep carousel** with auto-rotation
- **Kill dot indicators** — replace with count badge or progress bar
- **Add agent pixel avatars** — each action card shows assigned agent's pixel portrait
- **Better card styling** — more depth, contrast, visual energy

### Revenue + Plan Controls
- **Mini cards in a row** — fixed small width (~80px), tight cluster. Not stretching
- **Plan controls: admin override, single row** — plan pills + status pills in ONE horizontal row. Subtle "Admin Override" label. ~40px height total
- **Lifetime toggle** inline with plan pills

### Customer List
- **Segmented control** — macOS-style connected bar replacing ugly button pills
- **KPIs: keep but compact** — inline numbers, smaller, part of header area

---

## Execution Plan

### Task 1: Hero Strip Redesign
**File:** `user-detail.tsx`
- Merge current header + account card + stats strip into one dense hero strip
- Row 1: Avatar (with online badge) | Name + level + stage badges | Plan badge + "Admin Override" label | Revenue mini cards (MRR, Margin, LTV — fixed 80px width)
- Row 2: Email chip | Country chip | Company chip | Social icon links | Join date | Last seen
- Row 3: Compact stats — Sessions, Projects, Chats, Agents, Invites, 30d Logins (inline, no cards)
- Delete the separate Account card section entirely
- Delete the separate Revenue cards section
- Delete the separate Stats strip section

### Task 2: Plan Controls — Single Row Inline
**File:** `user-detail.tsx` (PlanControls component)
- Flatten Plan pills + Status pills into ONE horizontal row
- Add "Admin Override" subtle label (text-[9px] text-text3 uppercase)
- Lifetime toggle as final pill in the plan row
- Trial button inline if applicable
- Max height ~40px total
- Place inside hero strip or directly below it

### Task 3: Action Carousel — Agent Identity
**File:** `user-detail.tsx` (ActionCarousel component)
- Replace dot indicators with a count badge (e.g., "2/4" in top-right corner)
- Add agent pixel avatar to each card (left side, before icon)
  - Growth agent → green-tinted pixel portrait
  - Retention agent → orange-tinted pixel portrait
  - No agent → Porter's own avatar
- Better card styling: stronger gradient, subtle border glow matching accent color, more visual depth
- Keep auto-rotation (Moe didn't request removing it)

### Task 4: Grid Layout Below Hero
**File:** `user-detail.tsx`
- Replace single-column stack with responsive grid
- Layout: `grid-cols-[1fr_340px]` or `grid-cols-2`
  - Left: Action carousel + AI score rings
  - Right: Activity feed (LLMTerminal — make it fill container height)
- Below grid: Projects + Agents cards in `grid-cols-2`
- Delete Login History section entirely
- Delete Billing Events section entirely
- Progression timeline stays (above grid, below hero)

### Task 5: Activity Feed Height Fix
**File:** `user-detail.tsx`
- LLMTerminal needs `h-full` or `min-h-[400px]` to fill its grid cell
- Check if the component accepts height props or needs a wrapper

### Task 6: Customer List — Segmented Control + Compact KPIs
**File:** `users.tsx`
- Replace Button filter tabs with a segmented control component
  - Single connected bar with highlighted active segment
  - Each segment: label + count
  - Smooth transition on segment change
- KPI bar: shrink from card grid to inline stats row
  - Remove card borders, reduce padding
  - Inline: "142 customers · 23 active · $650 MRR · 72 health"
  - Same data, 1/4 the vertical space

---

## Execution Order

1. Task 1 (Hero strip) — biggest structural change, must go first
2. Task 2 (Plan controls) — depends on hero strip layout
3. Task 4 (Grid layout) — restructure everything below hero
4. Task 3 (Carousel) — visual improvement within the grid
5. Task 5 (Activity height) — fix after grid is in place
6. Task 6 (Customer list) — independent, can go last

## Not In Scope
- New backend endpoints
- Agent avatar asset creation (use colored placeholder if pixel portraits don't exist yet)
- Billing page redesign
- Mobile responsive (admin is desktop-only)
