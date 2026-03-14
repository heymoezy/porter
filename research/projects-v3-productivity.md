# Projects V3 — Productivity Upgrade

## Research Summary (2026-03-14)

Analyzed: Linear, Notion, Asana, Todoist, Basecamp, GitHub Issues

### Key Patterns from Best-in-Class Apps

**1. Three-layer hierarchy: Project → Workstream → Task**
- Projects contain workstreams (parallel tracks of work)
- Each workstream has tasks (actionable items with owners/due dates)
- Tasks can have subtasks (checklists within tasks)
- This maps to: Porter Project → Phases/Workstreams → Tasks (NEW)

**2. Tasks are first-class citizens**
- Every project needs a todo/task list — the core productivity feature
- Tasks have: title, status (todo/in_progress/done), owner, due date, priority
- Inline creation with minimal friction (type and press Enter)
- Filter/group by: workstream, status, owner, priority
- This is what Porter is MISSING entirely

**3. Deliverables vs Artifacts vs Tasks**
- **Tasks** = things to DO (action items, to-dos)
- **Deliverables** = things to PRODUCE (expected outputs per workstream)
- **Artifacts** = things PRODUCED (actual files, documents, uploads)
- Deliverables are planned expectations; artifacts are actual outputs
- Artifacts can be linked to deliverables to show completion

**4. Plan vs Execution separation**
- Plan = what we're building, why, and how (workstreams, success criteria)
- Execution = what we're doing right now (tasks, activity, timeline)
- Best apps keep these separate but connected

### What Porter Has vs What It Needs

| Feature | Current State | Needed |
|---------|--------------|--------|
| Tasks/Todos | MISSING | Project-scoped task list with status, owner, due |
| Deliverables | Mixed with artifacts in one tab | Planned outputs per workstream |
| Artifacts | Mixed with deliverables | Uploaded files, separate from plan |
| Task inline creation | N/A | Quick-add with Enter key |
| Task filtering | N/A | By workstream, status, owner |
| Workstream deliverables | v0.31.67 added basic list | Need status tracking, linking to artifacts |

### Design Decision

**Add a Tasks system to projects.** This is the #1 missing feature. Every productivity app has it. Porter projects currently have workstreams and milestones but NO way to track individual action items.

**Separate Deliverables tab into two sections:**
- Top: Planned deliverables (from workstreams) with completion status
- Bottom: Artifacts (uploaded files) that can be linked to deliverables

## Implementation: v0.31.69 — Project Tasks + Deliverables Split

### Data Model

**New table: `project_tasks`**
```sql
CREATE TABLE IF NOT EXISTS project_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workstream TEXT DEFAULT '',
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    owner TEXT DEFAULT '',
    due_date TEXT DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    completed_at REAL DEFAULT 0
)
```
- status: todo | in_progress | done
- priority: low | medium | high | urgent
- workstream: links to a phase/workstream name (optional)
- owner: username or worker name

### New Tab: Tasks (replaces nothing — new addition)

Tab order: Overview → Chat → Plan → **Tasks** → Workers → Deliverables → People → Apps → Activity

Tasks tab shows:
- Quick-add bar at top (inline text input + Enter to create)
- Filter row: All | Todo | In Progress | Done | By Workstream dropdown
- Task list: checkbox + title + owner badge + due date + priority dot
- Click task to expand/edit inline
- Group by workstream option

### Deliverables Tab Restructure

**Section 1: Planned Deliverables** (from workstreams)
- Grouped by workstream
- Each deliverable shows: name, status (pending/done), linked artifact count
- Click to toggle status

**Section 2: Artifacts** (uploaded files)
- File grid/list with drag-drop upload
- Each artifact can be tagged to a workstream
- Types: image, video, audio, document, link, text

### New Chat Actions
- `add_task`: {"action":"add_task","title":"...","workstream":"...","owner":"...","due":"YYYY-MM-DD","priority":"medium"}
- `update_task`: {"action":"update_task","title":"exact title","status":"todo|in_progress|done"}
- `remove_task`: {"action":"remove_task","title":"exact title"}

### API Endpoints
- POST /api/workspace/tasks — CRUD for project tasks
  - action: create, list, update, delete, bulk_update

### Context Injection
Add to project chat prompt:
```
Tasks: 3 todo, 2 in progress, 1 done (6 total)
```
