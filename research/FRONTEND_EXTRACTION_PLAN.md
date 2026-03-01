# Phase 4: Frontend Extraction Plan
**Status:** Draft — for Model Coordination
**Target Stack:** React + Tailwind CSS + shadcn/ui + Vite + pnpm

## 1. Overview
Extract the monolithic 18,000+ line `porter.py` HTML/JS into a modern, maintainable React application. The Python backend will remain as a stateless JSON API server.

## 2. Component Architecture
Proposed hierarchy:

- `AppLayout` (Shell)
  - `Sidebar` (Module navigation, Logo, User profile)
  - `ModuleContainer` (Dynamic view loader)
    - `ChatView`
      - `ChatHistory`
      - `MessageList`
      - `ChatInput` (with file picker)
    - `OrchestrationView`
      - `FlowDiagram` (SVG-based)
      - `AgentCardGrid`
      - `ModelCardGrid`
    - `MemoryView`
      - `LayerVisualization`
      - `SessionList`
      - `FileEditor` (Monaco or simple textarea)
    - `FileBrowserView`
      - `Breadcrumbs`
      - `FileTable` (Sorting, selection)
      - `Toolbar` (Upload, New folder)
    - `AdminView`
      - `HealthDashboard`
      - `LogViewer`
      - `ConfigEditor`
  - `OverlayManager` (Modals, Toasts, Keyboard shortcuts)

## 3. State Management
- `TanStack Query` (formerly React Query) for all API interactions (Roots, Nodes, Locations, Agents, Config).
- `Zustand` for global UI state (Active module, Sidebar toggle, Current user).
- `LocalStorage` for chat persistence (syncing with backend).

## 4. API Mapping (Top Priority)
The following endpoints must be strictly maintained for the new frontend:
- `/api/me` - Auth context
- `/api/nodes` / `/api/locations` - Resource discovery
- `/api/chat/stream` - Core AI interaction
- `/api/capabilities` - Feature gating
- `/api/memory/overview` - Knowledge graph

## 5. Execution Steps
1. **Scaffold:** Initialize Vite project in `runtime/frontend`.
2. **Proxy:** Configure Vite proxy to point to existing Porter port (8877).
3. **Extraction:** Port CSS variables and base styles to Tailwind theme.
4. **Implementation:** Migrate modules one by one (Files -> Chat -> Orch -> Admin).
5. **Final Sync:** Update `porter.py` to serve the built static files from `dist/`.

## 6. Model Roles
- **Claude:** Primary component implementation and logic translation.
- **Gemini:** UX review, CSS cleanup, accessibility audit, and competitive analysis.
- **OpenClaw:** QA, regression testing, and API contract verification.
