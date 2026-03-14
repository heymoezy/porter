# Project Timeline Design Brief

Date: 2026-03-14
Status: Proposed
Owner: Porter product architecture

---

## 1. Concept

The **Timeline** tab replaces the current "Activity" tab on every project. Where Activity is a flat, unstyled list of trace/dispatch rows, Timeline is a graphical, vertically-connected event stream that tells the story of a project from creation to now.

### Why it matters

- Projects accumulate dozens of meaningful events: status changes, milestone completions, worker assignments, deliverable uploads, chat exchanges, task progress. The current flat list treats all of these identically — same card shape, same font, same density. Nothing stands out.
- A graphical timeline with connectors, category-colored nodes, date separators, and expandable cards turns the Activity tab from a debug log into a project narrative. Users should be able to glance at the timeline and immediately see the shape of their project's history: when work ramped up, when milestones landed, where gaps exist.
- This is also the most visually distinctive tab in the project workspace. It should feel like the kind of surface you'd show in a demo.

### Naming

- Tab label changes from `Activity` to `Timeline`.
- Internal ID changes from `activity` to `timeline` (with `activity` kept as an alias in `_projSwitchTab` for backward compatibility).
- API endpoint remains `/api/projects/{id}/activity` but accepts an optional `?view=timeline` param. A new `/api/projects/{id}/timeline` alias may be added for clarity.

---

## 2. Visual Design

### 2.1 Overall Layout

```
┌─────────────────────────────────────────────────────────┐
│  ┌─ Filter Bar ──────────────────────────────────────┐  │
│  │ [All] [Chat] [Workers] [Milestones] [Tasks] ...   │  │
│  │                                    [↑ Jump to Today]│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ── Today ───────────────────────────────────────────── │
│           │                                             │
│           ●── Worker "Atlas" completed task #12         │
│           │   "Finalize API schema for auth module"     │
│           │   2h ago                                    │
│           │                                             │
│           ●── Milestone completed                       │
│           │   ✓ "Backend API v1"                        │
│           │   5h ago                                    │
│           │                                             │
│  ── Yesterday ──────────────────────────────────────── │
│           │                                             │
│           ○── Chat message                              │
│           │   Moe: "Let's prioritize the auth flow"     │
│           │   Yesterday at 14:32                        │
│           │                                             │
│           ●── Status changed                            │
│           │   active → paused                           │
│           │   Yesterday at 09:15                        │
│           │                                             │
│  ── Mar 12 ─────────────────────────────────────────── │
│           │                                             │
│           ●── Project created                           │
│           │   Type: app · Status: active                │
│           │   Mar 12 at 11:00                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 The Vertical Line

A single continuous vertical line runs down the left side of the timeline, connecting all events. This line is the backbone of the design.

- **Width:** 2px
- **Color:** `var(--border)` (`#3d4758`)
- **Position:** 28px from the left edge of the timeline container
- **Behavior:** Starts at the first event, ends at the last event. Does not extend above or below the event range.
- **Implementation:** CSS `::before` pseudo-element on the timeline container, absolutely positioned.

### 2.3 Event Nodes

Each event has a circular node sitting directly on the vertical line.

- **Size:** 10px diameter (filled circle for significant events, 8px hollow circle for minor events)
- **Border:** 2px solid, color matches the event category
- **Fill:** Solid fill for completed/important events; `var(--bg)` fill with colored border for in-progress or minor events
- **Position:** Centered on the vertical line (left: 23px for 10px nodes)
- **Z-index:** Above the line (z-index: 2)

**Node color by event type:**

| Event Type | Node Color | Hex |
|---|---|---|
| Project lifecycle (created, status change) | Amber | `#f59e0b` |
| Milestone (added, completed) | Green | `#22c55e` |
| Worker (assigned, removed) | Blue | `#3b82f6` |
| Deliverable (uploaded, linked) | Purple | `#a855f7` |
| Chat message | Slate | `#94a3b8` |
| Task (created, completed) | Teal | `#14b8a6` |
| Phase / workstream change | Indigo | `#6366f1` |
| Collaborator (added, removed) | Rose | `#f43f5e` |
| Error / failure | Red | `#ef4444` |

### 2.4 Event Cards

Each event renders as a card positioned to the right of the node, connected by a short horizontal stub.

```
     ●────┬─────────────────────────────────┐
     │    │  [Icon] Title              2h ago│
     │    │  Detail text or summary          │
     │    │  [metadata chips]                │
     │    └─────────────────────────────────┘
     │
```

**Card specs:**

- **Background:** `var(--surface)` (`#222a38`)
- **Border:** 1px solid `var(--border)` (`#3d4758`)
- **Border-left:** 3px solid, colored by event type (same as node color)
- **Border-radius:** 10px
- **Padding:** 12px 14px
- **Margin-left:** 48px (clears the line + node + gap)
- **Max-width:** 100% of remaining container width
- **Shadow:** `0 1px 3px rgba(0,0,0,0.15)` — subtle depth, not heavy
- **Hover:** Border-left brightens slightly, card lifts with `translateY(-1px)` and `box-shadow: 0 2px 8px rgba(0,0,0,0.25)`. Transition: 150ms ease.

**Card content layout:**

- **Row 1:** Icon (16px, inline SVG or emoji) + Title (13px, `font-weight: 600`, `var(--text)`) + Timestamp (11px, `var(--text3)`, right-aligned)
- **Row 2:** Detail text (12px, `var(--text2)`, max 2 lines with `line-clamp: 2`)
- **Row 3 (optional):** Metadata chips — small rounded badges showing actor name, task ID, worker name, backend used, etc. Style: `font-size: 10px`, `padding: 2px 6px`, `border-radius: 4px`, `background: var(--raised)`, `color: var(--text3)`

### 2.5 Date Separators

Date headers break the timeline into logical sections.

- **Text:** "Today", "Yesterday", or formatted date ("Mar 12", "Feb 28")
- **Font:** 11px, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.5px`, `color: var(--text3)`
- **Layout:** Horizontal rule spanning the full width, with the date label sitting on top of the line. The label has a background of `var(--bg)` with horizontal padding to mask the rule behind it.
- **Sticky behavior:** Date headers stick to the top of the scroll container (`position: sticky; top: 0`) with `background: color-mix(in srgb, var(--bg) 92%, transparent)` and `backdrop-filter: blur(8px)` for a frosted-glass effect.
- **Z-index:** 5 (above cards and nodes)

### 2.6 Horizontal Connector Stubs

A thin horizontal line connects each node to its card.

- **Width:** 12px (from node edge to card left border)
- **Height:** 2px
- **Color:** Same as node color (event category)
- **Position:** Vertically centered on the node

### 2.7 Animations

- **Scroll fade-in:** Cards animate in as they enter the viewport. Each card starts with `opacity: 0; transform: translateY(12px)` and transitions to `opacity: 1; transform: translateY(0)` over 300ms ease-out. Use `IntersectionObserver` to trigger.
- **Stagger:** When multiple cards enter the viewport at once (initial load), stagger their animations by 60ms each to create a cascade effect.
- **Node pulse:** When a new event arrives via SSE while the user is viewing the timeline, the new node briefly pulses (scale 1 → 1.4 → 1 over 400ms) with a soft glow matching its category color.
- **Line grow:** On initial render, the vertical line "grows" downward from the first event using a CSS clip-path animation (400ms ease-out).

### 2.8 Empty State

When no events exist:

```
┌─────────────────────────────────────────┐
│                                         │
│         ○                               │
│         │                               │
│         ○                               │
│         │                               │
│         ○                               │
│                                         │
│    This project's story starts here.    │
│    Events will appear as work begins.   │
│                                         │
└─────────────────────────────────────────┘
```

Three faded, unconnected placeholder nodes with a centered message. Subtle — not heavy-handed.

---

## 3. Event Types

### 3.1 Full Event Catalog

| Event Type ID | Category | Title Template | Icon | Detail |
|---|---|---|---|---|
| `project_created` | lifecycle | "Project created" | `◆` | Type + initial status |
| `status_changed` | lifecycle | "Status changed" | `↻` | `{old} → {new}` |
| `milestone_added` | milestone | "Milestone added" | `◎` | Milestone title |
| `milestone_completed` | milestone | "Milestone completed" | `✓` | Milestone title |
| `milestone_removed` | milestone | "Milestone removed" | `✕` | Milestone title |
| `worker_assigned` | worker | "Worker assigned" | `⊕` | Worker name + role |
| `worker_removed` | worker | "Worker removed" | `⊖` | Worker name |
| `deliverable_uploaded` | deliverable | "Deliverable uploaded" | `📎` | Filename + size |
| `deliverable_linked` | deliverable | "Deliverable linked" | `🔗` | URL or path |
| `chat_message` | chat | "Chat" | `💬` | First ~120 chars of message (not full content) |
| `task_created` | task | "Task created" | `+` | Task title + priority |
| `task_completed` | task | "Task completed" | `✓` | Task title |
| `task_status_changed` | task | "Task updated" | `↻` | Task title + `{old} → {new}` |
| `phase_started` | phase | "Phase started" | `▶` | Phase/workstream name |
| `phase_completed` | phase | "Phase completed" | `■` | Phase/workstream name |
| `collaborator_added` | collaborator | "Collaborator added" | `👤` | Username + role |
| `collaborator_removed` | collaborator | "Collaborator removed" | `👤` | Username |
| `trace_step` | worker | "Worker activity" | `⚡` | Agent name + action + summary |
| `dispatch` | worker | "Worker dispatch" | `→` | Agent name + status + summary |
| `error` | error | "Error" | `⚠` | Error message |

### 3.2 Event Grouping

When multiple events of the same type occur within a 5-minute window (e.g., 8 task completions in rapid succession), they collapse into a grouped card:

```
●── 8 tasks completed
│   "Auth module endpoints", "DB migration v3", +6 more
│   10 min ago
```

Clicking the grouped card expands it inline to show all individual events. The group header shows a count badge.

### 3.3 Event Sources

Events are assembled from multiple database tables:

| Source Table | Event Types Derived |
|---|---|
| `_config["projects"]` (JSON) | `project_created`, `status_changed`, milestone events |
| `trace_steps` | `trace_step` (worker activity) |
| `agent_messages` | `dispatch` (worker dispatch results) |
| `project_tasks` | `task_created`, `task_completed`, `task_status_changed` |
| `project_artifacts` | `deliverable_uploaded`, `deliverable_linked` |
| `project_collaborators` | `collaborator_added`, `collaborator_removed` |
| `project_notes` | (not shown directly — used for context enrichment) |

---

## 4. Interactions

### 4.1 Scrolling

- The timeline is a vertically scrollable container within the project tab content area.
- Newest events are at the top; oldest at the bottom (reverse chronological, consistent with current Activity tab).
- Infinite scroll: initial load fetches 30 events. Scrolling near the bottom triggers a fetch for the next 30 (`?offset=30&limit=30`).
- A subtle "Loading more..." indicator appears at the bottom during pagination fetches.

### 4.2 Filtering

A horizontal filter bar sits above the timeline. Pill-shaped toggle buttons for each category:

```
[All] [Chat] [Workers] [Milestones] [Tasks] [Deliverables] [Status]
```

- **Default:** All selected.
- **Behavior:** Click a category to show only that type. Click again to return to All. Multiple categories can be active simultaneously (additive filtering).
- **Active state:** Pill background becomes the category color at 20% opacity, text becomes the category color. Inactive pills: `var(--raised)` background, `var(--text3)` text.
- **Persistence:** Filter state is stored in `sessionStorage` per project ID so it survives tab switches within the same session.

### 4.3 Click to Expand

Cards show a truncated preview by default (2-line detail). Clicking a card expands it to show:

- Full detail text (no line clamp)
- Additional metadata (trace ID, run ID, task ID as copyable chips)
- Timestamp in absolute format ("Mar 12, 2026 at 14:32 SGT")
- For chat events: a "Go to Chat" button that switches to the Chat tab
- For worker events: worker name is clickable, navigates to the Agents module
- For task events: task title links to the Tasks tab
- For deliverable events: filename links to the Deliverables tab

Clicking again collapses the card. Only one card can be expanded at a time (accordion behavior).

### 4.4 Jump to Today

A floating button in the top-right corner of the filter bar:

- **Label:** "↑ Today"
- **Behavior:** Smooth-scrolls to the "Today" date separator (or the newest event if no events exist today).
- **Visibility:** Only visible when the user has scrolled past the Today separator. Fades in/out with a 200ms transition.
- **Style:** `var(--accent)` background, dark text, small pill shape, `position: sticky`.

### 4.5 Live Updates

When the timeline tab is active, new events arriving via SSE:

1. Are prepended to the top of the timeline with the node-pulse animation.
2. If the user has scrolled down, a floating "New events ↑" banner appears at the top. Clicking it scrolls to the top.
3. The event count on the banner increments as more events arrive.

### 4.6 Context Menu

Right-clicking (or long-pressing on mobile) an event card shows a minimal context menu:

- **Copy event ID** — copies the event/trace ID to clipboard
- **View raw** — opens a small modal showing the raw JSON payload (for debugging)

---

## 5. CSS Details

All CSS is inline in porter.py within the main `<style>` block, scoped with a `.timeline-` prefix.

### 5.1 Core Variables (already defined in Porter)

```css
--bg:       #171d28;
--surface:  #222a38;
--raised:   #2b3444;
--border:   #3d4758;
--accent:   #f7931a;
--accent-d: #d97706;
--text:     #F6F8FB;
--text2:    #D7DDE7;
--text3:    #A5B0C2;
```

### 5.2 Timeline-Specific Variables

```css
--tl-line-color:    var(--border);
--tl-line-width:    2px;
--tl-line-left:     28px;
--tl-node-size:     10px;
--tl-node-minor:    8px;
--tl-card-offset:   48px;
--tl-stub-width:    12px;
```

### 5.3 Component Styles

```css
/* ── Timeline container ── */
.timeline-wrap {
  position: relative;
  padding: 12px 0 40px 0;
}

/* ── Vertical line ── */
.timeline-wrap::before {
  content: '';
  position: absolute;
  left: var(--tl-line-left);
  top: 0;
  bottom: 0;
  width: var(--tl-line-width);
  background: var(--tl-line-color);
  border-radius: 1px;
}

/* ── Date separator ── */
.timeline-date {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  margin: 16px 0 8px 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text3);
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.timeline-date::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ── Event row ── */
.timeline-event {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 6px 0;
  margin-left: var(--tl-card-offset);
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 300ms ease-out, transform 300ms ease-out;
}
.timeline-event.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Node ── */
.timeline-node {
  position: absolute;
  left: calc(var(--tl-line-left) - var(--tl-card-offset) - var(--tl-node-size) / 2 + var(--tl-line-width) / 2);
  top: 14px;
  width: var(--tl-node-size);
  height: var(--tl-node-size);
  border-radius: 50%;
  border: 2px solid currentColor;
  background: currentColor;
  z-index: 2;
  flex-shrink: 0;
}
.timeline-node.minor {
  width: var(--tl-node-minor);
  height: var(--tl-node-minor);
  background: var(--bg);
}

/* ── Horizontal stub ── */
.timeline-stub {
  position: absolute;
  left: calc(var(--tl-line-left) - var(--tl-card-offset) + var(--tl-node-size) / 2 + var(--tl-line-width) / 2);
  top: calc(14px + var(--tl-node-size) / 2 - 1px);
  width: var(--tl-stub-width);
  height: 2px;
  background: currentColor;
}

/* ── Card ── */
.timeline-card {
  flex: 1;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid currentColor;
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}
.timeline-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}

/* ── Card header ── */
.timeline-card-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.timeline-card-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  font-size: 14px;
  text-align: center;
  line-height: 16px;
}
.timeline-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.timeline-card-time {
  font-size: 11px;
  color: var(--text3);
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Card detail ── */
.timeline-card-detail {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.timeline-card.expanded .timeline-card-detail {
  -webkit-line-clamp: unset;
  overflow: visible;
}

/* ── Metadata chips ── */
.timeline-chip {
  display: inline-flex;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--raised);
  color: var(--text3);
  white-space: nowrap;
}

/* ── Filter bar ── */
.timeline-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0 12px 0;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.timeline-filter-pill {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--raised);
  color: var(--text3);
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}
.timeline-filter-pill.active {
  border-color: currentColor;
  background: color-mix(in srgb, currentColor 18%, var(--bg));
}
.timeline-filter-pill:hover {
  border-color: var(--text3);
}

/* ── Jump to Today button ── */
.timeline-jump-today {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #000;
  cursor: pointer;
  margin-left: auto;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}
.timeline-jump-today.visible {
  opacity: 1;
  pointer-events: auto;
}

/* ── Node pulse animation (SSE new event) ── */
@keyframes tl-node-pulse {
  0%   { transform: scale(1);   box-shadow: 0 0 0 0 currentColor; }
  50%  { transform: scale(1.4); box-shadow: 0 0 0 6px transparent; }
  100% { transform: scale(1);   box-shadow: 0 0 0 0 transparent; }
}
.timeline-node.pulse {
  animation: tl-node-pulse 400ms ease-out;
}

/* ── Line grow animation (initial render) ── */
@keyframes tl-line-grow {
  from { clip-path: inset(0 0 100% 0); }
  to   { clip-path: inset(0 0 0 0); }
}
.timeline-wrap.animate::before {
  animation: tl-line-grow 400ms ease-out;
}

/* ── Grouped event ── */
.timeline-group-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--raised);
  color: var(--text);
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  margin-left: 6px;
}

/* ── New events banner ── */
.timeline-new-banner {
  position: sticky;
  top: 0;
  z-index: 10;
  text-align: center;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--accent) 15%, var(--bg));
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 8px;
  transition: opacity 200ms ease;
}

/* ── Empty state ── */
.timeline-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 20px;
  color: var(--text3);
  font-size: 13px;
  text-align: center;
}
.timeline-empty-dots {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.3;
}
.timeline-empty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: transparent;
}
.timeline-empty-line {
  width: 2px;
  height: 16px;
  background: var(--border);
}
```

---

## 6. Data Model

### 6.1 API Endpoint

**`GET /api/projects/{id}/timeline`**

Query parameters:

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 30 | Max events to return (1–100) |
| `offset` | int | 0 | Pagination offset |
| `types` | string | (all) | Comma-separated type filter: `chat,milestone,worker,task,deliverable,status,collaborator` |
| `since` | float | 0 | Unix timestamp — only events after this time |
| `until` | float | (now) | Unix timestamp — only events before this time |

**Response:**

```json
{
  "ok": true,
  "project_id": "abc123",
  "total": 142,
  "offset": 0,
  "limit": 30,
  "events": [
    {
      "id": "evt_1710400800_ms_001",
      "type": "milestone_completed",
      "category": "milestone",
      "timestamp": 1710400800.0,
      "title": "Milestone completed",
      "detail": "Backend API v1",
      "actor": {
        "type": "user",
        "id": "moe",
        "name": "Moe"
      },
      "metadata": {
        "milestone_title": "Backend API v1",
        "milestone_index": 2
      },
      "ref_id": null,
      "task_id": null,
      "groupable": true
    }
  ]
}
```

### 6.2 Event Object Schema

```
{
  id:         string    — Unique event ID (composite: "{type}_{timestamp}_{source_id}")
  type:       string    — Event type ID from the catalog (section 3.1)
  category:   string    — Grouping category: lifecycle|milestone|worker|deliverable|chat|task|phase|collaborator|error
  timestamp:  float     — Unix epoch (seconds)
  title:      string    — Human-readable title (short, ~60 chars max)
  detail:     string    — Extended description (up to 300 chars, may be empty)
  actor: {
    type:     string    — "user" | "worker" | "system" | "porter"
    id:       string    — Username, persona_id, or "system"
    name:     string    — Display name
  }
  metadata:   object    — Type-specific extra fields (milestone title, task priority, file size, etc.)
  ref_id:     string?   — Reference ID (trace_id, run_id, artifact_id — for linking)
  task_id:    string?   — Related task ID if applicable
  groupable:  bool      — Whether this event can be collapsed into a group
}
```

### 6.3 Event Assembly

The backend assembles timeline events by merging data from multiple sources into a unified stream. This is an expansion of the existing `_project_activity_feed()` function.

**New function:** `_project_timeline_feed(project_id, limit, offset, types, since, until)`

Assembly order:

1. **Project config** (`_config["projects"]`): Extract `created_at` for `project_created`. Compare current vs. historical status for `status_changed`. Parse `milestones` array diffs for milestone events.
2. **`trace_steps` table**: Map to `trace_step` events. Filter by `project_id`.
3. **`agent_messages` table**: Map to `dispatch` events. Filter by `project_id`.
4. **`project_tasks` table**: Map `created_at` to `task_created`, `completed_at` to `task_completed`. Status changes require a `project_task_history` table (see section 6.4).
5. **`project_artifacts` table**: Map to `deliverable_uploaded` / `deliverable_linked` based on `source` field.
6. **`project_collaborators` table**: Map `added_at` to `collaborator_added`. Removals require a history mechanism (see section 6.4).

All results are merged, sorted by timestamp descending, and paginated.

### 6.4 Schema Additions

To support richer timeline events (status change history, task status transitions, collaborator removals), a new lightweight audit table is needed:

```sql
CREATE TABLE IF NOT EXISTS project_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL DEFAULT 'system',
    actor_id TEXT DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    detail TEXT DEFAULT '',
    metadata_json TEXT DEFAULT '{}',
    ref_id TEXT DEFAULT '',
    task_id TEXT DEFAULT '',
    created_at REAL NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_project_events_project ON project_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_events_type ON project_events(project_id, event_type, created_at DESC);
```

This table becomes the primary source for timeline events going forward. Existing data from `trace_steps` and `agent_messages` is still merged in for backward compatibility, but new structured events (status changes, milestone toggles, worker assignments, task updates) are written to `project_events` at the point they happen, giving precise timestamps and actor attribution.

**Write points** — each of these existing code paths should `INSERT INTO project_events`:

| Action | Where in porter.py | Event Type |
|---|---|---|
| Project creation | `_create_project()` or equivalent | `project_created` |
| Status change | `/api/projects/{id}` POST with `action: set_status` | `status_changed` |
| Milestone add | POST `action: add_milestone` | `milestone_added` |
| Milestone toggle | POST `action: toggle_milestone` | `milestone_completed` |
| Milestone remove | POST `action: remove_milestone` | `milestone_removed` |
| Worker assign | POST `action: assign_persona` | `worker_assigned` |
| Worker unassign | POST `action: unassign_persona` | `worker_removed` |
| Task create | `/api/projects/{id}/tasks` POST | `task_created` |
| Task complete | `/api/projects/{id}/tasks/{tid}` PATCH | `task_completed` |
| Collaborator add | POST action on collaborators | `collaborator_added` |
| Collaborator remove | DELETE action on collaborators | `collaborator_removed` |
| Artifact upload | POST to artifacts endpoint | `deliverable_uploaded` |

---

## 7. Implementation Notes

### 7.1 Single-File Constraint

All HTML, CSS, and JS live inside `porter.py`. The timeline CSS goes into the existing `<style>` block (alongside other component styles). The timeline JS goes into the project-detail rendering section alongside `_projLoadActivity`, `_renderProjTabContent`, etc.

### 7.2 Migration Path

1. **Phase 1 — Rename + New Table:** Rename tab label from "Activity" to "Timeline". Add `project_events` table to `_ensure_tables()`. Add write points to existing API handlers. Keep current `_projLoadActivity` rendering temporarily.

2. **Phase 2 — New API:** Build `_project_timeline_feed()` merging `project_events` + `trace_steps` + `agent_messages`. Add `/api/projects/{id}/timeline` endpoint. Keep `/api/projects/{id}/activity` as an alias.

3. **Phase 3 — New Renderer:** Replace `_projLoadActivity` with `_projLoadTimeline`. New CSS block. New JS renderer with the graphical timeline, nodes, cards, filters. IntersectionObserver for scroll animations.

4. **Phase 4 — Polish:** Event grouping. Expand/collapse. "Jump to Today". New-event banner. Context menu.

### 7.3 Tab ID Aliasing

In `_projSwitchTab`, add:

```js
if (t === 'activity') t = 'timeline';
```

And update the tab definition:

```js
{id:'timeline', label:'Timeline'}
```

### 7.4 SSE Integration

The existing `_connectProjActivityLive()` and `_scheduleProjActivityRefresh()` functions are reused, renamed to `_connectProjTimelineLive()` and `_scheduleProjTimelineRefresh()`. The SSE subscription logic remains the same — bridge:dispatch, bridge:response, bridge:error, and coordination events trigger a refresh.

### 7.5 Performance

- Initial load: 30 events max. Pagination via scroll.
- The `project_events` table has a compound index on `(project_id, created_at DESC)` so queries are fast.
- Date grouping is done client-side (cheaper than server-side grouping for 30–100 items).
- IntersectionObserver for scroll animations is passive and lightweight.
- Event grouping (collapsing similar events) is done client-side after fetch.

### 7.6 Responsive Behavior

- On narrow viewports (< 600px), the timeline line shifts to `left: 16px`, node size drops to 8px, card offset drops to 32px, and card padding reduces to `10px 12px`.
- Filter pills become horizontally scrollable (overflow-x: auto) instead of wrapping.

### 7.7 Accessibility

- Event cards are focusable (`tabindex="0"`) and expandable via Enter/Space.
- Filter pills are buttons with `aria-pressed` state.
- Date separators use `role="heading"` with `aria-level="3"`.
- The vertical line is decorative (`aria-hidden="true"`).
- Color coding is supplemented by icons — no information is conveyed by color alone.

---

## 8. Open Questions

1. **Chat message granularity:** Should every chat message appear on the timeline, or only the first message per conversation/session? Showing every message could overwhelm the timeline on chat-heavy projects. Recommendation: show one entry per chat session with a message count badge.

2. **Historical backfill:** For existing projects, `project_events` will be empty. The timeline should still work by falling back to `trace_steps` and `agent_messages` data. True structured events (milestones, status changes) will only have entries going forward. This is acceptable — the timeline improves over time.

3. **Worker activity density:** Trace steps and dispatch messages can be very frequent during autonomous work. Consider a "compact mode" toggle that collapses worker activity into summary rows (e.g., "Atlas completed 12 actions" per hour block) vs. the default expanded view.

4. **Phase/workstream context:** If a project has defined workstreams (via the Plan tab), should the timeline show a persistent workstream indicator alongside events? E.g., a small label like `[Backend]` or `[Design]` on events linked to tasks that belong to a workstream. This adds context but also complexity.

---

## 9. Success Criteria

- The Timeline tab is the most visually polished surface in Porter's project workspace.
- A new user opening a project with 20+ events immediately understands the project's history at a glance.
- The graphical timeline (line + nodes + cards) feels intentional and premium, not like a styled list.
- Filtering works instantly (client-side) with no perceptible delay.
- Live events appear smoothly without page jank or layout shifts.
- The design works equally well with 3 events and 300 events.
