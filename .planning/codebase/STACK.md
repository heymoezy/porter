# Technology Stack

**Analysis Date:** 2026-03-20

## Languages

**Primary:**
- Python 3 (stdlib only) - Core orchestrator (`porter.py`, ~802KB single file)
- TypeScript 5.9 - Backend API and frontend application
- JavaScript/Node.js - Test framework and build tooling

**Secondary:**
- SQL - SQLite database schema and queries
- HTML/CSS - Frontend UI and styling

## Runtime

**Environment:**
- Python 3 (system `python3` binary, no pip packages)
- Node.js (available via npm-global at `~/.npm-global`)

**Package Manager:**
- npm 10+ - Manages Node.js dependencies
- Lockfile: `package-lock.json` present in root and workspace directories

## Frameworks

**Core:**
- Fastify 5.7.4 - HTTP server framework for backend API (`backend/src/index.ts`)
- React 19.2.0 - Frontend UI library (`frontend/package.json`)
- Vite 8.0.0-beta.13 - Frontend build tool and dev server (`frontend/vite.config.ts`, base: `/v2/`)

**Testing:**
- Playwright 1.58.2 - E2E testing framework (`tests/package.json`, 35 tests)
- Playwright config: headless Chromium, base URL `http://127.0.0.1:8877` (`tests/playwright.config.js`)

**Build/Dev:**
- TypeScript ~5.9 - Compiler for backend and frontend
- tsx 4.21.0 - TypeScript execution for development (`backend/package.json`)
- ESLint 9.39.1 - Linting (`frontend/eslint.config.js`)

## Key Dependencies

**Critical Backend:**
- Drizzle ORM 0.45.1 - Database abstraction layer (`backend/src/db/schema.ts`)
- Better SQLite3 12.6.2 - Native SQLite driver for Node.js
- Zod 4.3.6 - Runtime schema validation
- UUID 13.0.0 - Unique identifier generation

**Backend Networking:**
- @fastify/cors 11.2.0 - CORS middleware
- @fastify/cookie 11.0.2 - Cookie handling
- @fastify/websocket 11.2.0 - WebSocket support
- @fastify/static 9.0.0 - Static file serving

**Frontend State & HTTP:**
- @tanstack/react-query 5.90.21 - Server state management
- Axios 1.13.6 - HTTP client
- Zustand 5.0.11 - Client-side state store

**Frontend UI:**
- React 19.2.0 - UI library
- React DOM 19.2.0 - DOM rendering
- TailwindCSS 4.2.1 - Utility-first CSS framework
- Lucide React 0.575.0 - Icon library
- PostCSS 8.5.6 - CSS processing
- Autoprefixer 10.4.27 - CSS vendor prefixes

**Utilities:**
- systeminformation 5.31.1 - System/OS information collection
- dotenv 17.3.1 - Environment variable loading

## Configuration

**Environment:**
- Config file: `porter_config.json` (via `PORTER_DATA_DIR` env var)
- Required env vars:
  - `PORTER_DATA_DIR` - Porter data directory (default: `~/.porter/`)
  - `PORTER_PORT` - HTTP port (default: `8877`)
  - `PORTER_HOST` - Bind hostname
  - `PORTER_PUBLIC_IP` - Public IP for UI display
  - `BRAVE_API_KEY` - Brave Search integration (optional)
  - `FIRECRAWL_API_KEY` - Web scraping (optional)
  - `SENDGRID_API_KEY` - Email service (optional)
  - `ELEVENLABS_API_KEY` - Text-to-speech (optional)
  - `SERPAPI_KEY` - Search API (optional)
  - `PORTER_CONFIG` - Config file path (default: `<PORTER_DATA_DIR>/porter_config.json`)
  - `PORTER_AGENT_WORKSPACE` - Agent workspace directory
  - `PORTER_OPENCLAW_STATE` - OpenClaw state directory (default: `~/.openclaw`)

**Build:**
- Frontend build output: `frontend/dist/` (vite build, sourcemaps enabled)
- Backend build output: `backend/dist/` (TypeScript compilation)
- Frontend base path: `/v2/` (Vite config)

**Database:**
- SQLite database: `<PORTER_DATA_DIR>/porter.db`
- Log index database: `<PORTER_DATA_DIR>/logs/log_index.db`

## Platform Requirements

**Development:**
- Node.js 18+ (for backend/frontend/tests)
- Python 3.8+ (for orchestrator)
- npm 10+ (package management)

**Production:**
- Deployment target: Linux VPS (systemd service at `~/.config/systemd/user/porter.service`)
- Port: 8877 (localhost only, accessed via SSH tunnel)
- Bound to `127.0.0.1` (never `0.0.0.0`)

**Service:**
- System service: `systemctl --user start|stop|restart|status porter`
- Runtime: Python 3 process running `porter.py`

## Runtime Ports

**Local Development:**
- Frontend dev server: `5173` (Vite dev proxy)
- Backend API: `3001` (Fastify server, development)
- Porter orchestrator: `8877` (main entry point)
- Ollama API: `127.0.0.1:11434` (local model inference)
- OpenClaw gateway: `127.0.0.1:18789` (agent coordination)

---

*Stack analysis: 2026-03-20*
