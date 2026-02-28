# Porter — 100-Day Implementation Plan
**Start date:** 2026-02-22
**End date:** 2026-06-02
**Owner:** Claude Code (autonomous) + User (at flagged decision points)

---

## How This Plan Works

Each day has a primary deliverable and specific tasks. Items marked **🙋 USER** require the user's involvement. Everything else is autonomous. The plan is structured in five phases, each building on the last.

**The goal at day 100:** A polished open source product on GitHub with 200+ stars, a live marketing website, Docker distribution, integrations with Coolify and Portainer, and a waitlist open for Porter Cloud.

---

## Phase Overview

| Phase | Days | Focus | Exit Criteria |
|---|---|---|---|
| 1 — Foundation | 1–20 | App polish, repo, docs | v0.1 shipped on GitHub |
| 2 — Website & Launch | 21–40 | Landing page, community launch | 100 GitHub stars |
| 3 — Feature Depth | 41–65 | v0.2 features, Docker | v0.2 shipped |
| 4 — Integrations | 66–85 | Coolify, Portainer, API | One-click deploys live |
| 5 — Cloud Tier | 86–100 | Auth, Stripe, waitlist | Cloud beta open |

---

## Phase 1 — Foundation (Days 1–20)

**Goal:** A genuinely polished v0.1 that a stranger could discover on GitHub and deploy in under 5 minutes.

---

### Week 1 — App Polish (Days 1–7)

**Day 1 — Multi-file upload**
- Replace single-file upload with multi-file queue
- Upload files sequentially, showing per-file progress
- Display queue list in upload progress bar: "Uploading 2 of 5: report.pdf"
- Handle partial failure: continue queue, report which failed at end
- Test: drag 5 files onto the browser, verify all land correctly

**Day 2 — File preview panel**
- Add slide-in preview panel triggered by clicking a file (not downloading)
- Supported types in preview:
  - Images (PNG, JPG, GIF, SVG, WebP): render inline `<img>`
  - Markdown (.md): render as HTML (implement basic renderer — no library dependency)
  - Plain text (.txt, .log, .env, .sh, .py, .js, .json, .yaml, .toml, .csv): syntax-highlighted `<pre>`
  - PDF: embed with `<iframe>` + native browser renderer
  - Unsupported: show "Preview not available — download to view"
- Preview panel: 480px wide, slides in from right, close with Escape or ✕

**Day 3 — Keyboard shortcuts**
- `Escape` — close any open modal, dropdown, or preview
- `n` — new folder (when not in an input)
- `u` — trigger upload
- `Backspace` — navigate up one directory level
- `/` — focus a future search bar (stub the UI, implement search in Phase 3)
- Display keyboard shortcut hints in a `?` overlay accessible from header

**Day 4 — Sort and refresh**
- Add sort controls to list header: click Name/Size/Modified to sort ascending/descending
- Sort state persists per-session per root (localStorage)
- Add refresh button to toolbar (re-fetches current directory without full page reload)
- Add loading skeleton animation: grey animated bars appear while listing loads

**Day 5 — Mobile-responsive layout**
- Sidebar collapses to a bottom navigation bar below 768px
- File row: hide Size column below 600px, hide Modified below 480px
- Upload and actions work correctly on touch
- Test on Chrome mobile emulator at 390px width

**Day 6 — Error states and edge cases**
- If a directory can't be listed (permission error), show clear message with lock icon
- If upload fails mid-queue, show which files failed with reason
- If rename produces a name conflict, surface the error clearly in the modal
- If network drops during any operation, detect and show reconnect banner
- Empty file (0 bytes) upload should succeed and display correctly
- File names with Unicode, spaces, and special characters: test and harden

**Day 7 — Internal testing and bug fixes**
- Full walkthrough of every feature in Porter
- Fix any UI inconsistencies discovered (spacing, alignment, hover states)
- Verify all operations on both `documents` and `uploads` roots
- Verify read-only banners and disabled states work correctly on root-owned paths
- Performance check: listing a directory with 200+ files should feel instant

---

### Week 2 — GitHub Repository (Days 8–14)

**Day 8 — Repo structure**

Create the following file structure ready for GitHub:
```
porter/
├── porter.py              # main server (what we have)
├── install.sh             # one-line installer
├── uninstall.sh           # clean removal
├── docker-compose.yml     # Docker Compose deployment
├── Dockerfile             # Docker image definition
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── install.md
│   ├── ssh-tunnel.md
│   ├── tailscale.md
│   ├── docker.md
│   ├── security.md
│   └── faq.md
├── LICENSE                # MIT
├── README.md              # main readme with screenshots
├── CHANGELOG.md           # version history
└── CONTRIBUTING.md        # contribution guide
```

**Day 9 — README**

The README is the product's first impression. It must be excellent.

Structure:
```
[Logo image — 120px, centred]
[One-line description]
[Badges: version, licence, Python version]

## What is Porter?
Two sentences. No jargon.

## Features
Bulleted, concrete, scannable.

## Quick Start
The fastest path from zero to running.
$ curl -sSL https://get.porter.sh | bash

## Screenshots
3 screenshots: file browser, upload in progress, mobile

## Installation Methods
1. Direct Python (one-liner)
2. Docker Compose
3. Manual

## Access via SSH Tunnel
The two commands needed.

## Access via Tailscale
Three lines.

## Configuration
The SERVE_DIRS dict. Nothing else needed.

## Security
What Porter does and does not protect.

## Roadmap
Link to GitHub Projects board.

## Contributing
Link to CONTRIBUTING.md

## Licence
MIT
```

**Day 10 — install.sh**

One-line installer that:
1. Detects OS (Ubuntu/Debian/CentOS/Arch)
2. Checks Python 3.8+ is available
3. Downloads porter.py to `/usr/local/bin/porter/`
4. Creates a systemd user service
5. Prints the SSH tunnel command with the user's public IP auto-detected
6. Prints `Porter is running at http://localhost:8877`

```bash
curl -sSL https://get.porter.sh | bash
```

The `get.porter.sh` URL will be a redirect from the website to the raw GitHub install.sh. **🙋 USER: domain purchase needed before this URL works.**

**Day 11 — Dockerfile and Docker Compose**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY porter.py .
EXPOSE 8877
CMD ["python3", "porter.py"]
```

`docker-compose.yml`:
```yaml
version: '3'
services:
  porter:
    image: ghcr.io/[username]/porter:latest
    ports:
      - "127.0.0.1:8877:8877"
    volumes:
      - ~/documents:/data/documents
      - ~/uploads:/data/uploads
    restart: unless-stopped
```

Note: The Docker image binds to `0.0.0.0` inside the container but the compose file maps it to `127.0.0.1` on the host — preserving the security model.

**Day 12 — Documentation: install.md and ssh-tunnel.md**

`docs/install.md` — covers all three install methods with copy-paste commands for Ubuntu, macOS (for local testing), and Docker.

`docs/ssh-tunnel.md` — step-by-step guide:
1. What an SSH tunnel is (one paragraph, no assumed knowledge)
2. The exact command with explanations of each flag
3. Making it persistent (using `-fN` flag)
4. Setting up an SSH config alias
5. Troubleshooting (port already in use, connection refused)

**Day 13 — Documentation: tailscale.md and security.md**

`docs/tailscale.md`:
1. What Tailscale is and why it works for Porter
2. Install Tailscale on VPS
3. The two SSH tunnel commands (with public IP vs Tailscale IP)
4. Binding Porter to the Tailscale interface directly (advanced option)

`docs/security.md`:
1. What Porter does protect (localhost binding, path traversal prevention)
2. What Porter does not protect (no authentication, no HTTPS on its own)
3. Recommended security posture (SSH tunnel or Tailscale)
4. What NOT to do (never expose port 8877 to the public internet)
5. Running Porter behind a reverse proxy with basic auth (nginx example)

**Day 14 — CHANGELOG, CONTRIBUTING, LICENSE, issue templates**

`CHANGELOG.md` — follows Keep a Changelog format, v0.1.0 entry.

`CONTRIBUTING.md` — covers: how to file a bug, how to propose a feature, code style (PEP8, no external dependencies in core), PR process.

`LICENSE` — MIT, with the user's name. **🙋 USER: confirm name for copyright line.**

GitHub issue templates — bug report template asks for OS, Python version, install method, steps to reproduce. Feature request asks for the use case, not just the feature.

---

### Week 3 — Screenshots and Launch Prep (Days 15–20)

**Day 15 — Screenshot generation**

Create a dedicated screenshot directory with realistic demo content:
- Populate `documents/` with representative folders and files (PDFs, code files, images, a markdown file) for realistic screenshots
- Take screenshots showing:
  1. Main file browser (documents root, 8 items visible)
  2. Upload in progress (progress bar visible)
  3. Rename modal open
  4. Preview panel showing a markdown file
  5. Mobile view at 390px

**Day 16 — Logo assets**

Generate all required logo asset variants from the SVG mark:
- `logo-mark.svg` — icon only (40×40)
- `logo-wordmark.svg` — icon + "porter" text (200×40)
- `logo-wordmark-dark.svg` — for light backgrounds (black text)
- `logo-mark-16.png` — favicon
- `logo-mark-32.png` — high-res favicon
- `logo-mark-512.png` — app icon / social sharing
- `og-image.png` — 1200×630 social sharing card (dark background, logo centred, one-liner below)

**Day 17 — Version tagging and release**

- Tag `v0.1.0` in git
- Write GitHub Release notes (what's included, what's not yet, upgrade path)
- Attach `porter.py` as a release asset for users who want manual download
- **🙋 USER: create GitHub repo and push. Provide repo URL so subsequent steps can reference it.**

**Day 18 — awesome-selfhosted submission**

awesome-selfhosted is the highest-traffic discovery channel for self-hosted tools.

Prepare the PR submission:
- Category: `File Transfer & Synchronization`
- Entry format: `[Porter](https://github.com/[user]/porter) - Modern browser-based file manager for self-hosted VPS. Upload, download, rename, delete. SSH tunnel and Tailscale native. ([Source Code](https://github.com/[user]/porter)) AGPL-3.0 Python`
- Follow their exact format requirements for the PR

**Day 19 — Product Hunt preparation**

Draft all Product Hunt assets:
- Tagline (60 chars max): `Modern file manager for your VPS — browser-based, Tailscale-ready`
- Description (260 chars max)
- First comment (the maker's comment — explain the why and what)
- Gallery: 5 screenshots in order
- Topics: Developer Tools, Open Source, Productivity, File Management

Do not launch yet — hold for the HN post to land first.

**Day 20 — Final pre-launch checklist**

- [ ] porter.py passes Python linting (pyflakes, no warnings)
- [ ] All docs links work
- [ ] install.sh tested on a clean Ubuntu 22.04 VM
- [ ] Docker image builds and runs correctly
- [ ] README screenshots display correctly on GitHub
- [ ] Licence year and name correct
- [ ] GitHub repo description, topics, and website URL set
- [ ] Social preview image uploaded to repo settings

---

## Phase 2 — Website & Community Launch (Days 21–40)

**Goal:** Live marketing website. Community discovery. First 100 GitHub stars.

---

### Week 4 — Marketing Website (Days 21–27)

**Day 21 — Website architecture**

The Porter website is a static site. No framework, no build step. Raw HTML, CSS, and minimal JS. Hosted on GitHub Pages (free) or Netlify (free tier). The domain will point here.

File structure:
```
website/
├── index.html         # landing page
├── docs/              # symlink or copy of repo docs/
├── assets/
│   ├── css/main.css
│   ├── js/main.js
│   ├── img/
│   │   ├── screenshot-1.png
│   │   ├── screenshot-2.png
│   │   └── og-image.png
│   └── logo/
│       ├── mark.svg
│       └── wordmark.svg
├── favicon.ico
└── CNAME              # for custom domain
```

**🙋 USER: purchase domain. Recommended: `porter.sh` or `useporter.dev` or `getporter.sh`. Budget: $12–20/year.**

**Day 22 — Landing page: hero and features**

Hero section:
```
[Logo]
The file manager your VPS deserves.

Browser-based. Tailscale-ready. Open source.

[Get started — free]    [View on GitHub]

[Product screenshot — animated GIF or static]
```

Features section (3 columns):
- **Browser-based** — No software to install on your local machine. Open a tab, manage your files.
- **SSH tunnel native** — One command connects your browser to your VPS securely.
- **Tailscale-ready** — Works seamlessly over your private Tailscale network.
- **Upload anywhere** — Drop files into any folder, not just a fixed upload directory.
- **Download anything** — Click any file to download it instantly.
- **Open source** — MIT licence. Run it yourself, forever, for free.

**Day 23 — Landing page: quick start, pricing preview, footer**

Quick start section:
```bash
# Install Porter on your VPS
curl -sSL https://get.porter.sh | bash

# Then on your local machine:
ssh -fN -L 8877:localhost:8877 user@your-vps
```
```
Open http://localhost:8877
```

Pricing section (simple, honest):
```
Self-hosted         Porter Cloud (coming soon)
──────────          ──────────────────────────
Free, forever       $12/month
MIT licence         Managed, zero config
Community support   Email support + SLA
                    [Join waitlist]
```

Footer: GitHub link, docs link, licence, "Made with ☕ — Porter is open source."

**Day 24 — Website styling**

Apply Porter's design language to the website:
- Same colour palette (--bg: #0a0a0a, --accent: #f7931a)
- Clean section structure with generous whitespace
- Mobile-responsive (the marketing site must work on phones even if the app doesn't need to)
- No external CSS framework — write clean custom CSS
- Load time: under 300ms on a cold connection (no web fonts, no analytics yet)

**Day 25 — Website deployment**

- Deploy to GitHub Pages from `/website` directory
- **🙋 USER: point DNS to GitHub Pages. Requires adding A records and CNAME.**
- Set up redirect: `get.porter.sh/install.sh` → raw install script on GitHub
- Verify HTTPS works via GitHub Pages (automatic via Let's Encrypt)
- Test on mobile, Firefox, and Safari

**Day 26 — SEO and meta tags**

Every page gets:
```html
<title>Porter — File manager for your VPS</title>
<meta name="description" content="Browser-based file manager for self-hosted VPS. Upload, download, rename, delete. SSH tunnel and Tailscale native. Free and open source.">
<meta property="og:title" content="Porter">
<meta property="og:image" content="/assets/img/og-image.png">
```

Submit sitemap.xml to Google Search Console.
**🙋 USER: verify domain ownership in Google Search Console.**

Target keywords:
- "self-hosted file manager"
- "web file manager VPS"
- "browser based SFTP client"
- "Tailscale file transfer"

**Day 27 — Plausible Analytics**

Set up Plausible Analytics (self-hosted, using our own VPS — fitting). Track:
- Page views on landing page
- Clicks on "Get started" and "View on GitHub"
- Clicks on "Join waitlist"

This gives data for the cloud tier launch without any privacy compromise.

---

### Week 5 — Community Launch (Days 28–34)

**Day 28 — Hacker News "Show HN"**

Title: `Show HN: Porter – A modern, browser-based file manager for your VPS`

Opening comment structure (write in advance):
1. Why I built this (the problem with existing SFTP clients)
2. How it works (3 sentences)
3. The SSH tunnel model (why this is the right security approach)
4. What's next (the roadmap)
5. Known limitations (honest)
6. Link to repo and one-line install

**🙋 USER: post this from your personal HN account. A first-time submission from a new account has lower visibility. Your account matters.**

**Day 29 — Reddit launch**

Two posts prepared and ready:
1. `r/selfhosted` — "I built a modern web file manager for VPS — Porter"
2. `r/homelab` — same, with more emphasis on home server use case

Content is different for each subreddit. Read the room: r/selfhosted appreciates technical detail and self-hosted philosophy; r/homelab appreciates ease of use and screenshots.

Do NOT post both on the same day. Post r/selfhosted same day as HN, r/homelab two days later.

**Day 30 — Respond to all feedback**

Spend the entire day reading and responding to HN and Reddit comments. Do not be defensive. Treat every criticism as a product brief.

Keep a running "feedback log" in `documents/porter/feedback-log.md`. Categorise:
- Bug reports (fix this week)
- Feature requests (add to roadmap)
- Questions (add to FAQ)
- Hostile comments (ignore politely)

**Day 31 — Fix quick wins from launch feedback**

Based on the feedback log, implement the top 3–5 quick fixes. These are items that:
- Take under 2 hours each
- Unblock people from using Porter
- Are explicitly mentioned by multiple people

Ship as `v0.1.1` patch release. Announce in the HN thread as an edit.

**Day 32 — Dev.to article**

Title: `How I built a modern file manager for VPS in Python — no dependencies`

Content:
1. The problem (why SFTP clients are painful)
2. The architecture decision (serve from the VPS itself)
3. The security model (SSH tunnel)
4. Technical implementation highlights (multipart parser, path traversal prevention)
5. What I'd do differently
6. What's next

This is the permanent SEO asset — it will rank for "Python file manager" and "self-hosted file manager" search terms.

**Day 33 — Twitter/X presence**

Create `@useporter` (or `@portersh`) account. Post:
1. Launch announcement with screenshots (Day 28)
2. "How it works" thread (Day 32)
3. Screenshot of feedback being implemented (Day 31)

Keep the account active: reply to anyone who mentions Porter, retweet relevant selfhosting content.

**Day 34 — Discord community**

Set up a Discord server for Porter:
- Channels: #announcements, #general, #help, #bugs, #feature-requests, #show-and-tell
- Bot: simple welcome message, link to docs
- Add Discord invite link to README, website footer, and docs

---

### Week 6 — Product Hunt and Consolidation (Days 35–40)

**Day 35 — Product Hunt launch**

Launch on Product Hunt using the assets prepared on Day 19.

Best day to launch: Tuesday or Wednesday. Best time: 12:01 AM Pacific.

**🙋 USER: Product Hunt launches are most effective when the maker has an existing PH account with karma. Consider reaching out to your network for upvotes on launch day.**

**Day 36-37 — Respond to Product Hunt comments**

Same as HN: respond to every comment within 24 hours. Update feedback log.

**Day 38 — Weekly update post**

Post a brief "Week 1 in public" update on Twitter and Dev.to:
- GitHub stars so far
- Top 3 most requested features
- What's being built next

Building in public creates momentum and accountability.

**Day 39 — awesome-selfhosted PR merge follow-up**

If the awesome-selfhosted PR from Day 18 hasn't merged yet, check for reviewer feedback and respond. This list drives significant organic traffic — it's worth nurturing.

**Day 40 — Phase 2 retrospective**

Measure against the exit criteria (100 GitHub stars). If not there:
- Identify which channels drove the most traffic
- Double down on those
- Plan additional outreach

If already past 100 stars: move to Phase 3 immediately.

---

## Phase 3 — Feature Depth: Porter v0.2 (Days 41–65)

**Goal:** Features that justify a repeat visit and make Porter indispensable.

---

### v0.2 Feature Set

**Day 41–43 — Move and copy files**
- Drag a file onto a folder to move it
- Right-click → "Move to…" opens a folder picker dialog
- Right-click → "Duplicate" creates a copy in the same directory with `(copy)` suffix
- Backend: `POST /api/move`, `POST /api/copy`

**Day 44–46 — Bulk select and operations**
- Checkbox on each row (visible on hover, always visible when any checked)
- "Select all" in list header
- Selection toolbar appears when any items checked: "X selected | Download as ZIP | Delete | Move to…"
- Download as ZIP: server zips selected files and streams the result
- Backend: `POST /api/zip` (accepts array of paths, returns streamed zip)

**Day 47–49 — Search**
- Search input in toolbar (was stubbed in Day 3)
- Searches current directory and all subdirectories
- Returns results with path, type, size, modified
- Highlights matching substring in filename
- Backend: `GET /api/search?root=&path=&q=`
- No indexing — walk the directory tree on demand (fast enough for typical VPS file counts)

**Day 50–52 — Inline text editor**
- Click a text file (`.md`, `.txt`, `.sh`, `.py`, `.js`, `.json`, `.yaml`, `.toml`, `.env`) → preview panel shows editable content
- "Edit" button in preview switches to edit mode
- Save with Cmd/Ctrl+S
- Unsaved changes warning on close
- Backend: `POST /api/write` (accepts root, path, content)
- No syntax highlighting in v0.2 — plain textarea, styled well. Syntax highlighting is a v0.3 feature.

**Day 53–55 — Activity log**
- Every write operation (upload, delete, rename, move, mkdir, edit) is appended to a log file: `~/.porter/activity.log`
- Log format: `2026-03-15T10:23:44 UPLOAD documents/cascade/report.pdf (42KB)`
- New sidebar section: "Activity" — last 50 events, reverse chronological
- Useful for teams and for debugging

**Day 56–58 — Bookmarks / Pinned folders**
- Right-click any folder → "Pin to sidebar"
- Pinned folders appear in sidebar under "Pinned" section
- Stored in `~/.porter/config.json`
- Drag to reorder in sidebar
- Useful when working deep in a directory tree

**Day 59–61 — Storage usage display**
- Show disk usage in sidebar footer: `74 GB free of 96 GB`
- Show folder size on hover (computed async, shown after 300ms)
- Backend: `GET /api/diskinfo` — returns total and free bytes for the VPS disk

**Day 62–63 — v0.2 testing**
- Full regression test of all v0.2 features
- Test bulk operations with 50+ files
- Test search on a directory tree with 500+ files
- Fix any regressions in v0.1 features

**Day 64 — v0.2 release**
- Tag `v0.2.0`
- Write detailed release notes (new features, screenshots for each)
- Update README
- Update CHANGELOG

**Day 65 — Announce v0.2**
- Update HN thread or post a new "Show HN" for the major release
- Tweet with GIF of the new features (bulk select, search, inline edit are all visually striking)
- Post in Discord

---

## Phase 4 — Integrations & API (Days 66–85)

**Goal:** One-click deployments and programmatic access that bring Porter to new users.

---

### Docker Distribution (Days 66–70)

**Day 66–67 — Docker image**

Optimised `Dockerfile`:
```dockerfile
FROM python:3.12-alpine
RUN adduser -D porter
USER porter
WORKDIR /home/porter
COPY porter.py .
EXPOSE 8877
CMD ["python3", "-u", "porter.py"]
```

Alpine base: image size ~50MB. No root processes.

Build and push to:
- GitHub Container Registry (`ghcr.io/[user]/porter`)
- Docker Hub (`docker.io/[user]/porter`)

Tag strategy: `latest`, `v0.2.0`, `v0.2`

**Day 68 — GitHub Actions CI/CD**

`.github/workflows/release.yml`:
- Trigger: new version tag pushed
- Steps: lint Python, build Docker image, push to GHCR and Docker Hub, create GitHub Release
- Automated forever after

**🙋 USER: add DOCKER_USERNAME and DOCKER_PASSWORD to GitHub repo secrets.**

**Day 69–70 — Docker Compose and documentation**

Update `docker-compose.yml` to support configurable volume mounts via environment variables.

Write `docs/docker.md` with:
- Copy-paste Docker run command
- Docker Compose with example volumes
- How to update Porter via Docker
- SSH tunnel command (same as native — the port is the same)

---

### Coolify Integration (Days 71–75)

**Day 71–72 — Coolify one-click template**

Coolify supports custom application templates. Create a Porter template:
- Template file: `coolify-template.json`
- Configuration: exposes port 8877 (bound to Tailscale interface if present), mounts user home directory
- Environment variables: `PORTER_DOCS_PATH`, `PORTER_UPLOADS_PATH`

Submit as a PR to the Coolify community templates repository.

**Day 73 — Coolify documentation**

`docs/coolify.md`:
- What Coolify is (one paragraph)
- One-click deploy steps (with screenshots)
- How to configure volume paths
- SSH tunnel from Coolify-hosted VPS

**Day 74–75 — Test Coolify deployment**

Deploy Porter via Coolify on a test VPS. Verify the one-click experience actually works end-to-end. Fix any issues.

---

### Portainer Template (Days 76–79)

**Day 76–77 — Portainer App Template**

Portainer supports custom app templates via a JSON definition. Create:
```json
{
  "version": "2",
  "templates": [{
    "type": 1,
    "title": "Porter",
    "description": "Modern browser-based file manager for your VPS",
    "categories": ["Other"],
    "platform": "linux",
    "logo": "https://useporter.dev/assets/img/logo-mark-512.png",
    "image": "ghcr.io/[user]/porter:latest",
    "ports": ["8877/tcp"],
    "volumes": [{"container": "/data"}]
  }]
}
```

Submit to the official Portainer community templates repository.

**Day 78–79 — Test and document Portainer deployment**

Same approach as Coolify: test it, fix it, document it.

---

### REST API (Days 80–85)

**Day 80–82 — API foundation**

Porter gets a proper REST API, enabling automation and integration:

```
GET    /api/v1/list?root=&path=       List directory
GET    /api/v1/download?root=&path=   Download file
POST   /api/v1/upload                 Upload file
POST   /api/v1/delete                 Delete file or folder
POST   /api/v1/rename                 Rename
POST   /api/v1/mkdir                  Create folder
POST   /api/v1/move                   Move file or folder
GET    /api/v1/search?root=&q=        Search
GET    /api/v1/diskinfo               Disk usage
```

All endpoints return consistent JSON:
```json
{ "ok": true, "data": {...} }
{ "ok": false, "error": "Permission denied", "code": 403 }
```

**Day 83 — API key authentication**

Add optional API key support (off by default for backward compatibility):
- Set `PORTER_API_KEY=your-secret-key` environment variable to enable
- All `/api/v1/` requests then require `Authorization: Bearer your-secret-key`
- Without the env var, API is open (SSH tunnel provides the security layer)

**Day 84–85 — API documentation**

`docs/api.md` with:
- Authentication section
- Every endpoint documented with request/response examples
- `curl` examples for every operation
- Python example using `requests`
- Shell script example (auto-backup a VPS directory to local machine)

---

## Phase 5 — Cloud Tier (Days 86–100)

**Goal:** Open a paid waitlist, onboard the first 10 beta users, validate the $12/month price.

---

**Day 86–88 — Authentication system**

Porter needs user authentication before it can be multi-user.

Implementation:
- Simple username/password auth (bcrypt hashed, stored in `~/.porter/users.json`)
- Session cookie (signed, 24-hour expiry)
- Login page: same dark design, minimal
- Protected routes: all `/api/` and the main page require authentication when auth is enabled
- Auth is disabled by default (backward compatible — existing users unaffected)
- Enable by setting `PORTER_AUTH=true` and running `porter useradd [username]`

**Day 89–90 — Multi-server connection UI**

In preparation for the cloud tier, add the UI for managing multiple server connections:
- New "Servers" section in sidebar
- Add server: name, SSH host, user, key path, port
- Connect: establishes SSH tunnel automatically (subprocess `ssh -fN`)
- Porter becomes the hub — one running instance on the user's machine connects to multiple VPS

**🙋 USER: this is the key cloud tier value proposition. Confirm direction before building.**

**Day 91–92 — Cloud tier landing page section**

Update the Porter website with a proper cloud tier section:
```
Porter Cloud — Coming Soon

Everything in self-hosted, plus:
✓ Managed hosting — no VPS required
✓ Automatic Tailscale integration
✓ Multi-user access with permissions
✓ Activity audit log
✓ Email support + 99.5% SLA

$12/month · No credit card for waitlist

[Join the waitlist] [email input]
```

**Day 93 — Waitlist infrastructure**

Simple waitlist implementation:
- Form posts to `POST /waitlist` on the website server
- Emails stored in a CSV file on the VPS (simple, private, no third-party dependency)
- Confirmation email sent via SMTP
- **🙋 USER: provide SMTP credentials (Gmail app password or similar).**

**Day 94–95 — Stripe integration (groundwork)**

Set up Stripe account and integrate payment links:
- **🙋 USER: create Stripe account, provide API keys.**
- Create Stripe Product: "Porter Cloud Starter" at $12/month
- Create Stripe Checkout session endpoint: `POST /checkout`
- Success page after payment

**Day 96–97 — Beta onboarding**

Select 5–10 users from the waitlist for private beta:
- Send personal email explaining beta, limitations, and how to give feedback
- Set up a private Discord channel for beta users
- Give each beta user a coupon code for 3 months free
- Weekly feedback call (30 minutes, optional)

**Day 98 — Infrastructure for cloud tier**

Document the infrastructure plan for Porter Cloud:
- Compute: DigitalOcean Droplet or Hetzner CX21 per tenant (isolation)
- Billing: Stripe subscriptions
- Provisioning: script that spins up a VPS, installs Porter, configures Tailscale, and sends access credentials
- **🙋 USER: review and approve infrastructure spend before provisioning.**

**Day 99 — v0.3 tag and cloud beta announcement**

- Tag `v0.3.0` with auth, multi-server, and API features
- Announce cloud beta to waitlist
- Post "Porter Cloud is in beta" on Twitter, HN, Dev.to, Discord

**Day 100 — Retrospective and Day 101 planning**

Review against all targets:
- [ ] GitHub stars: target 200
- [ ] awesome-selfhosted listing: live
- [ ] Docker Hub pulls: target 500
- [ ] Waitlist sign-ups: target 50
- [ ] Cloud beta users: target 10
- [ ] Revenue: target first $120 (10 users × $12)

Write the next 100-day plan based on what worked and what didn't.

---

## Decision Points Summary (All 🙋 USER Items)

| Day | Action required | Estimated time |
|---|---|---|
| 14 | Confirm name for MIT licence copyright line | 2 minutes |
| 17 | Create GitHub repo, push code, provide repo URL | 15 minutes |
| 25 | Purchase domain, point DNS to GitHub Pages | 30 minutes |
| 26 | Verify domain in Google Search Console | 10 minutes |
| 28 | Post HN "Show HN" from personal account | 10 minutes |
| 35 | Post Product Hunt launch from personal account | 10 minutes |
| 68 | Add Docker secrets to GitHub repo | 5 minutes |
| 89 | Confirm multi-server UI direction | 15 minutes |
| 93 | Provide SMTP credentials for waitlist emails | 5 minutes |
| 94 | Create Stripe account, provide API keys | 30 minutes |
| 98 | Review and approve cloud infrastructure spend | 15 minutes |

**Total user time required across 100 days: approximately 3 hours.**

---

## Tech Stack (No External Dependencies Policy)

Porter core (`porter.py`) must remain dependency-free. Pure Python standard library only. This is a feature — one file, no `pip install`, instant deploy.

Website: raw HTML/CSS/JS, no framework, no build step.

Docker: official Python Alpine image only.

The only exception is the cloud tier infrastructure, which will use standard cloud provider tooling.

---

## File Deliverables by Day 100

```
documents/porter/
├── porter.py              ← production-ready v0.3
├── install.sh
├── uninstall.sh
├── Dockerfile
├── docker-compose.yml
├── coolify-template.json
├── portainer-template.json
├── .github/
│   ├── workflows/release.yml
│   └── ISSUE_TEMPLATE/
├── docs/
│   ├── install.md
│   ├── ssh-tunnel.md
│   ├── tailscale.md
│   ├── docker.md
│   ├── coolify.md
│   ├── portainer.md
│   ├── security.md
│   ├── api.md
│   └── faq.md
├── website/
│   ├── index.html
│   └── assets/
├── assets/
│   └── logo/ (all variants)
├── whitepaper.md
├── design-guide.md
├── commercialisation.md
├── implementation-plan.md  ← this file
└── feedback-log.md         ← created at launch
```

---

*This plan is a living document. Update it as feedback shapes priorities.*
*Last updated: 2026-02-22*
