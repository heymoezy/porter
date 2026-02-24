# Porter — 30-Day Rollout Strategy
**Start date:** 2026-02-23 (today)
**End date:** 2026-03-25
**Current version:** v0.4 (feature-complete for launch)

> This document supersedes `implementation-plan.md` and `commercialisation.md`.
> Both are archived in place but this is the live plan.

---

## Current State (v0.4, Day 0)

Porter is already further along than the old 100-day plan assumed at day 65.

**Shipped:**
- Multi-root file browser (documents, uploads, websites)
- Upload queue, download, rename, delete, duplicate, move, bulk ZIP
- File preview: text, images, PDF
- Inline text editor (save in-place)
- Bulk select + selection toolbar
- Search: always visible, grouped by folder, match highlighting
- Sort by name / size / modified
- Keyboard shortcuts (`/`, `n`, `u`, `r`, `Backspace`, `?`, `Esc`)
- Disk usage bar in sidebar footer
- Changelog modal (v0.1–v0.4 history)
- Warm dark theme, geometric P logo

**Not yet shipped:**
- Configurable locations (hardcoded `SERVE_DIRS`)
- GitHub repository (not created)
- Marketing website (not built)
- SSH location type
- Mobile-responsive layout
- Activity log
- Authentication
- Docker distribution
- Cloud tier / waitlist

---

## Competitive Positioning (unchanged)

Porter's clearest moat: **the first file manager built for how developers actually work in 2026.**

| | Cyberduck | FileZilla | Filestash | FileBrowser | **Porter** |
|---|---|---|---|---|---|
| Browser-based | ✗ | ✗ | ✓ | ✓ | ✓ |
| SSH tunnel native | ✗ | ✗ | ✗ | ✗ | ✓ |
| Tailscale first-class | ✗ | ✗ | ✗ | ✗ | ✓ |
| Modern UX | ~ | ✗ | ~ | ~ | ✓ |
| Cloud option | ✗ | ✗ | ✗ | ✗ | ✓ (planned) |

No serious competitor has configurable locations, SSH integration, or GitHub sync. That's our Week 3 moat.

---

## Pricing Model (confirmed)

**Tier 0 — Self-Hosted (free, MIT licence)**
Everything Porter is today. Run it yourself forever.

**Tier 1 — Porter Cloud (planned, $12/month Starter · $24/month Team)**
- Starter: managed hosting, zero-config Tailscale, automatic updates, SSL
- Team: multi-user permissions, activity audit log, up to 5 server connections, email support

**Never freemium-trap the core.** Power features that solo devs need stay free. Revenue comes from managed hosting — not feature-gating.

**Revenue maths:**
- Break-even: ~40 Starter users (~$500/month infra)
- Base case year 1: 80 Starter + 20 Team = ~$1,440/month MRR
- 5–10% of self-hosted installs convert. 1,000 installs → 50–100 paid users.

---

## Locations Architecture (Design Decision)

### Today: hardcoded
```python
SERVE_DIRS = {
    "documents": Path("/home/lobster/documents"),
    "uploads":   Path("/home/lobster/uploads"),
    "websites":  Path("/home/websites"),
}
```

### Week 3: configurable JSON
`~/.porter/config.json` stores locations. Porter reads this at startup (and via API). UI lets you add, remove, rename.

### Location types (roadmap, not all Week 3)

| Type | Status | Description |
|---|---|---|
| **Local** | Week 3 | A directory on the machine running Porter. What we have today. |
| **SSH** | Week 3 | Remote directory accessed via SSH. Porter manages the connection. Setup wizard captures: host, user, port, key path. This is the onboarding flow. |
| **GitHub** | Week 4+ | A GitHub repository. Porter shows files from the repo, allows editing and committing. Makes Porter useful as a web-based repo browser and lightweight editor. |
| **Google Drive** | Future | OAuth-connected Drive folder. Treat remote files as local. |
| **Dropbox** | Future | Same model. |
| **S3 / R2** | Future | Bucket as a location. Already popular in Filestash — clear demand. |

### Onboarding wizard
When Porter starts with no config file, show a setup wizard instead of an empty sidebar:
1. "What would you like to manage?" → Local folders / Remote server via SSH / GitHub repo
2. Walk through adding the first location
3. Generate `~/.porter/config.json`
4. Redirect to the file browser

This turns a cold start into a product-guided experience — crucial for the cloud tier where users won't have a pre-configured VPS.

---

## 30-Day Plan

### Week 1 — Ship to GitHub (Days 1–7)
**Goal:** Porter v0.4 is live on GitHub with a proper README and one-line installer.

| Day | Deliverable | Owner |
|---|---|---|
| 1 | GitHub repo: README, install.sh, Dockerfile, docker-compose.yml, .github/ templates | Claude |
| 2 | docs/: install.md, ssh-tunnel.md, tailscale.md, security.md, faq.md | Claude |
| 3 | Coolify template + Portainer template | Claude |
| 4 | Push to GitHub, set repo description, topics, social preview | 🙋 User (15 min) |
| 5 | Marketing website: hero + features + quick start + pricing preview | Claude |
| 6 | Website deployment to GitHub Pages, DNS, HTTPS | 🙋 User (30 min) |
| 7 | SEO tags, Google Search Console verification | 🙋 User (10 min) |

---

### Week 2 — Community Launch (Days 8–14)
**Goal:** First 50 GitHub stars. HN front page.

| Day | Deliverable | Owner |
|---|---|---|
| 8 | Product Hunt assets prepared (tagline, description, gallery order) | Claude |
| 9 | Hacker News "Show HN" posted | 🙋 User (10 min) |
| 10 | Reddit r/selfhosted + r/homelab posts (different copy per sub) | Claude drafts, User posts |
| 11 | Respond to all HN/Reddit feedback all day | 🙋 User |
| 12 | Fix top 3 quick-win bugs from feedback → v0.4.1 patch | Claude |
| 13 | Dev.to article: "How I built a dep-free web file manager in Python" | Claude |
| 14 | Product Hunt launch (Tue/Wed only — check calendar) | 🙋 User |

---

### Week 3 — Locations + SSH + Depth (Days 15–21)
**Goal:** Configurable locations, SSH support. The moat no competitor has.

| Day | Deliverable | Notes |
|---|---|---|
| 15 | Config system: `~/.porter/config.json` replaces hardcoded `SERVE_DIRS` | Backward-compatible — reads env/defaults if no config |
| 16 | Locations UI: manage locations modal (add / rename / remove) | Porter v0.5 |
| 17 | SSH location type: setup wizard (host, user, port, key) | Uses stdlib `subprocess` to open `ssh -fN` tunnel |
| 18 | Onboarding wizard: cold-start → guided setup | Shown only when config.json is absent |
| 19 | Activity log: `~/.porter/activity.log` + sidebar panel (last 50 events) | Porter v0.5 |
| 20 | Mobile-responsive layout: sidebar collapses below 768px | Pure CSS, no JS |
| 21 | v0.5 release + announce | Update changelog modal, tag release |

---

### Week 4 — Auth + Cloud Waitlist (Days 22–30)
**Goal:** Authentication live. Waitlist open. First paid signal.

| Day | Deliverable | Notes |
|---|---|---|
| 22 | GitHub location type: read-only browser of a public or private repo | Uses GitHub API, no local clone needed |
| 23 | Auth system: username/password, bcrypt, session cookie | Disabled by default — `PORTER_AUTH=true` to enable |
| 24 | Login page (same dark design, minimal) | Protected routes when auth enabled |
| 25 | REST API v1: all endpoints with consistent JSON schema | `/api/v1/` prefix, Bearer token optional |
| 26 | Cloud tier landing page section on marketing website | "Porter Cloud — Coming Soon" + email capture |
| 27 | Waitlist backend: POST /waitlist → CSV on VPS | No third-party dependency, SMTP confirmation |
| 28 | Stripe groundwork: product created, checkout session endpoint stubbed | 🙋 User: create Stripe account |
| 29 | v0.6 release: auth + API + REST docs | Update changelog |
| 30 | Announce cloud beta via waitlist email + HN/Reddit follow-up post | 🙋 User |

---

## Decision Points (🙋 User Actions)

| Day | Action | Time |
|---|---|---|
| 4 | Create GitHub repo, push code, share repo URL | 15 min |
| 4 | Confirm name for MIT licence copyright line | 2 min |
| 6 | Purchase domain (`porter.sh` / `useporter.dev`), point DNS | 30 min |
| 7 | Verify domain in Google Search Console | 10 min |
| 9 | Post HN "Show HN" from your personal account | 10 min |
| 11 | Read + respond to community feedback all day | 1–3 hrs |
| 14 | Product Hunt launch (from personal account with existing karma) | 30 min |
| 28 | Create Stripe account, provide publishable + secret keys | 30 min |
| 30 | Send waitlist announcement email, post follow-up | 20 min |

**Total user time in 30 days: ~6 hours.**

---

## What's NOT Being Built (and Why)

- **Terminal** — Porter's clarity of purpose (files, not SSH) is a differentiator. The moment you add a terminal, you become "just another web SSH client."
- **Chrome extension** — Technically impossible for remote file management. Dead end.
- **AGPL licence** — Kills corporate adoption. MIT only.
- **Per-seat pricing** — Developers hate it for infra tools. Charge per server or per org.
- **Full-text file search** — Nice to have, deprioritised. Server-side grep is complex and slow. Phase 5 territory.
- **Syntax highlighting** — Monaco or CodeMirror would break the zero-dependency rule. Out of scope until cloud tier (where we can serve assets).

---

## Tech Stack Policy

**Porter core (`porter.py`):** pure Python stdlib, zero external dependencies. This is a feature, not a constraint. One file, no pip install, instant deploy.

**Website:** raw HTML/CSS/JS, no framework, no build step.

**Docker:** official Python Alpine image only.

**SSH locations:** Python `subprocess` wrapping system `ssh`. No Paramiko, no asyncssh.

**GitHub integration:** Python `urllib` hitting the GitHub API. No `requests`, no `PyGithub`.

**The only exception:** cloud tier infrastructure tooling (Stripe SDK in a separate cloud service, not in porter.py).

---

## File Structure at Day 30

```
documents/porter/
├── porter.py              ← v0.6, production-ready
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
│   ├── security.md
│   ├── api.md
│   └── faq.md
├── website/
│   └── index.html
├── rollout-plan.md        ← this file
└── design-guide.md
```

---

## Exit Criteria at Day 30

- [ ] Porter is live on GitHub with 50+ stars
- [ ] Marketing website is live with a working domain
- [ ] awesome-selfhosted submission PR is open
- [ ] Locations are configurable — not hardcoded
- [ ] SSH location type works end-to-end
- [ ] Onboarding wizard exists
- [ ] Authentication can be enabled
- [ ] REST API v1 is documented and working
- [ ] Waitlist is open with 20+ sign-ups
- [ ] Stripe is set up (even if no paying users yet)

---

## Next Session Targets (Today)

Given ~46% API budget remaining, these are the implementable steps in priority order:

1. **Configurable locations** (`~/.porter/config.json` + manage locations UI)
2. **GitHub repo skeleton** (README, install.sh, Dockerfile, all docs stubs)
3. **Mobile-responsive layout** (CSS only, no JS)

Each requires approval before starting.

---

*Last updated: 2026-02-23 · Supersedes implementation-plan.md and commercialisation.md*
