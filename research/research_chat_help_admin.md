# Porter Feature Research: Chat Engine, Help System, Admin Panel, Consumer Website

**Date:** 2026-02-28
**Researcher:** Claude Opus 4.6
**Context:** Porter is a self-hosted file manager built as a single Python file (stdlib only), serving a web UI on port 8877. It currently has no React — the frontend is vanilla JS/HTML/CSS served from the Python backend.

---

## Table of Contents

1. [Chat Engine](#1-chat-engine)
2. [Help System](#2-help-system)
3. [Admin Panel](#3-admin-panel)
4. [Consumer-Facing Website](#4-consumer-facing-website)
5. [Recommendations for Porter](#5-recommendations-for-porter)

---

## 1. Chat Engine

### 1.1 The Landscape: How Others Do It

#### Cursor / Windsurf Architecture
Both are VS Code forks with embedded AI chat. Key patterns:

- **Cursor** uses an assistant-style chat (conversational coding helper) plus an Agent mode that can search the codebase, plan changes, open files, apply edits, and run commands. Context is developer-driven — users manually curate what the AI sees using `@` symbols to reference files/folders. Practical context: 10,000-50,000 tokens.
- **Windsurf** defaults to agentic mode with deep codebase awareness via its "Cascade" feature. Uses RAG-based automatic context selection (~200,000 tokens). Indexes and pulls relevant code automatically.
- Both proxy all model calls through their own servers (the user never talks directly to OpenAI/Anthropic). This enables usage tracking, caching, and model routing.

#### Open WebUI (formerly Ollama-WebUI)
The most mature self-hosted chat interface. Key architecture:
- Built with SvelteKit, uses Docker/Kubernetes deployment
- Supports Ollama + OpenAI-compatible APIs (provider-agnostic)
- Features: RAG with 9 vector database options, voice/video calls, web search (15+ providers), native Python function calling, model builder
- Full ChatGPT-style UI with conversation history, model switching, system prompts
- **Lesson for Porter:** This is what a full-featured self-hosted chat looks like. Porter doesn't need to replicate all of this — but the architecture (proxy gateway + multi-model routing) is the right pattern.

#### HuggingFace Chat-UI
Powers HuggingChat. Architecture:
- SvelteKit app with MongoDB backend
- Supports OpenAI-compatible APIs via `OPENAI_BASE_URL`
- Multi-model with client-side routing (Omni/Arch router picks backends per message)
- MCP tool support (function calling)
- Multimodal support (images via IDEFICS, OpenAI, Claude 3)
- **Lesson for Porter:** Model discovery from `/models` endpoint is elegant. Porter already has OpenClaw — could use the same pattern.

### 1.2 Chat UI Libraries (No-Framework / Vanilla JS)

Since Porter is stdlib-only Python with vanilla JS frontend, React libraries are out. Options:

| Library | Framework | Key Features | Stars | Notes |
|---------|-----------|-------------|-------|-------|
| **NLUX** | Vanilla JS + React | Streaming, markdown rendering, LLM adapters, zero deps, custom personas | ~2k | Best fit for Porter. Has `@nlux/core` for vanilla JS. Markdown stream parser built in. |
| **ChatUX** (riversun) | Vanilla JS | Lightweight, mobile+desktop, framework-agnostic | ~400 | Simple but limited |
| **ChatUI** (svift-org) | Vanilla JS | Separates view from controller/model | ~200 | Clean architecture but small community |
| **Chatscope** | React only | Full component kit (MainContainer, ChatContainer, MessageList, etc.) | ~1.5k | Not usable without React |
| **MinChat** | React only | Similar to chatscope | ~300 | Not usable without React |

**Recommendation:** For Porter's vanilla JS approach, the best path is to **build a custom chat UI** directly in the existing codebase. The chat UI is fundamentally simple: a message list, an input box, and a send button. Porter already has the CSS design system. Using a library would mean adding npm dependencies, which conflicts with the single-file stdlib-only philosophy.

If Porter ever adopts a build step, NLUX would be the top choice — it has vanilla JS support, streaming, markdown rendering, and zero dependencies.

### 1.3 Streaming: SSE vs WebSocket

**Verdict: SSE wins for Porter.**

| Factor | SSE | WebSocket |
|--------|-----|-----------|
| Direction | Server -> Client (unidirectional) | Bidirectional |
| Protocol | HTTP (standard) | WS (separate protocol) |
| Reconnection | Automatic | Manual implementation needed |
| Proxy/firewall | Works everywhere | Can be blocked |
| Implementation | ~20 lines of Python | Complex handshake + frame parsing |
| Stdlib Python | Yes (just HTTP response headers) | Requires `websockets` library or manual impl |
| HTTP/2 | Native multiplexing | N/A |
| Use case fit | LLM streaming (80% of "real-time" needs) | Gaming, collaborative editing |

**Why SSE for Porter:**
1. Porter is stdlib-only Python. SSE is just HTTP with `Content-Type: text/event-stream` and `\n\n`-delimited messages. No library needed.
2. Chat with LLMs is fundamentally request-response with streaming: user sends a message (POST), server streams tokens back (SSE). There's no need for the client to send data mid-stream.
3. User messages go via normal POST requests. Only the response streams via SSE.
4. Auto-reconnection is built into the browser's `EventSource` API.

**Python stdlib SSE implementation pattern:**
```python
def handle_chat_stream(self):
    self.send_response(200)
    self.send_header('Content-Type', 'text/event-stream')
    self.send_header('Cache-Control', 'no-cache')
    self.send_header('Connection', 'keep-alive')
    self.end_headers()

    for token in generate_response(prompt):
        data = json.dumps({"token": token})
        self.wfile.write(f"data: {data}\n\n".encode())
        self.wfile.flush()
```

### 1.4 Multi-Model Chat Architecture

**The Key Question: Should Porter proxy all model calls (gateway) or let the UI talk directly to APIs?**

#### Option A: Porter as Gateway (Proxy Pattern)
```
Browser <-> Porter Backend <-> [Claude API, OpenAI API, Ollama, OpenClaw]
```

**Pros:**
- API keys never touch the browser (security)
- Centralized usage tracking, cost management, rate limiting
- Audit logs — every conversation logged server-side
- Can inject context (user's files, project info) before forwarding to model
- Can cache responses, implement fallbacks
- Single CORS policy
- Porter already has OpenClaw bridge infrastructure

**Cons:**
- Porter becomes a bottleneck (all traffic goes through it)
- More complex backend code
- Latency added (one extra hop)

#### Option B: Direct API Calls from Browser
```
Browser <-> [Claude API, OpenAI API, Ollama]
Browser <-> Porter Backend (for file context only)
```

**Pros:**
- Simpler backend
- Lower latency
- No bottleneck

**Cons:**
- API keys in the browser (major security issue)
- No centralized tracking
- CORS issues with every provider
- Can't inject server-side context easily
- Each provider has different API format

#### Option C: Hybrid via LiteLLM
LiteLLM is an open-source proxy that unifies 100+ LLM APIs into one OpenAI-compatible interface. It handles:
- Translation between API formats
- Cost tracking per user/project
- Rate limiting and budgets
- Load balancing across models
- 8ms P95 latency at 1k RPS

**However:** LiteLLM is a Python package (not stdlib), requires pip install, and runs as a separate service. This violates Porter's stdlib-only constraint.

**Recommendation: Option A (Porter as Gateway).**

Reasons:
1. Security — API keys must never be in the browser
2. Porter already has the OpenClaw bridge pattern (Sprint 10)
3. Context injection is the killer feature — the AI can see the user's files, projects, and memory
4. Usage tracking is essential for the admin panel (see Section 3)
5. The "one extra hop" latency is negligible compared to LLM inference time
6. Porter can implement a simple model registry: each model entry has (name, provider, endpoint, api_key, capabilities)

### 1.5 Chat with Context (The Killer Feature)

What makes Porter's chat different from just using ChatGPT:

1. **File Context:** User selects files in Porter's file browser, then chats about them. Porter reads the file content and injects it into the prompt.
2. **Project Context:** Porter knows about the user's projects (task registry, sprint plans, release notes). The AI has this context automatically.
3. **Memory Context:** Porter has session memory and user preferences. The AI remembers past conversations and user patterns.
4. **Action Context:** The AI can trigger Porter actions — create files, run tasks, update project status — not just talk.

This is the Cursor/Windsurf pattern applied to a file manager instead of an IDE.

### 1.6 Chat History Persistence

Options for storing chat history:

| Storage | Capacity | Persistence | Complexity | Porter Fit |
|---------|----------|------------|------------|------------|
| **Server-side JSON files** | Unlimited | Survives browser clear | Simple | Best fit |
| **IndexedDB (browser)** | ~50MB-unlimited | Per-browser, per-origin | Moderate | Good for offline |
| **localStorage** | 5-10MB | Per-browser | Simple | Too small |
| **SQLite (browser OPFS)** | Unlimited | Per-browser | Complex | Overkill |
| **SQLite (server)** | Unlimited | Centralized | Moderate | Good but adds dep |

**Recommendation:** Server-side JSON files in `PORTER_DATA_DIR/chat/`. Each conversation is a JSON file with messages, model used, timestamps, and context references. This is consistent with Porter's existing pattern (config, memory, task registry are all JSON files on disk). IndexedDB can be used as a cache layer for offline access.

### 1.7 Summary: Chat Engine Architecture

```
+------------------+     POST /api/chat     +------------------+
|                  | ───────────────────────>|                  |
|   Browser Chat   |                        |  Porter Backend  |
|   (Vanilla JS)   |     SSE stream         |  (Python stdlib) |
|                  | <───────────────────────|                  |
+------------------+                        +--------+---------+
                                                     |
                                            +--------+---------+
                                            |  Model Registry   |
                                            |  (JSON config)    |
                                            +--------+---------+
                                                     |
                                    +----------------+----------------+
                                    |                |                |
                              +-----+-----+   +-----+-----+   +-----+-----+
                              |  Ollama   |   |  OpenClaw  |   |  Claude/  |
                              |  (local)  |   |  Gateway   |   |  OpenAI   |
                              +-----------+   +-----------+   +-----------+
```

---

## 2. Help System

### 2.1 Guided Tour Libraries

For onboarding walkthroughs and contextual tooltips:

| Library | Size | Dependencies | Features | Maintenance |
|---------|------|-------------|----------|-------------|
| **Driver.js** | 5KB | None | Highlighting, step-by-step, popover, overlay | Active, most popular |
| **Shepherd.js** | 25KB | Popper.js | Rich tours, accessibility, theming, events | Active, mature |
| **Intro.js** | 15KB | None | Steps, hints, progress bar | Active but commercial license for non-OSS |
| **TourGuide.js** | 12KB | None | Steps, groups, dialog mode | Active |
| **React Joyride** | React only | React | Beacons, tooltips, controlled/uncontrolled | Active |

**Recommendation: Driver.js.**

Reasons:
1. Zero dependencies (matches Porter's philosophy)
2. 5KB — tiny footprint
3. Works with vanilla JS (no React needed)
4. Powerful element highlighting with popover system
5. Can create multi-step product tours
6. Can be loaded from CDN — no build step needed
7. Most actively maintained of the framework-agnostic options

**Implementation pattern for Porter:**
```javascript
// Load from CDN
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/driver.js/dist/driver.css"/>
<script src="https://cdn.jsdelivr.net/npm/driver.js/dist/driver.js.iife.js"></script>

// Define tour per tab
const tours = {
  files: [
    { element: '#file-area', popover: { title: 'File Browser', description: 'Browse and manage your files here.' }},
    { element: '#upload-btn', popover: { title: 'Upload', description: 'Drag and drop or click to upload files.' }},
  ],
  projects: [
    { element: '#project-list', popover: { title: 'Projects', description: 'View and manage your active projects.' }},
  ]
};

// Contextual — shows tour for current tab
function startTour() {
  const currentTab = getCurrentTab();
  const driver = new Driver({ showProgress: true });
  driver.defineSteps(tours[currentTab]);
  driver.start();
}
```

### 2.2 Contextual Help Patterns

Modern in-app help is not a static manual. Best patterns:

1. **Contextual Tooltips:** Help icon (?) next to each feature. Clicking shows a popover explaining that specific feature. Changes based on which tab/section the user is viewing.

2. **Command Palette Help:** `Cmd+K` or `/help` opens a searchable help overlay. Type a question, get instant results from embedded docs.

3. **Empty State Guidance:** When a section has no data (e.g., no projects, no chat history), show helpful prompts: "Get started by creating your first project" with a CTA button.

4. **Progressive Disclosure:** Don't show all help at once. Show basic help for new users, advanced help as they use more features.

5. **Inline Documentation:** Each tab has a subtle "Learn more" link that expands to show documentation for that specific feature, right in the UI.

### 2.3 AI-Powered Help (RAG on Porter's Own Docs)

**The Question: Should help be AI-powered?**

**Yes, but as an enhancement, not the foundation.**

Architecture:
1. Porter's documentation (SPRINT_PLAN.md, RELEASE_NOTES.md, feature docs) is chunked and embedded
2. When user asks "How do I flush a session?", Porter searches its docs using simple keyword/TF-IDF matching (no vector DB needed for a small doc corpus)
3. The matching doc chunks are sent to the configured LLM with the user's question
4. The LLM generates a contextual answer citing Porter's own docs

**For Porter specifically:**
- The doc corpus is small (maybe 10-20 documents). Full-blown RAG with vector databases is overkill.
- Simple keyword search + BM25 ranking would work fine with stdlib only.
- The chat engine (Section 1) already handles LLM communication. Help queries are just a specialized chat with a system prompt: "You are Porter's help assistant. Answer using only the provided documentation."
- **Fallback:** If no LLM is configured, show static documentation search results.

**Implementation levels:**
1. **Level 0 (No AI):** Static help pages, searchable via Ctrl+F or simple JS search
2. **Level 1 (Keyword Search):** Search across all help content, show matching sections
3. **Level 2 (AI-Enhanced):** Send search results + user question to LLM for a synthesized answer
4. **Level 3 (Full RAG):** Embeddings + vector search + LLM — overkill for Porter's scale

**Recommendation: Start at Level 1, enable Level 2 when chat engine is built.**

### 2.4 Documentation: Embedded vs External

| Approach | Pros | Cons |
|----------|------|------|
| **Embedded in Porter UI** | Always available, contextual, no separate hosting | Increases bundle size, harder to maintain |
| **External docs site** | SEO, shareable URLs, community contributions | Separate deployment, not contextual |
| **Hybrid** | Best of both worlds | More work |

**Documentation site generators (if external):**

| Tool | Type | Cost | Self-Hosted | Best For |
|------|------|------|-------------|----------|
| **Docusaurus** | React-based SSG | Free/OSS | Yes | Full control, versioning, i18n |
| **Mintlify** | AI-native docs platform | $0-300/mo | No (SaaS) | Beautiful docs with AI search |
| **GitBook** | Collaborative docs | Free-$$$  | No (SaaS) | Mixed tech/non-tech teams |
| **Astro Starlight** | Astro-based docs | Free/OSS | Yes | Lightweight, fast, simple |
| **11ty** | Minimal SSG | Free/OSS | Yes | Maximum simplicity |

**Recommendation for Porter: Hybrid approach.**
- **Embedded:** Contextual help tooltips, guided tours (Driver.js), help panel in the UI
- **External:** Full documentation site (Docusaurus or Astro Starlight) for comprehensive guides, API docs, tutorials
- **Bridge:** The embedded help links to external docs for "Learn more" deep dives

---

## 3. Admin Panel

### 3.1 What Admin Features Does Porter Need?

Porter is single-user today but multi-user is on the roadmap. Admin features by priority:

#### Must Have (Single-User)
- **System Health Dashboard:** Service status (Ollama, OpenClaw, Porter itself), disk usage, memory, uptime
- **Configuration Management:** Edit Porter config from the UI (mounts, port, models, integrations)
- **Model/Service Health Checks:** Ping configured models, show latency, availability (Sprint 11 already does some of this)
- **Logs Viewer:** View Porter server logs, filter by level/time
- **Backup/Restore:** Export/import Porter config, chat history, project data

#### Should Have (Multi-User)
- **User Management:** Create/edit/delete users, assign roles (admin, editor, viewer)
- **RBAC:** Role-based access control for file paths, features, models
- **Audit Logs:** Who did what, when (file uploads, deletions, config changes, chat sessions)
- **Usage Analytics:** Per-user model usage, token counts, cost tracking
- **Session Management:** View active sessions, force logout

#### Nice to Have (Scale)
- **Billing Dashboard:** Usage-based billing if Porter becomes a multi-tenant SaaS
- **API Key Management:** Generate/revoke API keys for programmatic access
- **Webhooks:** Configure event webhooks (on file upload, on task complete, etc.)
- **Plugin/Extension Management:** Enable/disable extensions, configure integrations

### 3.2 Admin Panel Frameworks

| Framework | Language | Backend Required | Customization | Best For |
|-----------|----------|-----------------|---------------|----------|
| **React Admin** | React/TS | Any REST/GraphQL API | High (MUI-based) | Full-featured B2B apps |
| **Refine** | React/TS | Any (REST, GraphQL, Supabase, etc.) | Very High (UI-agnostic) | Flexible admin panels |
| **AdminJS** | Node.js | Integrates with Node ORMs | High | Node.js apps with existing DB |
| **TailAdmin** | React/TS | N/A (template) | Template-based | Quick dashboard builds |
| **CoreUI** | React/TS | N/A (component lib) | Component-based | Custom dashboards |

**However — none of these fit Porter.**

Porter is a single Python file with no React, no Node.js, no build step, no npm. Using any of these frameworks would require:
1. Adding React/Node.js to the stack
2. A build pipeline
3. Separate frontend hosting or bundling

### 3.3 Porter-Native Admin Panel Approach

**Recommendation: Build the admin panel as another tab in Porter's existing UI, using the same vanilla JS + CSS approach.**

The admin panel is fundamentally a set of API endpoints + UI components:

```
Admin Tab
├── System Health
│   ├── Service status cards (Porter, Ollama, OpenClaw)
│   ├── Disk/memory/CPU gauges
│   └── Uptime counter
├── Configuration
│   ├── Mounts editor (add/remove/edit serve directories)
│   ├── Model registry editor
│   ├── Integration settings (OpenClaw, Ollama endpoints)
│   └── Port/host/security settings
├── Logs
│   ├── Log viewer with level filter
│   ├── Search
│   └── Auto-scroll / tail mode
├── Models
│   ├── Configured models list with health status
│   ├── Latency/availability history
│   └── Usage statistics per model
└── (Future: Users, Audit, Billing)
```

**Backend API endpoints needed:**
```
GET  /api/admin/health          → system health metrics
GET  /api/admin/config          → current configuration
POST /api/admin/config          → update configuration
GET  /api/admin/logs?level=&after=  → filtered logs
GET  /api/admin/models          → model registry with health
POST /api/admin/models/test     → test a model connection
GET  /api/admin/usage           → usage statistics
```

**Key design patterns from SaaS admin dashboards (2025):**
- Customizable widget layouts (users can rearrange dashboard cards)
- Dark mode / adaptive themes (Porter already has dark mode)
- Role-based UI — dynamically show/hide features based on user role
- Real-time data with auto-refresh (polling or SSE)
- Searchable, filterable data tables for logs and usage data

### 3.4 Audit Log Architecture

For the audit log specifically (critical for multi-user):

```python
# Audit log entry structure
{
    "timestamp": "2026-02-28T14:30:00+08:00",
    "user": "moe",
    "action": "file.upload",
    "resource": "/documents/porter/patch.py",
    "details": {"size": 4096, "mime": "text/x-python"},
    "ip": "100.85.184.74",
    "session_id": "abc123"
}
```

Storage: Append-only JSON lines file (`PORTER_DATA_DIR/audit/YYYY-MM-DD.jsonl`). One file per day, rotated automatically. Simple, greppable, no database needed.

---

## 4. Consumer-Facing Website

### 4.1 SaaS Website Structure

Based on analysis of 100+ dev tool landing pages and SaaS best practices, Porter's website needs:

#### Essential Pages
| Page | Purpose | Priority |
|------|---------|----------|
| **Home / Landing** | Hero + value prop + social proof + CTA | P0 |
| **Features** | Detailed feature breakdown with visuals | P0 |
| **Pricing** | Plans, comparison table, FAQ | P1 |
| **Docs** | User documentation (link to doc site) | P0 |
| **Blog** | Updates, tutorials, thought leadership | P1 |
| **Changelog** | Release history (can auto-generate from RELEASE_NOTES.md) | P1 |
| **About** | Story, team, mission | P2 |
| **Contact / Support** | Support channels, community links | P2 |

#### Navigation
Keep it to 5-7 items max: Home, Features, Pricing, Docs, Blog, (Changelog as sub-nav or footer)

### 4.2 Landing Page Best Practices (2025-2026)

From the Evil Martians study of 100+ dev tool landing pages (Linear, Vercel, Supabase):

**Hero Section:**
- Centered layout dominates: bold headline + supporting visual below
- Headline should state the outcome, not the product ("Manage your files, models, and workflows in one place" not "Porter is a file manager")
- Supporting visual options:
  1. **Animated product UI** — shows movement, more product surface
  2. **Static product screenshot** — simpler to implement, still effective
  3. **Switchable UI** — great if product has multiple use cases (file management, chat, projects)
  4. **Live embed** — power move if the tool is simple enough to demo inline

**Social Proof:**
- GitHub stars, usage stats, awards
- Customer logos (when available)
- Testimonials with real names/handles
- G2 badges, SOC 2 compliance badges

**Conversion Optimization:**
- Minimize form fields (name + email only)
- "No credit card required" reduces friction
- Lead with measurable outcomes ("Deploy in 5 minutes", "Zero dependencies")
- Interactive demos > static screenshots

**Content Strategy:**
- Show the product, don't just describe it
- Use case-specific sections (for developers, for teams, for personal use)
- Comparison tables (Porter vs Dropbox vs Google Drive vs custom scripts)

### 4.3 Tech Stack for the Website

#### Option A: No-Code Builder
| Builder | Best For | Cost | Self-Hosted |
|---------|----------|------|-------------|
| **Framer** | Design-first, fast launch, startup aesthetic | $5-30/mo | No |
| **Webflow** | Content-heavy, SEO, scalable | $14-39/mo | No |
| **Carrd** | Simple single-page | $9/yr | No |

**Framer** is the current favorite for SaaS startups (500k+ MAU, $2B valuation). Trusted by Miro, Perplexity. Best for visual landing pages. 68% of SaaS startups now use no-code builders.

#### Option B: Static Site Generator (Self-Hosted)
| SSG | Language | Build Speed | Learning Curve | Best For |
|-----|----------|-------------|---------------|----------|
| **Astro** | JS/TS | Fast | Low | Content-first sites, landing pages |
| **11ty (Eleventy)** | JS | Very fast | Very low | Simple sites, blogs |
| **Next.js** | React/TS | Medium | Medium | Interactive sites with SSR needs |
| **Hugo** | Go | Fastest | Medium | Large content sites |
| **Docusaurus** | React | Medium | Low | Documentation-focused sites |

**Astro is the top recommendation for Porter:**
1. Pre-renders every page as static HTML by default (fast, SEO-friendly)
2. "Islands architecture" — add interactivity only where needed
3. Can use any UI framework (or none) for interactive components
4. Built-in markdown/MDX support for blog/changelog
5. Minimal JavaScript shipped to the client
6. Can host on any static hosting (Vercel, Netlify, Cloudflare Pages, or Porter itself)

#### Option C: Custom HTML/CSS/JS (Simplest)
For a self-hosted tool like Porter, the simplest option is hand-coded HTML:
- Zero build step
- Zero dependencies
- Porter can serve it from its own `/home/websites/porter.dev/` directory
- Tailwind CSS via CDN for styling
- Total control

**Tradeoff:** More manual work for blog/changelog updates, no templating.

#### Evil Martians LaunchKit
Evil Martians released a free, open-source template specifically for dev tool landing pages based on their 100-page study. Available at launchkit.evilmartians.io. Worth evaluating as a starting point.

### 4.4 Recommendation for Porter's Website

**Phase 1 (MVP): Astro + Tailwind, self-hosted.**
- Home page with hero, features overview, CTA
- Changelog page (auto-generated from RELEASE_NOTES.md)
- Docs link (to Docusaurus/Starlight docs site)
- Hosted at porter.dev or similar, served from `/home/websites/`

**Phase 2 (Growth): Add blog, pricing, comparison pages.**
- Blog with MDX for rich content
- Pricing page with plans
- Comparison page (Porter vs alternatives)
- SEO optimization

**Phase 3 (Scale): Interactive demos, community.**
- Embedded product demo on landing page
- Community forum or Discord integration
- API documentation
- Case studies

---

## 5. Recommendations for Porter

### 5.1 Priority Order

1. **Chat Engine** — Highest impact. Users already interact with LLMs via OpenClaw; embedding chat directly in Porter is the natural next step. Porter becomes the unified workspace (files + chat + projects).

2. **Admin Panel** — Second priority. System health, config management, and logs are needed NOW for operational visibility. Can be built incrementally as a new tab.

3. **Help System** — Third. Start with Driver.js guided tours + contextual tooltips. AI-powered help comes free once the chat engine is built.

4. **Consumer Website** — Fourth. Porter needs a public face, but the product must be solid first. Can be built in a weekend with Astro once the other features are stable.

### 5.2 Architecture Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Chat streaming protocol | SSE | Stdlib-compatible, simple, sufficient for LLM streaming |
| Model routing | Porter as gateway (proxy) | Security (keys on server), context injection, usage tracking |
| Chat UI framework | Custom vanilla JS | Consistent with existing codebase, no new deps |
| Chat history storage | Server-side JSON files | Consistent with existing patterns, no DB needed |
| Help tours | Driver.js (CDN) | Zero deps, 5KB, vanilla JS, powerful |
| AI help | Chat engine + doc search | Reuses chat infrastructure, simple keyword search |
| Admin panel | New tab in Porter UI | Consistent UX, no separate app |
| Audit logs | Append-only JSONL | Simple, greppable, no DB |
| Consumer website | Astro SSG, self-hosted | Fast, minimal deps, markdown-native |
| Docs site | Docusaurus or Astro Starlight | OSS, self-hosted, versioning |

### 5.3 What NOT to Do

1. **Don't add React.** Porter's strength is its simplicity. Adding React means adding a build step, node_modules, and complexity.
2. **Don't use LiteLLM.** It's a pip dependency. Porter should implement its own simple model registry and proxy.
3. **Don't build a vector database for RAG.** Porter's doc corpus is tiny. Simple keyword search is sufficient.
4. **Don't use a SaaS landing page builder.** Porter is self-hosted software; its website should demonstrate that philosophy.
5. **Don't build all four features at once.** Chat engine first, then admin panel, then help system, then website.

### 5.4 Estimated Complexity

| Feature | Backend Work | Frontend Work | Total Estimate |
|---------|-------------|---------------|----------------|
| Chat Engine (basic) | Model proxy, SSE streaming, history storage | Chat UI, message rendering, model picker | 2-3 sprints |
| Chat Engine (context) | File/project context injection, memory | Context panel, file attachment UI | 1-2 sprints |
| Admin Panel (basic) | Health endpoints, config API, logs API | Dashboard UI, config editor, log viewer | 1-2 sprints |
| Admin Panel (multi-user) | User auth, RBAC, audit logging | User management UI, audit log viewer | 2-3 sprints |
| Help System | Doc search endpoint | Driver.js tours, help panel, search UI | 1 sprint |
| Consumer Website | Static file serving | Astro site build | 1 sprint |

---

## Sources

### Chat Engine
- [Chatscope Chat UI Kit](https://github.com/chatscope/chat-ui-kit-react)
- [NLUX - Conversational AI JavaScript Library](https://docs.nlkit.com/nlux)
- [ChatUX - Vanilla JS Chat Library](https://github.com/riversun/chatux)
- [SSE vs WebSocket for Real-Time Chat](https://dev.to/divyanshulohani/implementing-real-time-chat-with-sse-vs-websockets-and-why-i-chose-one-2mn2)
- [SSE's Comeback in 2025](https://portalzine.de/sses-glorious-comeback-why-2025-is-the-year-of-server-sent-events/)
- [Comparing Real-Time Communication for LLM Workflows](https://tech-depth-and-breadth.medium.com/comparing-real-time-communication-options-http-streaming-sse-or-websockets-for-conversational-74c12f0bd7bc)
- [Streaming AI Responses: WebSocket vs SSE vs gRPC](https://medium.com/@pranavprakash4777/streaming-ai-responses-with-websockets-sse-and-grpc-which-one-wins-a481cab403d3)
- [MultipleChat - All AI Models in One Platform](https://multiple.chat/)
- [Askimo - Multi-AI Desktop Chat App](https://askimo.chat/app/)
- [Building a Multi-AI Chat Platform](https://medium.com/@reactjsbd/building-a-complete-multi-ai-chat-platform-chatgpt-claude-gemini-grok-in-one-interface-4295d10e3174)
- [LiteLLM - Unified LLM API Gateway](https://docs.litellm.ai/)
- [LiteLLM GitHub](https://github.com/BerriAI/litellm)
- [Cursor vs Windsurf Comparison](https://www.qodo.ai/blog/windsurf-vs-cursor/)
- [Windsurf vs Cursor Architecture](https://www.builder.io/blog/windsurf-vs-cursor)
- [HuggingFace Chat-UI](https://github.com/huggingface/chat-ui)
- [Open WebUI (Self-Hosted AI Platform)](https://github.com/open-webui/open-webui)
- [Open WebUI Features](https://docs.openwebui.com/features/)
- [MCP Gateways Developer Guide](https://composio.dev/blog/mcp-gateways-guide)
- [API Gateway vs AI Gateway](https://konghq.com/blog/learning-center/api-gateway-vs--ai-gateway)
- [IndexedDB Chat Persistence](https://hejoseph.com/dev/docs/Portfolio/Chatbot/persist-chat-data/)
- [SQLite Persistence on the Web (2025)](https://www.powersync.com/blog/sqlite-persistence-on-the-web)
- [Python SSE Implementation](https://towardsdatascience.com/introducing-server-sent-events-in-python/)

### Help System
- [Driver.js - Product Tours & Highlights](https://npm-compare.com/driver.js,intro.js,shepherd.js,vue-tour)
- [Shepherd.js - Guide Your Users](https://www.shepherdjs.dev/)
- [Best Open-Source Product Tour Libraries](https://userorbit.com/blog/best-open-source-product-tour-libraries)
- [5 Best React Onboarding Libraries in 2026](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared)
- [DocsBot AI - Custom Chatbots from Documentation](https://docsbot.ai/)
- [Build a RAG-Powered Markdown Documentation Assistant](https://developer.ibm.com/tutorials/build-rag-assistant-md-documentation/)
- [RAG Agent with LangChain](https://docs.langchain.com/oss/python/langchain/rag)

### Admin Panel
- [Admin Dashboard UI/UX Best Practices 2025](https://medium.com/@CarlosSmith24/admin-dashboard-ui-ux-best-practices-for-2025-8bdc6090c57d)
- [Admin Dashboard Ultimate Guide 2026](https://www.weweb.io/blog/admin-dashboard-ultimate-guide-templates-examples)
- [SaaS User Management Guide 2025](https://www.zluri.com/blog/saas-user-management)
- [Audit Logs: Building an Accountable System](https://medium.com/@kamalmeet/audit-logs-building-an-accountable-system-ec9e20275102)
- [Refine - React Admin Framework](https://github.com/refinedev/refine)
- [React Admin - B2B App Framework](https://marmelab.com/react-admin/)
- [AdminJS Documentation](https://docs.adminjs.co/)
- [React-Admin vs Refine Comparison](https://marmelab.com/blog/2023/07/04/react-admin-vs-refine.html)

### Consumer Website
- [Evil Martians: 100 Dev Tool Landing Pages Study](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)
- [LaunchKit - Free Dev Tool Landing Page Template](https://launchkit.evilmartians.io/)
- [SaaS Landing Page Trends 2026](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
- [Best SaaS Landing Pages 2026](https://fibr.ai/landing-page/saas-landing-pages)
- [AI SaaS Landing Page Examples](https://grooic.com/blog/best-ai-saas-landing-page-examples)
- [Top Landing Page Builders for SaaS Startups 2026](https://userjot.com/blog/top-landing-page-builders-saas-startups-2025)
- [SaaS Website Structure Planning Guide](https://www.webstacks.com/blog/how-to-plan-a-website-structure-for-saas)
- [SaaS Website Best Practices](https://www.rocktherankings.com/saas-website-best-practices/)
- [Top 5 Static Site Generators 2025](https://cloudcannon.com/blog/the-top-five-static-site-generators-for-2025-and-when-to-use-them/)
- [Next.js vs Astro for Marketing Websites](https://makersden.io/blog/nextjs-vs-astro-in-2025-which-framework-best-for-your-marketing-website)
- [Framer vs Webflow 2026](https://www.pixeto.co/blog/framer-vs-webflow-which-no-code-builder-wins)
- [Best Developer Documentation Tools 2025](https://dev.to/infrasity-learning/best-developer-documentation-tools-in-2025-mintlify-gitbook-readme-docusaurus-10fc)
- [Mintlify vs GitBook vs Docusaurus Comparison](https://getoden.com/blog/mintlify-vs-gitbook-vs-readme-vs-docusaurus)
